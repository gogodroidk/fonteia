// Supabase Edge Function: "dossie" — Raio-X 360° (dossiê por CNPJ).
//
// PORQUÊ
// ------
// Reúne, num único payload, tudo que a Fonte.ia sabe sobre um CNPJ: contagens e
// top-N por kind vindos do bulk (Cloudflare D1, via REST — mesmo padrão do
// d1-bridge) + arremates de leilão e cadastro/QSA vindos do Postgres (tabela
// `entities` kind='company' e `auction_lot_history`). Cacheia o payload COMPLETO
// por 24h e aplica o corte free/pro SOMENTE na leitura.
//
// AUTENTICAÇÃO (verify_jwt=false — auth feita aqui dentro, mesmo padrão da d1-bridge
// e da fonteia):
//   - GET /dossie?cnpj=<14 chars alfanumérico>
//   - Rota pública (com `apikey`); o corte de conteúdo depende do JWT do usuário
//     (Authorization: Bearer <token>). Sem token válido ⇒ tratado como free/anon.
//
// SEGREDOS (lidos em RUNTIME, nunca no build):
//   Vault (via RPC get_vault_secret, cliente service-role):
//     CF_API_TOKEN, CF_ACCOUNT_ID — credenciais D1 (mesmo Vault que a d1-bridge usa).
//   Env do runtime (já injetados pelo Supabase):
//     SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — Postgres (service-role) + Vault.
//
// CACHE: tabela public.dossie_cache (infra/migrations/0040_dossie_support.sql),
// upsert por cnpj. `computed_at < 24h` ⇒ serve direto (X-Cache: hit); senão
// recalcula tudo em paralelo e regrava o cache (payload SEMPRE completo).

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";

// ───────────────────────────────────────────────────────────────────────────
// Config estática (mesmo padrão de d1-bridge/fonteia).
// ───────────────────────────────────────────────────────────────────────────
const D1_DATABASE_ID = "417caa83-86dc-463e-8682-656cf938cd24"; // fonteia-data
const PUBLISHABLE_KEY = "sb_publishable_uojihld8t92MQXo7gXrR3w_WPVn4RkZ";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const TOP_N = 20; // itens detalhados por section, antes do corte de gate
const FREE_ITEM_CAP = 3; // itens visíveis por section p/ usuário free/anon

function json(body: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(req) },
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Cliente service-role + Vault (COPIADO de supabase/functions/d1-bridge/index.ts
// getVaultSecret ~L69 — não editar o d1-bridge, só espelhar o padrão aqui).
// ───────────────────────────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function serviceClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getVaultSecret(name: string): Promise<string | null> {
  const supa = serviceClient();
  if (!supa) return null;
  try {
    const { data, error } = await supa.rpc("get_vault_secret", { p_name: name });
    if (error) {
      console.error(`[dossie] get_vault_secret(${name}) erro:`, error.message);
      return null;
    }
    const v = typeof data === "string" ? data.trim() : "";
    return v.length > 0 ? v : null;
  } catch (e) {
    console.error(`[dossie] get_vault_secret(${name}) exceção:`, String(e));
    return null;
  }
}

interface CfCreds {
  token: string;
  accountId: string;
}
async function resolveCfCreds(): Promise<CfCreds | { missing: string[] }> {
  const [token, accountId] = await Promise.all([
    getVaultSecret("CF_API_TOKEN"),
    getVaultSecret("CF_ACCOUNT_ID"),
  ]);
  const missing: string[] = [];
  if (!token) missing.push("CF_API_TOKEN");
  if (!accountId) missing.push("CF_ACCOUNT_ID");
  if (missing.length > 0) return { missing };
  return { token: token!, accountId: accountId! };
}

// ───────────────────────────────────────────────────────────────────────────
// D1 REST client (COPIADO de d1-bridge/index.ts d1Query ~L142 — statements
// parametrizados, sem string-building; nunca editar o d1-bridge diretamente).
// ───────────────────────────────────────────────────────────────────────────
interface D1QueryResult<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}
interface D1ApiResponse<T = Record<string, unknown>> {
  result?: Array<D1QueryResult<T>>;
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: unknown[];
}

class D1Error extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "D1Error";
  }
}

async function d1Query<T = Record<string, unknown>>(
  creds: CfCreds,
  sql: string,
  params: Array<string | number | null> = [],
): Promise<D1QueryResult<T>> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${creds.accountId}/d1/database/${D1_DATABASE_ID}/query`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${creds.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    });
  } catch (e) {
    throw new D1Error(`Falha de rede ao chamar o D1: ${String(e)}`, 502);
  }

  let body: D1ApiResponse<T>;
  try {
    body = (await res.json()) as D1ApiResponse<T>;
  } catch {
    throw new D1Error(`Resposta não-JSON do D1 (HTTP ${res.status}).`, 502);
  }

  if (!res.ok || !body.success) {
    const detail = (body.errors ?? []).map((e) => `${e.code ?? ""} ${e.message ?? ""}`.trim()).join("; ");
    const status = res.status === 401 || res.status === 403 ? res.status : 502;
    throw new D1Error(`D1 respondeu HTTP ${res.status}: ${detail || "erro desconhecido"}`, status);
  }

  const first = body.result?.[0];
  if (!first) {
    throw new D1Error("D1 retornou resultado vazio (sem result[0]).", 502);
  }
  return first;
}

// ───────────────────────────────────────────────────────────────────────────
// CNPJ — formato alfanumérico (IN RFB 2.229/2026): 14 chars, últimos 2 numéricos.
// Espelha apps/web/src/lib/cnpj.ts sanitizeCnpj (não importável do runtime Deno
// isolado da edge; replicado aqui deliberadamente).
// ───────────────────────────────────────────────────────────────────────────
function sanitizeCnpj(raw: string): string {
  const cleaned = raw.replace(/[.\-/\s]/g, "").toUpperCase();
  return cleaned.length === 14 ? cleaned : "";
}

function isValidCnpjFormat(cnpj: string): boolean {
  if (cnpj.length !== 14) return false;
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj)) return false;
  if (/^(.)\1{13}$/.test(cnpj)) return false; // sequência uniforme (00000000000000 etc.)
  return true;
}

// ───────────────────────────────────────────────────────────────────────────
// Mapeamento kind (D1 `entities.kind`) → seção do dossiê.
// ───────────────────────────────────────────────────────────────────────────
const KIND_TO_SECTION: Record<string, SectionKey> = {
  sanction: "sancoes",
  public_contract: "contratos",
  bidding_opportunity: "licitacoes",
  trademark: "marcas",
  parliamentary_expense: "ceap",
  federal_transfer: "transferencias",
  environmental_alert: "ambiental",
  environmental_infraction: "ambiental",
  fiscal_report: "fiscal",
};

type SectionKey =
  | "sancoes"
  | "contratos"
  | "licitacoes"
  | "leiloes_arrematados"
  | "marcas"
  | "ceap"
  | "transferencias"
  | "ambiental"
  | "fiscal"
  | "juridico";

const ALL_SECTIONS: SectionKey[] = [
  "sancoes",
  "contratos",
  "licitacoes",
  "leiloes_arrematados",
  "marcas",
  "ceap",
  "transferencias",
  "ambiental",
  "fiscal",
  "juridico",
];

type SectionStatus = "ok" | "vazio" | "evidencia_insuficiente";

interface SectionEvidence {
  source: string;
  url: string | null;
  collected_at: string | null;
}

interface Section {
  status: SectionStatus;
  total: number;
  items: Array<Record<string, unknown>>;
  evidence: SectionEvidence;
}

interface DossieFlag {
  id: string;
  titulo: string;
  severity: "alta" | "media" | "baixa";
  explicacao: string;
}

interface DossieHeader {
  razaoSocial: string | null;
  cnae: string | null;
  situacao: string | null;
  qsa: Array<Record<string, unknown>>;
}

interface DossiePayload {
  cnpj: string;
  header: DossieHeader;
  flags: DossieFlag[];
  sections: Record<SectionKey, Section>;
  generated_at: string;
}

/** Flag "borrada" — free/anon vê título e severidade, mas não a explicação. */
interface LockedFlag {
  id: string;
  titulo: string;
  severity: "alta" | "media" | "baixa";
  explicacao: null;
  locked: true;
}

/** Payload após o corte de gate: flags podem vir borradas (LockedFlag). */
interface GatedPayload extends Omit<DossiePayload, "flags"> {
  flags: Array<DossieFlag | LockedFlag>;
}

// ───────────────────────────────────────────────────────────────────────────
// Flags — funções PURAS (sem I/O), recebem só os totais das sections já
// montadas. Fáceis de testar isoladamente.
// ───────────────────────────────────────────────────────────────────────────
function flagFornecedorSancionado(sections: Record<SectionKey, Section>): DossieFlag | null {
  const temContratoOuLicitacao = sections.contratos.total > 0 || sections.licitacoes.total > 0;
  const temSancao = sections.sancoes.total > 0;
  if (!temContratoOuLicitacao || !temSancao) return null;
  return {
    id: "fornecedor_sancionado",
    titulo: "Fornecedor do poder público com sanção ativa ou histórica",
    severity: "alta",
    explicacao:
      "Esta entidade tem contrato(s) público(s) e/ou participação em licitação(ões) registrados " +
      "e também consta com sanção no Portal da Transparência. Verifique a vigência e o motivo da " +
      "sanção antes de qualquer decisão comercial ou de compliance.",
  };
}

function flagPoliticoEContratos(sections: Record<SectionKey, Section>): DossieFlag | null {
  const temCeap = sections.ceap.total > 0;
  const temContrato = sections.contratos.total > 0;
  if (!temCeap || !temContrato) return null;
  return {
    id: "politico_e_contratos",
    titulo: "Fornecedor de gabinete parlamentar com contrato público",
    severity: "alta",
    explicacao:
      "Esta entidade aparece como fornecedora em despesa(s) de cota parlamentar (CEAP) e também " +
      "tem contrato(s) público(s) registrados. Não é, por si só, irregularidade — mas é um padrão " +
      "que merece checagem cruzada de datas, valores e órgãos envolvidos.",
  };
}

function computeFlags(sections: Record<SectionKey, Section>): DossieFlag[] {
  const flags = [flagFornecedorSancionado(sections), flagPoliticoEContratos(sections)];
  return flags.filter((f): f is DossieFlag => f !== null);
}

// ───────────────────────────────────────────────────────────────────────────
// D1: contagens por kind + top-N por kind, para um único CNPJ.
// ───────────────────────────────────────────────────────────────────────────
interface D1CountRow {
  kind: string | null;
  total: number;
}
interface D1EntityRow {
  id: string;
  kind: string | null;
  name: string | null;
  cnpj: string | null;
  ibge_code: string | null;
  external_ids: string | null;
  attributes: string | null;
  updated_at: string | null;
}

function parseJsonCol(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function fetchD1CountsAndTopN(
  creds: CfCreds,
  cnpj: string,
): Promise<{ counts: D1CountRow[]; topByKind: Map<string, D1EntityRow[]> }> {
  const [countsResult, topNResult] = await Promise.all([
    d1Query<D1CountRow>(
      creds,
      `SELECT kind, count(*) as total FROM entities WHERE cnpj = ? GROUP BY kind`,
      [cnpj],
    ),
    d1Query<D1EntityRow & { rn: number }>(
      creds,
      `SELECT * FROM (
         SELECT *, ROW_NUMBER() OVER (PARTITION BY kind ORDER BY updated_at DESC) rn
         FROM entities WHERE cnpj = ?
       ) WHERE rn <= ?`,
      [cnpj, TOP_N],
    ),
  ]);

  const topByKind = new Map<string, D1EntityRow[]>();
  for (const row of topNResult.results ?? []) {
    const kind = row.kind ?? "";
    if (!topByKind.has(kind)) topByKind.set(kind, []);
    topByKind.get(kind)!.push(row);
  }

  return { counts: countsResult.results ?? [], topByKind };
}

// ───────────────────────────────────────────────────────────────────────────
// Postgres: arremates de leilão (auction_lot_history.winner_doc) + cadastro
// company (header/QSA) via cliente service-role.
// ───────────────────────────────────────────────────────────────────────────
interface AuctionWinRow {
  receita_lot_id: string;
  edital: string | null;
  lot_number: string | null;
  title: string | null;
  category_raw: string | null;
  city: string | null;
  uf: string | null;
  final_value_cents: number | null;
  winner_name: string | null;
  closed_at: string | null;
  source_url: string;
}

/** winner_doc é gravado MASCARADO pela ingestão da Receita ("01.874.045/0001-58").
 *  Consultamos pelas duas formas (limpa e mascarada) — verificado ao vivo em
 *  2026-07-07: só a mascarada existe hoje, mas a limpa protege ingestões futuras. */
function maskCnpj(clean: string): string {
  return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
}

async function fetchAuctionWins(
  supa: SupabaseClient,
  cnpj: string,
): Promise<{ items: AuctionWinRow[]; total: number }> {
  const docs = [cnpj, maskCnpj(cnpj)];
  const [{ data: items, error: itemsError }, { count, error: countError }] = await Promise.all([
    supa
      .schema("public")
      .from("auction_lot_history")
      .select(
        "receita_lot_id, edital, lot_number, title, category_raw, city, uf, final_value_cents, winner_name, closed_at, source_url",
      )
      .in("winner_doc", docs)
      .order("closed_at", { ascending: false })
      .limit(TOP_N),
    supa
      .schema("public")
      .from("auction_lot_history")
      .select("id", { count: "exact", head: true })
      .in("winner_doc", docs),
  ]);

  if (itemsError) console.error("[dossie] fetchAuctionWins itens:", itemsError.message);
  if (countError) console.error("[dossie] fetchAuctionWins count:", countError.message);

  return { items: (items ?? []) as unknown as AuctionWinRow[], total: count ?? (items?.length ?? 0) };
}

interface CompanyEntityRow {
  name: string | null;
  attributes: Record<string, unknown> | null;
}

async function fetchCompanyHeader(supa: SupabaseClient, cnpj: string): Promise<CompanyEntityRow | null> {
  const { data, error } = await supa
    .schema("public")
    .from("entities")
    .select("name, attributes")
    .eq("kind", "company")
    .eq("cnpj", cnpj)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[dossie] fetchCompanyHeader:", error.message);
    return null;
  }
  return (data as unknown as CompanyEntityRow) ?? null;
}

// ───────────────────────────────────────────────────────────────────────────
// Monta a section a partir das linhas D1 já filtradas por kind.
// ───────────────────────────────────────────────────────────────────────────
function sourceLabelForKind(kind: string): string {
  switch (kind) {
    case "sanction":
      return "Portal da Transparência — Sanções";
    case "public_contract":
      return "PNCP — Contratos";
    case "bidding_opportunity":
      return "PNCP — Licitações";
    case "trademark":
      return "INPI — Marcas (RPI)";
    case "parliamentary_expense":
      return "Câmara dos Deputados — CEAP";
    case "federal_transfer":
      return "Portal da Transparência — Transferências";
    case "environmental_alert":
    case "environmental_infraction":
      return "IBAMA — Dados Abertos";
    case "fiscal_report":
      return "Portal da Transparência — Fiscal";
    default:
      return "Fonte.ia — bulk de entidades";
  }
}

function buildSectionFromD1(
  kind: string,
  rows: D1EntityRow[],
  total: number,
): Section {
  if (total === 0) {
    return {
      status: "vazio",
      total: 0,
      items: [],
      evidence: { source: sourceLabelForKind(kind), url: null, collected_at: null },
    };
  }
  const items = rows.map((row) => {
    const attrs = parseJsonCol(row.attributes);
    const externalIds = parseJsonCol(row.external_ids);
    return {
      id: row.id,
      name: row.name,
      updatedAt: row.updated_at,
      sourceUrl: typeof attrs["sourceUrl"] === "string" ? attrs["sourceUrl"] : null,
      attributes: attrs,
      externalIds,
    };
  });
  const mostRecent = rows.reduce<string | null>((acc, r) => {
    if (!r.updated_at) return acc;
    if (!acc || r.updated_at > acc) return r.updated_at;
    return acc;
  }, null);
  const firstWithUrl = items.find((it) => typeof it["sourceUrl"] === "string" && it["sourceUrl"]);
  return {
    status: "ok",
    total,
    items,
    evidence: {
      source: sourceLabelForKind(kind),
      url: (firstWithUrl?.["sourceUrl"] as string | undefined) ?? null,
      collected_at: mostRecent,
    },
  };
}

function buildLeiloesSection(auctionData: { items: AuctionWinRow[]; total: number }): Section {
  if (auctionData.total === 0) {
    return {
      status: "vazio",
      total: 0,
      items: [],
      evidence: { source: "Receita Federal — Sistema de Leilão Eletrônico (SLE)", url: null, collected_at: null },
    };
  }
  const items = auctionData.items.map((row) => ({
    receitaLotId: row.receita_lot_id,
    edital: row.edital,
    lotNumber: row.lot_number,
    title: row.title,
    category: row.category_raw,
    city: row.city,
    uf: row.uf,
    finalValueCents: row.final_value_cents,
    winnerName: row.winner_name,
    closedAt: row.closed_at,
    sourceUrl: row.source_url,
  }));
  return {
    status: "ok",
    total: auctionData.total,
    items,
    evidence: {
      source: "Receita Federal — Sistema de Leilão Eletrônico (SLE)",
      url: auctionData.items[0]?.source_url ?? null,
      collected_at: auctionData.items[0]?.closed_at ?? null,
    },
  };
}

// `juridico` é sempre evidência insuficiente: o dataset público do CNJ (DataJud) é
// anonimizado — não traz CNPJ nem nome das partes. Não inventamos vínculo (ver
// apps/web/src/features/cerebro/cerebro-api.ts NAME_KINDS, mesmo racional).
function buildJuridicoSection(): Section {
  return {
    status: "evidencia_insuficiente",
    total: 0,
    items: [],
    evidence: {
      source: "CNJ DataJud (dataset público anonimizado)",
      url: "https://www.cnj.jus.br/sistemas/datajud/api-publica/",
      collected_at: null,
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Gate free/pro — mesmo padrão de isProUser em fonteia/index.ts ~L71: RPC
// my_plan via token do usuário. O corte acontece ANTES de serializar a resposta.
// ───────────────────────────────────────────────────────────────────────────
async function isProUser(request: Request): Promise<boolean> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token === PUBLISHABLE_KEY) return false;
  try {
    if (!SUPABASE_URL) return false;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/my_plan`, {
      method: "POST",
      headers: {
        apikey: PUBLISHABLE_KEY,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: "{}",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { plan?: string };
    return data.plan === "pro" || data.plan === "corporativo";
  } catch {
    return false;
  }
}

/** Aplica o corte free/pro no payload COMPLETO. Nunca muta o objeto de entrada. */
function applyGate(full: DossiePayload, pro: boolean): DossiePayload | GatedPayload {
  if (pro) return full;

  const cutSections = {} as Record<SectionKey, Section>;
  for (const key of ALL_SECTIONS) {
    const s = full.sections[key];
    cutSections[key] = {
      status: s.status,
      total: s.total,
      items: s.items.slice(0, FREE_ITEM_CAP),
      evidence: s.evidence,
    };
  }

  const cutFlags: LockedFlag[] = full.flags.map((f) => ({
    id: f.id,
    titulo: f.titulo,
    severity: f.severity,
    // "borrada": sem explicação para quem não é assinante.
    explicacao: null,
    locked: true,
  }));

  const gated: GatedPayload = {
    ...full,
    flags: cutFlags,
    sections: cutSections,
  };
  return gated;
}

// ───────────────────────────────────────────────────────────────────────────
// Cache (public.dossie_cache — infra/migrations/0040_dossie_support.sql).
// ───────────────────────────────────────────────────────────────────────────
interface CacheRow {
  payload: DossiePayload;
  computed_at: string;
}

async function readCache(supa: SupabaseClient, cnpj: string): Promise<CacheRow | null> {
  const { data, error } = await supa
    .schema("public")
    .from("dossie_cache")
    .select("payload, computed_at")
    .eq("cnpj", cnpj)
    .maybeSingle();
  if (error) {
    console.error("[dossie] readCache:", error.message);
    return null;
  }
  return (data as unknown as CacheRow) ?? null;
}

async function writeCache(supa: SupabaseClient, cnpj: string, payload: DossiePayload): Promise<void> {
  const { error } = await supa
    .schema("public")
    .from("dossie_cache")
    .upsert(
      { cnpj, payload: payload as unknown as Record<string, unknown>, computed_at: new Date().toISOString() },
      { onConflict: "cnpj" },
    );
  if (error) console.error("[dossie] writeCache:", error.message);
}

// ───────────────────────────────────────────────────────────────────────────
// Monta o payload COMPLETO (sem corte de gate) buscando D1 + Postgres em paralelo.
// ───────────────────────────────────────────────────────────────────────────
async function computeFullDossie(supa: SupabaseClient, creds: CfCreds, cnpj: string): Promise<DossiePayload> {
  const [d1Data, auctionData, company] = await Promise.all([
    fetchD1CountsAndTopN(creds, cnpj),
    fetchAuctionWins(supa, cnpj),
    fetchCompanyHeader(supa, cnpj),
  ]);

  const totalByKind = new Map<string, number>();
  for (const row of d1Data.counts) totalByKind.set(row.kind ?? "", Number(row.total) || 0);

  const sections = {} as Record<SectionKey, Section>;
  for (const key of ALL_SECTIONS) sections[key] = { status: "vazio", total: 0, items: [], evidence: { source: "", url: null, collected_at: null } };

  for (const [kind, sectionKey] of Object.entries(KIND_TO_SECTION)) {
    const rows = d1Data.topByKind.get(kind) ?? [];
    const total = totalByKind.get(kind) ?? 0;
    const built = buildSectionFromD1(kind, rows, total);
    // ambiental recebe duas kinds (alert + infraction): soma se já havia dado.
    if (sections[sectionKey].total > 0 && built.total > 0) {
      sections[sectionKey] = {
        status: "ok",
        total: sections[sectionKey].total + built.total,
        items: [...sections[sectionKey].items, ...built.items].slice(0, TOP_N),
        evidence: sections[sectionKey].evidence,
      };
    } else if (built.total > 0) {
      sections[sectionKey] = built;
    }
  }

  sections.leiloes_arrematados = buildLeiloesSection(auctionData);
  sections.juridico = buildJuridicoSection();

  const attrs = company?.attributes ?? {};
  const qsaRaw = attrs["qsa"];
  const header: DossieHeader = {
    razaoSocial: company?.name ?? null,
    cnae: typeof attrs["cnaeFiscalDescricao"] === "string"
      ? (attrs["cnaeFiscalDescricao"] as string)
      : typeof attrs["cnae"] === "string"
        ? (attrs["cnae"] as string)
        : null,
    situacao: typeof attrs["descricaoSituacaoCadastral"] === "string"
      ? (attrs["descricaoSituacaoCadastral"] as string)
      : typeof attrs["situacao"] === "string"
        ? (attrs["situacao"] as string)
        : null,
    qsa: Array.isArray(qsaRaw) ? (qsaRaw as Array<Record<string, unknown>>) : [],
  };

  const flags = computeFlags(sections);

  return {
    cnpj,
    header,
    flags,
    sections,
    generated_at: new Date().toISOString(),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Handler HTTP.
// ───────────────────────────────────────────────────────────────────────────
Deno.serve(async (request: Request): Promise<Response> => {
  const preflight = handlePreflight(request);
  if (preflight) return preflight;

  const apikey = (request.headers.get("apikey") ?? "").trim();
  if (apikey === "" || apikey !== PUBLISHABLE_KEY) {
    return json({ error: "apikey ausente ou inválida" }, 401, request);
  }

  const url = new URL(request.url);
  if (!url.pathname.endsWith("/dossie")) {
    return json({ error: "Rota não encontrada", path: url.pathname }, 404, request);
  }
  if (request.method !== "GET") {
    return json({ error: "use GET" }, 405, request);
  }

  const rawCnpj = (url.searchParams.get("cnpj") ?? "").trim();
  const cnpj = sanitizeCnpj(rawCnpj);
  if (!isValidCnpjFormat(cnpj)) {
    return json(
      {
        error: "cnpj_invalido",
        message: "Informe ?cnpj= com 14 caracteres alfanuméricos (com ou sem máscara).",
      },
      400,
      request,
    );
  }

  const supa = serviceClient();
  if (!supa) {
    return json(
      { error: "supabase_indisponivel", message: "SUPABASE_URL/SERVICE_ROLE_KEY ausentes no runtime." },
      503,
      request,
    );
  }

  const pro = await isProUser(request);

  // Cache primeiro.
  const cached = await readCache(supa, cnpj);
  if (cached && Date.now() - new Date(cached.computed_at).getTime() < CACHE_TTL_MS) {
    const gated = applyGate(cached.payload, pro);
    return new Response(JSON.stringify(gated), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "x-cache": "hit", ...corsHeaders(request) },
    });
  }

  const creds = await resolveCfCreds();
  if ("missing" in creds) {
    return json(
      {
        error: "d1_nao_configurado",
        message: "A ponte para o Cloudflare D1 ainda não foi ativada. Configure o Vault.",
        missing: creds.missing,
      },
      503,
      request,
    );
  }

  let full: DossiePayload;
  try {
    full = await computeFullDossie(supa, creds, cnpj);
  } catch (e) {
    const status = e instanceof D1Error ? e.status : 502;
    console.error("[dossie] computeFullDossie falhou:", String(e));
    if (status === 401 || status === 403) {
      return json({ error: "d1_credencial_invalida", message: "CF_API_TOKEN inválido." }, 503, request);
    }
    return json({ error: "dossie_falhou", message: "Falha ao montar o dossiê." }, 502, request);
  }

  // Grava o cache com o payload COMPLETO (sem corte) — o corte é aplicado só na leitura.
  await writeCache(supa, cnpj, full);

  const gated = applyGate(full, pro);
  return new Response(JSON.stringify(gated), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "x-cache": "miss", ...corsHeaders(request) },
  });
});
