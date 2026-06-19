// Supabase Edge Function: "ingest-ckan"
// Conector GENÉRICO e sob demanda para portais CKAN de dados abertos do Brasil.
//
// PORTAIS SUPORTADOS (ambos rodam CKAN, expõem a action API JSON):
//   ?portal=sp        -> Prefeitura de São Paulo  (https://dados.prefeitura.sp.gov.br)
//                        Base CKAN verificada: /api/3/action/* (package_list devolve 900+ datasets).
//   ?portal=dadosgov  -> Portal Brasileiro de Dados Abertos (https://dados.gov.br)
//                        Desde a migração de 2023 há um gateway na frente do CKAN: as rotas
//                        legadas /api/3/action/* continuam existindo, mas requisições anônimas
//                        de servidor costumam levar 401/403 do WAF. Quando o Vault tiver o
//                        segredo DADOS_GOV_TOKEN, ele é enviado no header `chave-api-dados`.
//                        Se a fonte recusar, devolvemos { ok:false, status } honesto — sem 200 mentiroso.
//
// COMO O CKAN ENTREGA DADOS (dois caminhos, nesta ordem de preferência):
//   1) datastore_search — quando o resource está no datastore do CKAN (tabular, paginado):
//        GET {base}/api/3/action/datastore_search?resource_id={rid}&limit={n}&offset={off}
//      Resposta: { success, result: { records:[...], total, fields:[...] } }
//   2) download do CSV — quando o resource NÃO está no datastore (datastore_active=false):
//        usa a `url` do resource (package_show -> resources[]) e baixa/parseia o CSV por janela.
//      ATENÇÃO: CSVs de portais municipais podem ser ENORMES; aqui baixamos só uma janela de
//      bytes (Range quando o servidor suporta) e paramos no orçamento de tempo. O cursor
//      `nextOffset` continua de onde parou (offset = nº de linhas de dados já consumidas).
//
// DESCOBERTA: se ?resource não vier, resolvemos via package_show o PRIMEIRO resource utilizável
//   (datastore_active=true, senão o primeiro CSV). O id do resource resolvido volta na resposta.
//
// NORMALIZAÇÃO -> forma canônica de entity da Fonte.ia:
//   id (estável: "{portal}:{resourceId}:{rowKey}"), kind, name, cnpj, ibge_code,
//   external_ids, attributes (campos úteis da linha) e content hash SHA-256 p/ idempotência.
//   O `kind` sai de KIND_FROM_DATASET (datasets curados de alto valor) ou do ?kind explícito;
//   default conservador = "organization". Só kinds VÁLIDOS do domínio são aceitos.
//
// GRAVAÇÃO NO D1 — MESMO MECANISMO DAS DEMAIS ingest-*:
//   Toda função ingest-* grava no Supabase Postgres via uma RPC SECURITY DEFINER
//   `ingest_<fonte>(p_payload jsonb)` que faz upsert idempotente em entities+raw_records+
//   evidence (com content hash e ON CONFLICT). O bulk do Postgres é então espelhado no
//   Cloudflare D1 pela edge `d1-bridge` (rota /migrate). NENHUMA ingest-* fala com o D1 REST
//   diretamente — fazer isso aqui "inventaria um caminho novo" e duplicaria a lógica de
//   credenciais Cloudflare que o d1-bridge centraliza. Portanto chamamos a RPica `ingest_ckan`.
//   >> Esta RPC precisa existir (migration). Contrato documentado no fim deste arquivo.
//      Enquanto a migration não for aplicada, a função coleta/normaliza e devolve um erro
//      honesto da RPC (não duplica dados, não crasha o pipeline).
//
// IDEMPOTÊNCIA: id determinístico por linha + a RPC faz upsert por (external_ids->>'ckanId').
//   Rodar duas vezes a mesma janela não duplica.
//
// ORÇAMENTO DE TEMPO: Edge Functions caem ~150s. Processamos um lote LIMITADO por invocação
//   e devolvemos `nextOffset` (cursor) para retomada; quem chama repete com ?offset=nextOffset.
//
// SECRETS: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY injetados pelo Supabase.
//          INGEST_CRON_SECRET (opcional) — se definido, exige Bearer correspondente.
//          DADOS_GOV_TOKEN (opcional, Vault) — token do gateway do dados.gov.br.
//          NENHUM segredo hardcoded.
//
// PARÂMETROS (query OU corpo JSON):
//   portal=sp|dadosgov            (obrigatório)
//   dataset={id ou slug}          (obrigatório se resource não vier — usado no package_show)
//   resource={resource_id}        (opcional; se ausente, descobrimos via package_show)
//   kind={entityKind}             (opcional; sobrepõe KIND_FROM_DATASET)
//   limit={1..1000}               (linhas por invocação; default 500)
//   offset={n}                    (cursor; default 0)
//
// Deploy: Verify JWT LIGADO (o cron/admin manda Authorization, igual às outras).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchWithRetry } from "../_shared/http.ts";
import { hasValidBearerSecret } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { digitsOnly, extractCnpj } from "../_shared/br.ts";

// ── Constantes ───────────────────────────────────────────────────────────────

const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const SOURCE_ID = "ckan"; // sourceId base; refinado p/ "ckan:{portal}" no payload
const RPC_NAME = "ingest_ckan";

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000; // teto duro por invocação (linhas)
const RPC_BATCH = 200; // itens por chamada de RPC (paridade com as demais ingest-*)
const TIME_BUDGET_MS = 115_000; // margem do limite ~150s da Edge Function
const FETCH_TIMEOUT_MS = 20_000;
const CSV_WINDOW_BYTES = 3_000_000; // janela de bytes ao baixar CSV fora do datastore

// kinds válidos do domínio (packages/domain). Mantido em sincronia manual — qualquer kind
// fora desta lista é rejeitado para não sujar o grafo.
const VALID_KINDS = new Set<string>([
  "organization",
  "sanction",
  "environmental_infraction",
  "legal_process",
  "public_contract",
  "bidding_opportunity",
  "municipality",
  "politician",
  "legal_proposition",
  "trademark",
  "parliamentary_expense",
  "legislative_vote",
  "company",
]);

// ── Portais CKAN ─────────────────────────────────────────────────────────────

interface PortalConfig {
  /** Slug interno usado no sourceId/external ids. */
  key: "sp" | "dadosgov";
  /** Base do site (para montar links de evidência). */
  site: string;
  /** Base da action API CKAN (terminando em /api/3/action). */
  apiBase: string;
  /** Caminho para a página humana do dataset no portal (link de evidência). */
  datasetPath: (dataset: string) => string;
  /** Nome do segredo no Vault com o token do gateway (se houver). */
  vaultTokenName?: string;
}

const PORTALS: Record<string, PortalConfig> = {
  sp: {
    key: "sp",
    site: "https://dados.prefeitura.sp.gov.br",
    apiBase: "https://dados.prefeitura.sp.gov.br/api/3/action",
    datasetPath: (d) => `https://dados.prefeitura.sp.gov.br/dataset/${encodeURIComponent(d)}`,
  },
  dadosgov: {
    key: "dadosgov",
    site: "https://dados.gov.br",
    // Rotas CKAN legadas seguem atrás do gateway. Configurável aqui caso o caminho mude.
    apiBase: "https://dados.gov.br/api/3/action",
    datasetPath: (d) => `https://dados.gov.br/dados/conjuntos-dados/${encodeURIComponent(d)}`,
    vaultTokenName: "DADOS_GOV_TOKEN",
  },
};

// ── Mapa curado dataset->kind (alto valor) ───────────────────────────────────
// GENÉRICO por padrão (default "organization"), mas alguns datasets de alto valor têm
// kind/hints conhecidos. As chaves casam por SUBSTRING (case-insensitive) no id/slug do
// dataset OU no nome do resource — portais variam o slug, então usamos contains, não igualdade.
// `cnpjFields`/`ibgeFields`/`nameFields` listam candidatos de coluna por prioridade.
interface DatasetHint {
  kind: string;
  nameFields?: string[];
  cnpjFields?: string[];
  ibgeFields?: string[];
}

const KIND_FROM_DATASET: Array<{ match: string; hint: DatasetHint }> = [
  // Contratos / empenhos / compras -> contrato público
  {
    match: "contrato",
    hint: {
      kind: "public_contract",
      nameFields: ["fornecedor", "nome_fornecedor", "razao_social", "contratado", "nm_credor", "objeto"],
      cnpjFields: ["cnpj", "cnpj_fornecedor", "cpf_cnpj", "nr_documento", "documento_fornecedor", "cnpj_cpf"],
    },
  },
  {
    match: "empenho",
    hint: {
      kind: "public_contract",
      nameFields: ["fornecedor", "nome_fornecedor", "credor", "nm_credor", "razao_social"],
      cnpjFields: ["cnpj", "cpf_cnpj", "cnpj_cpf", "nr_documento", "documento"],
    },
  },
  {
    match: "despesa",
    hint: {
      kind: "public_contract",
      nameFields: ["favorecido", "credor", "fornecedor", "nome_favorecido", "razao_social"],
      cnpjFields: ["cnpj", "cpf_cnpj", "cnpj_cpf", "documento_favorecido"],
    },
  },
  {
    match: "licitac",
    hint: {
      kind: "bidding_opportunity",
      nameFields: ["objeto", "objeto_licitacao", "descricao", "modalidade"],
      cnpjFields: ["cnpj_orgao", "cnpj"],
    },
  },
  // Servidores / folha -> pessoa física tratada como organização (sem CNPJ); nome do servidor
  {
    match: "servidor",
    hint: {
      kind: "organization",
      nameFields: ["nome", "nome_servidor", "servidor", "nm_servidor"],
    },
  },
  {
    match: "folha",
    hint: {
      kind: "organization",
      nameFields: ["nome", "nome_servidor", "servidor"],
    },
  },
  // Fornecedores / empresas -> empresa
  {
    match: "fornecedor",
    hint: {
      kind: "company",
      nameFields: ["razao_social", "nome", "nome_fantasia", "fornecedor"],
      cnpjFields: ["cnpj", "cpf_cnpj", "cnpj_cpf"],
    },
  },
];

function resolveHint(dataset: string, resourceName: string): DatasetHint | null {
  const hay = `${dataset} ${resourceName}`.toLowerCase();
  for (const entry of KIND_FROM_DATASET) {
    if (hay.includes(entry.match)) return entry.hint;
  }
  return null;
}

// ── Tipos CKAN ───────────────────────────────────────────────────────────────

interface CkanResource {
  id?: string;
  name?: string;
  format?: string;
  url?: string;
  datastore_active?: boolean;
}
interface CkanPackage {
  id?: string;
  name?: string;
  title?: string;
  resources?: CkanResource[];
}
interface CkanEnvelope<T> {
  success?: boolean;
  result?: T;
  error?: unknown;
}
interface DatastoreResult {
  records?: Array<Record<string, unknown>>;
  total?: number;
  fields?: Array<{ id?: string; type?: string }>;
}

// ── HTTP CKAN ────────────────────────────────────────────────────────────────

function buildHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { accept: "application/json", "user-agent": UA };
  // Portais com gateway (dados.gov.br) aceitam o token em `chave-api-dados`.
  if (token) h["chave-api-dados"] = token;
  return h;
}

class UpstreamError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "UpstreamError";
  }
}

async function ckanGet<T>(url: string, token: string | null): Promise<T> {
  const res = await fetchWithRetry(url, {
    timeoutMs: FETCH_TIMEOUT_MS,
    retries: 3,
    backoffMs: 800,
    init: { headers: buildHeaders(token) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new UpstreamError(`CKAN respondeu ${res.status} em ${url}: ${body.slice(0, 200)}`, res.status);
  }
  const env = (await res.json()) as CkanEnvelope<T>;
  if (env.success === false || env.result === undefined) {
    throw new UpstreamError(`CKAN success=false em ${url}: ${JSON.stringify(env.error)?.slice(0, 200)}`, 502);
  }
  return env.result;
}

// ── CSV parser defensivo (vírgula OU ponto-e-vírgula, aspas, CRLF/LF) ─────────
// Detecta o delimitador pela 1ª linha (qual aparece mais). Robusto a campos com aspas.

function detectDelimiter(headerLine: string): "," | ";" {
  let commas = 0;
  let semis = 0;
  let inQ = false;
  for (const ch of headerLine) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && ch === ",") commas++;
    else if (!inQ && ch === ";") semis++;
  }
  return semis > commas ? ";" : ",";
}

function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // ignora CR
    } else field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Baixa uma janela do CSV (Range quando suportado) e devolve as linhas como objetos.
// Retorna também `truncated` (a última linha pode estar cortada e é descartada).
async function fetchCsvRows(
  url: string,
  token: string | null,
  byteWindow: number,
): Promise<{ records: Array<Record<string, unknown>>; truncated: boolean }> {
  const res = await fetchWithRetry(url, {
    timeoutMs: FETCH_TIMEOUT_MS,
    retries: 2,
    backoffMs: 800,
    init: { headers: { ...buildHeaders(token), Range: `bytes=0-${byteWindow - 1}` } },
  });
  if (!res.ok && res.status !== 206) {
    throw new UpstreamError(`CSV respondeu ${res.status} em ${url}`, res.status);
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder("utf-8").decode(buf);
  if (text.trim() === "") return { records: [], truncated: false };

  const firstNl = text.indexOf("\n");
  const headerLine = firstNl >= 0 ? text.slice(0, firstNl) : text;
  const delimiter = detectDelimiter(headerLine);
  const all = parseCsv(text, delimiter);
  if (all.length === 0) return { records: [], truncated: false };

  const header = all[0]!.map((h) => h.trim());
  // Se a resposta foi parcial (206) e o servidor tem mais bytes, descartamos a última linha.
  const partial = res.status === 206;
  const dataRows = partial && all.length > 2 ? all.slice(1, -1) : all.slice(1);

  const records: Array<Record<string, unknown>> = [];
  for (const r of dataRows) {
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < header.length; c++) obj[header[c]!] = r[c] ?? null;
    records.push(obj);
  }
  return { records, truncated: partial };
}

// ── Descoberta de resource via package_show ──────────────────────────────────

function pickResource(pkg: CkanPackage): CkanResource | null {
  const resources = Array.isArray(pkg.resources) ? pkg.resources : [];
  // 1) Prefere resource no datastore (paginação JSON nativa).
  const inStore = resources.find((r) => r.datastore_active === true && typeof r.id === "string");
  if (inStore) return inStore;
  // 2) Senão, o primeiro CSV com url.
  const csv = resources.find(
    (r) => (r.format ?? "").toLowerCase().includes("csv") && typeof r.url === "string" && r.url !== "",
  );
  if (csv) return csv;
  // 3) Último recurso: qualquer resource com id.
  return resources.find((r) => typeof r.id === "string") ?? null;
}

// ── Helpers de normalização de linha ─────────────────────────────────────────

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Procura o 1º campo não-vazio dentre candidatos, casando colunas por nome normalizado. */
function pickField(row: Record<string, unknown>, candidates: string[] | undefined): string {
  if (!candidates || candidates.length === 0) return "";
  // Index normalizado das chaves da linha (lower, sem acento/espaço/pontuação).
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // remove marcas diacríticas combinantes
      .replace(/[^a-z0-9]/g, "");
  const index = new Map<string, unknown>();
  for (const [k, v] of Object.entries(row)) index.set(norm(k), v);
  for (const cand of candidates) {
    const v = index.get(norm(cand));
    const s = str(v);
    if (s !== "") return s;
  }
  return "";
}

/** Acha QUALQUER coluna cujo valor pareça um CNPJ (14 dígitos), além dos candidatos. */
function findAnyCnpj(row: Record<string, unknown>, candidates: string[] | undefined): string | null {
  const fromCandidate = extractCnpj(pickField(row, candidates));
  if (fromCandidate) return fromCandidate;
  for (const v of Object.values(row)) {
    const c = extractCnpj(str(v));
    if (c) return c;
  }
  return null;
}

/** Acha um código IBGE de município (7 dígitos) entre os candidatos. */
function findIbge(row: Record<string, unknown>, candidates: string[] | undefined): string | null {
  const cands = candidates ?? ["codigo_ibge", "cod_ibge", "ibge", "codigo_municipio", "cod_municipio"];
  const raw = pickField(row, cands);
  const d = digitsOnly(raw);
  return d.length === 7 ? d : null;
}

/** Chave estável da linha: usa _id do datastore, senão hash curto do conteúdo. */
async function rowKey(row: Record<string, unknown>, hash: string): Promise<string> {
  const id = row["_id"];
  if (id !== undefined && id !== null && String(id) !== "") return String(id);
  return hash.slice(0, 24); // prefixo do sha256 (estável para a mesma linha)
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface NormalizedEntity {
  id: string; // "{portal}:{resourceId}:{rowKey}"
  ckanId: string; // mesmo que id (usado pela RPC como chave de upsert)
  kind: string;
  name: string;
  cnpj: string | null;
  ibgeCode: string | null;
  externalIds: Record<string, string>;
  attributes: Record<string, unknown>;
  sourceUrl: string;
  contentHash: string; // "sha256:<hex>"
}

async function normalizeRow(
  row: Record<string, unknown>,
  ctx: {
    portal: PortalConfig;
    dataset: string;
    resourceId: string;
    resourceName: string;
    kind: string;
    hint: DatasetHint | null;
    sourceUrl: string;
  },
): Promise<NormalizedEntity | null> {
  // Hash do conteúdo bruto da linha (idempotência/dedupe).
  const hashHex = await sha256Hex(JSON.stringify(row));
  const key = await rowKey(row, hashHex);
  const id = `${ctx.portal.key}:${ctx.resourceId}:${key}`;

  const name =
    pickField(row, ctx.hint?.nameFields) ||
    // fallback: primeiro campo textual não-vazio que não seja só número/id
    (() => {
      for (const [k, v] of Object.entries(row)) {
        if (k === "_id") continue;
        const s = str(v);
        if (s !== "" && !/^\d+$/.test(s)) return s;
      }
      return "";
    })() ||
    `${ctx.resourceName || ctx.dataset} ${key}`;

  const cnpj = findAnyCnpj(row, ctx.hint?.cnpjFields);
  const ibgeCode = findIbge(row, ctx.hint?.ibgeFields);

  // attributes = a linha crua (campos úteis), sem o _id interno do datastore.
  const attributes: Record<string, unknown> = { ...row };
  delete attributes["_id"];

  return {
    id,
    ckanId: id,
    kind: ctx.kind,
    name: name.slice(0, 300),
    cnpj,
    ibgeCode,
    externalIds: { ckanId: id, portal: ctx.portal.key, dataset: ctx.dataset, resourceId: ctx.resourceId },
    attributes,
    sourceUrl: ctx.sourceUrl,
    contentHash: `sha256:${hashHex}`,
  };
}

// ── HTTP handler ─────────────────────────────────────────────────────────────

interface Params {
  portal: string;
  dataset: string;
  resource: string;
  kind: string;
  limit: number;
  offset: number;
}

async function readParams(req: Request, url: URL): Promise<Params> {
  // Aceita query string e, em POST, corpo JSON (a query tem precedência se ambos vierem).
  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try {
      const parsed = await req.json();
      if (parsed && typeof parsed === "object") body = parsed as Record<string, unknown>;
    } catch {
      // corpo ausente/invalido -> ignora, usa query
    }
  }
  const get = (k: string): string => {
    const q = url.searchParams.get(k);
    if (q !== null && q !== "") return q;
    const b = body[k];
    return b === undefined || b === null ? "" : String(b);
  };
  const limitRaw = Number(get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), MAX_LIMIT) : DEFAULT_LIMIT;
  const offsetRaw = Number(get("offset"));
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.floor(offsetRaw) : 0;
  return {
    portal: get("portal").trim().toLowerCase(),
    dataset: get("dataset").trim(),
    resource: get("resource").trim(),
    kind: get("kind").trim().toLowerCase(),
    limit,
    offset,
  };
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  // Defense-in-depth: se INGEST_CRON_SECRET estiver definido, exige Bearer correspondente.
  const cronSecret = Deno.env.get("INGEST_CRON_SECRET");
  if (cronSecret) {
    if (!hasValidBearerSecret(req, cronSecret)) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, { status: 401 }, req);
    }
  } else {
    console.warn("[ingest-ckan] INGEST_CRON_SECRET não definido — função sem segredo de cron.");
  }

  const url = new URL(req.url);
  const p = await readParams(req, url);

  // Validação de parâmetros (erro honesto 400).
  const portal = PORTALS[p.portal];
  if (!portal) {
    return jsonResponse(
      { ok: false, error: `portal inválido: "${p.portal}". Use portal=sp ou portal=dadosgov.` },
      { status: 400 },
      req,
    );
  }
  if (!p.dataset && !p.resource) {
    return jsonResponse(
      { ok: false, error: "informe ?dataset={id} (ou ?resource={resource_id})." },
      { status: 400 },
      req,
    );
  }
  if (p.kind && !VALID_KINDS.has(p.kind)) {
    return jsonResponse(
      { ok: false, error: `kind inválido: "${p.kind}". Veja os kinds do domínio.` },
      { status: 400 },
      req,
    );
  }

  const startedAt = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Token opcional do gateway do portal (lido do Vault em runtime; nunca hardcoded).
    let token: string | null = null;
    if (portal.vaultTokenName) {
      try {
        const { data } = await supabase.rpc("get_vault_secret", { p_name: portal.vaultTokenName });
        token = typeof data === "string" && data.trim() !== "" ? data.trim() : null;
      } catch {
        token = null; // Vault indisponível -> segue sem token (pode levar 401 honesto adiante)
      }
    }

    // 1) Resolve o resource: usa ?resource, senão descobre via package_show.
    let resourceId = p.resource;
    let resourceName = "";
    let resourceFormat = "";
    let resourceUrl = "";
    let datastoreActive = false;
    let datasetForLinks = p.dataset || resourceId;

    if (!resourceId) {
      const pkg = await ckanGet<CkanPackage>(
        `${portal.apiBase}/package_show?id=${encodeURIComponent(p.dataset)}`,
        token,
      );
      const chosen = pickResource(pkg);
      if (!chosen || !chosen.id) {
        return jsonResponse(
          { ok: false, error: `dataset "${p.dataset}" sem resource utilizável (datastore/CSV).` },
          { status: 422 },
          req,
        );
      }
      resourceId = chosen.id;
      resourceName = str(chosen.name);
      resourceFormat = str(chosen.format);
      resourceUrl = str(chosen.url);
      datastoreActive = chosen.datastore_active === true;
      datasetForLinks = str(pkg.name) || p.dataset;
    } else {
      // Quando o resource vem explícito, tentamos um datastore_search direto;
      // se falhar com "não está no datastore", caímos no CSV (precisaria da url do resource).
      datastoreActive = true; // otimista; o fetch confirma
    }

    // Define kind: explícito > hint do dataset > default conservador.
    const hint = resolveHint(datasetForLinks, resourceName);
    const kind = p.kind || hint?.kind || "organization";

    const sourceUrl = portal.datasetPath(datasetForLinks);
    const collectedAt = new Date().toISOString();

    // 2) Busca uma janela de linhas (datastore preferido; CSV como fallback).
    let records: Array<Record<string, unknown>> = [];
    let total: number | null = null;
    let nextOffset: number | null = null;
    let mode: "datastore" | "csv" = "datastore";

    if (datastoreActive) {
      try {
        const ds = await ckanGet<DatastoreResult>(
          `${portal.apiBase}/datastore_search?resource_id=${encodeURIComponent(resourceId)}` +
            `&limit=${p.limit}&offset=${p.offset}`,
          token,
        );
        records = Array.isArray(ds.records) ? ds.records : [];
        total = typeof ds.total === "number" ? ds.total : null;
        const consumed = p.offset + records.length;
        nextOffset = total !== null && consumed < total && records.length > 0 ? consumed : null;
        mode = "datastore";
      } catch (e) {
        // Se o resource não está no datastore e temos url de CSV, tenta CSV.
        if (resourceUrl && (resourceFormat.toLowerCase().includes("csv") || resourceFormat === "")) {
          mode = "csv";
        } else {
          throw e;
        }
      }
    } else if (resourceUrl) {
      mode = "csv";
    } else {
      return jsonResponse(
        { ok: false, error: `resource "${resourceId}" não está no datastore e não há URL de CSV.` },
        { status: 422 },
        req,
      );
    }

    let csvTruncatedBeyondWindow = false;
    if (mode === "csv") {
      // CSV: baixamos uma JANELA de bytes (CSV_WINDOW_BYTES) e paginamos por LINHA dentro dela
      // (offset = nº de linhas já consumidas). Honestidade sobre o limite desta abordagem:
      // se o arquivo é MAIOR que a janela (truncated) e já consumimos todas as linhas
      // baixadas, NÃO há como avançar sem re-baixar a mesma janela — devolver o mesmo offset
      // causaria loop infinito. Então sinalizamos nextOffset=null + flag, e quem chama deve
      // aumentar a janela (CSV_WINDOW_BYTES) ou usar um resource no datastore.
      const { records: all, truncated } = await fetchCsvRows(resourceUrl, token, CSV_WINDOW_BYTES);
      const slice = all.slice(p.offset, p.offset + p.limit);
      records = slice;
      const consumed = p.offset + slice.length;
      if (consumed < all.length) {
        nextOffset = consumed; // ainda há linhas na janela baixada — paginação segura
      } else {
        nextOffset = null; // esgotou a janela
        csvTruncatedBeyondWindow = truncated; // mas o arquivo pode ter mais além da janela
      }
    }

    // 3) Normaliza (tolerante: erro por linha não aborta o lote).
    const items: NormalizedEntity[] = [];
    const errors: Array<{ row: number; error: string }> = [];
    const seen = new Set<string>();
    for (let i = 0; i < records.length; i++) {
      try {
        const norm = await normalizeRow(records[i]!, {
          portal,
          dataset: datasetForLinks,
          resourceId,
          resourceName,
          kind,
          hint,
          sourceUrl,
        });
        if (!norm) continue;
        if (seen.has(norm.id)) continue;
        seen.add(norm.id);
        items.push(norm);
      } catch (e) {
        errors.push({ row: p.offset + i, error: String(e) });
      }
      // Respeita o orçamento de tempo mesmo na normalização (hash é async).
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        nextOffset = p.offset + i + 1;
        break;
      }
    }

    // 4) Grava em lotes via a RPC `ingest_ckan` (MESMO mecanismo das demais ingest-*).
    //    Payload espelha o contrato { collectedAt, sourceId, items[] } das outras funções.
    let ingested = 0;
    const rpcItems = items.map((it) => ({
      id: it.ckanId,
      kind: it.kind,
      name: it.name,
      cnpj: it.cnpj ?? "",
      ibgeCode: it.ibgeCode ?? "",
      externalIds: it.externalIds,
      attributes: it.attributes,
      sourceUrl: it.sourceUrl,
      contentHash: it.contentHash,
      raw: it.attributes,
    }));
    const rpcErrors: Array<{ batch: number; error: string }> = [];
    for (let i = 0; i < rpcItems.length; i += RPC_BATCH) {
      const batch = rpcItems.slice(i, i + RPC_BATCH);
      const { data, error } = await supabase.rpc(RPC_NAME, {
        p_payload: {
          collectedAt,
          sourceId: `${SOURCE_ID}:${portal.key}`,
          portal: portal.key,
          dataset: datasetForLinks,
          resourceId,
          items: batch,
        },
      });
      if (error) {
        // Falha honesta da RPC (ex.: migration ingest_ckan ainda não aplicada). Não duplica.
        rpcErrors.push({ batch: i / RPC_BATCH, error: error.message });
        break;
      }
      ingested += typeof data === "number" ? data : batch.length;
    }

    const ok = rpcErrors.length === 0;
    return jsonResponse(
      {
        ok,
        portal: portal.key,
        dataset: datasetForLinks,
        resource: resourceId,
        resourceName: resourceName || null,
        kind,
        mode,
        coletados: records.length,
        normalizados: items.length,
        ingested,
        total,
        nextOffset,
        // CSV maior que a janela de bytes baixada: há linhas inalcançáveis por este caminho.
        // Quem chama deve aumentar CSV_WINDOW_BYTES ou preferir um resource no datastore.
        csvTruncatedBeyondWindow,
        errors: [...errors, ...rpcErrors],
        elapsedMs: Date.now() - startedAt,
      },
      { status: ok ? 200 : 502 },
      req,
    );
  } catch (e) {
    // Qualquer falha de upstream (inclui 401/403 do gateway) vira 502 honesto; resto = 500.
    const status = e instanceof UpstreamError ? 502 : 500;
    // Degradação elegante: fonte instável/bloqueada -> erro honesto, pipeline segue.
    return jsonResponse(
      {
        ok: false,
        portal: p.portal,
        dataset: p.dataset || null,
        resource: p.resource || null,
        error: String(e),
        elapsedMs: Date.now() - startedAt,
      },
      { status },
      req,
    );
  }
});

// =============================================================================
// CONTRATO DA RPC `public.ingest_ckan(p_payload jsonb)` — a ser criada em migration
// (mesmo padrão de todas as ingest_*: SECURITY DEFINER, search_path='public', RETURNS int).
// NÃO incluída aqui porque migrations exigem release-manager + security-reviewer.
//
// Payload enviado por esta função:
//   {
//     "collectedAt": "<ISO>",
//     "sourceId":    "ckan:sp" | "ckan:dadosgov",
//     "portal":      "sp" | "dadosgov",
//     "dataset":     "<slug>",
//     "resourceId":  "<uuid>",
//     "items": [ {
//       "id":          "<portal:resourceId:rowKey>",   // chave de upsert (external_ids->>'ckanId')
//       "kind":        "<entityKind válido>",
//       "name":        "<string>",
//       "cnpj":        "<14 dígitos ou ''>",
//       "ibgeCode":    "<7 dígitos ou ''>",
//       "externalIds": { "ckanId": "...", "portal": "...", "dataset": "...", "resourceId": "..." },
//       "attributes":  { ...linha crua útil... },
//       "sourceUrl":   "<link da página do dataset>",
//       "contentHash": "sha256:<hex>",
//       "raw":         { ...linha crua... }
//     } ]
//   }
//
// Comportamento esperado da RPC (idempotente; espelha ingest_sp_contratos/ingest_tce_sp):
//   - source_runs: cria run 'running' com records_seen = jsonb_array_length(items); ao fim
//     'success' com records_inserted = N; em erro 'failed' + error_message = sqlerrm.
//   - Para cada item (pular se id vazio):
//       raw_records: upsert por (source_id, external_id=id), payload = raw,
//         content_hash = item->>'contentHash' (já é sha256), collected_at = collectedAt.
//       entities: upsert por (external_ids->>'ckanId') WHERE external_ids ? 'ckanId',
//         kind = item->>'kind', name = left(name,300),
//         normalized_name = lower(left(name,500)),
//         cnpj = nullif(cnpj,''), ibge_code = nullif(ibgeCode,''),
//         external_ids = item->'externalIds', attributes = item->'attributes',
//         source_ids = array[sourceId].
//       evidence: upsert por (raw_record_id, kind='api_payload'), source_url = sourceUrl,
//         content_hash = contentHash, path = '$.result.records[*]', confidence ~0.8.
//   - RETURN N (linhas processadas).
//   - REVOKE EXECUTE de anon/authenticated (igual às demais ingest_*).
// =============================================================================
