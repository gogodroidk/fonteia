// Supabase Edge Function: "ingest-sp-capital-contratos"
// Ingestão de CONTRATOS da Prefeitura de SÃO PAULO (capital).
// Fonte: CKAN público dados.prefeitura.sp.gov.br (datastore_search), 1 recurso/ano.
// Mapeia para entities kind='public_contract' (mesmo shape do ingest-pncp-contratos).
// Idempotente: dedup por external_ids->>'spContractId'. verify_jwt LIGADO.
// Resiliente: flush incremental + retry/backoff em erros transitorios + janela por offset.
//
// Params (query, todos opcionais):
//   anos=2024,2023   CSV de anos (default: todos)
//   pageSize=N       itens/página CKAN (default 500, máx 1000)
//   maxPaginas=N     teto de páginas/recurso (0=todas)
//   offsetStart=N    início do offset (só com 1 ano) — fatia recursos enormes
//   maxRecords=N     teto de registros nesta chamada (só com 1 ano)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CKAN = "https://dados.prefeitura.sp.gov.br/api/3/action/datastore_search";
const DATASET_URL = "https://dados.prefeitura.sp.gov.br/dataset/base-de-compras-e-licitacoes";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const HEADERS = { accept: "application/json", "user-agent": UA };
const SOURCE_ID = "sp-capital-contratos";

const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 1000;
const RATE_MS = 150;
const RPC_BATCH = 60;
const FLUSH_EVERY = 900;

const RESOURCES: Record<string, string> = {
  "2024": "eb5800bf-60bb-4551-9e90-3fddafde1fa7",
  "2023": "4ed095ac-e27b-4a06-9799-b2de9bd00d3e",
  "2022": "3e159db1-a56d-4411-8346-d585a8ec2266",
  "2021": "68e74394-f029-4007-b8c2-646735b4b4b1",
  "2020": "844165d6-bb61-4c53-9808-6549bee9cfea",
  "2018": "fda9fa03-1e89-49d3-8adc-34a696af6129",
  "2017": "a96db8a6-568c-49d2-b8ac-33b51816dc7d",
  "2016": "a0524ad5-bbe0-48dd-b8a4-4644ea648f47",
  "2011-2015": "fd50ecb1-e0d2-42ea-9234-52e536888697",
};

interface CkanRecord { _id: number; [k: string]: unknown; }
interface CkanResult { total?: number; records?: CkanRecord[]; fields?: Array<{ id: string; type: string }>; }
interface CkanResponse { success?: boolean; result?: CkanResult; error?: unknown; }

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function digitsOnly(v: unknown): string { return String(v ?? "").replace(/\D/g, ""); }
function extractCnpj(v: unknown): string | null { const d = digitsOnly(v); return d.length === 14 ? d : null; }

function brMoneyToNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[^\d.,-]/g, "").trim();
  if (s === "") return null;
  const norm = s.replace(/\./g, "").replace(",", ".");
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

function parseDate(v: unknown): string {
  const t = String(v ?? "").trim();
  if (t === "") return "";
  if (/[zZ]$/.test(t) || /[+-]\d{2}:\d{2}$/.test(t)) return t;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t)) return `${t}-03:00`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return `${t}T00:00:00-03:00`;
  return t;
}

function pick(rec: CkanRecord, keys: string[]): string {
  for (const k of keys) {
    const val = rec[k];
    if (val !== null && val !== undefined && String(val).trim() !== "") return String(val).trim();
  }
  return "";
}

function normalize(rec: CkanRecord, resourceId: string, ano: string, collectedAt: string): Record<string, unknown> {
  const orgao = pick(rec, ["Nome do Órgão", "Orgao", "Órgão"]);
  const contrato = pick(rec, ["Contrato", "Número do Contrato"]);
  const objeto = pick(rec, ["Objeto"]);
  const modalidade = pick(rec, ["Modalidade"]);
  const processo = pick(rec, ["Processo Administrativo", "Processo"]);
  const cnpjRaw = pick(rec, ["CNPJ/CPF", "CNPJ", "CNPJ_CPF"]);
  const fornecedor = pick(rec, ["Fornecedor e Nome de Fantasia", "Fornecedor", "Razão Social"]);
  const valorTexto = pick(rec, ["Valor(R$)", "Valor", "Valor (R$)"]);
  const licitacao = pick(rec, ["Licitação"]);
  const vigencia = pick(rec, ["Vigência (dias/mês)", "Vigência"]);
  const evento = pick(rec, ["Evento"]);
  const dataAssinatura = pick(rec, ["Data da Assinatura", "Data Assinatura"]);
  const dataPublicacao = pick(rec, ["Data da Publicação", "Data Publicação"]);

  const cnpj = extractCnpj(cnpjRaw);
  const fornecedorNome = fornecedor || "Fornecedor não informado";
  const id = `${resourceId}:${rec._id}`;

  const out: Record<string, unknown> = {
    id, sourceId: SOURCE_ID, sourceUrl: DATASET_URL, collectedAt,
    fornecedorNome,
    fornecedorCnpj: cnpjRaw || null,
    orgao: orgao || "Órgão não informado",
    orgaoCnpj: null,
    objeto: objeto || `Contrato ${contrato || id}`,
    valorGlobal: brMoneyToNumber(valorTexto),
    valorTexto: valorTexto || null,
    modalidade: modalidade || null,
    numeroContrato: contrato || null,
    processo: processo || null,
    licitacao: licitacao || null,
    vigencia: vigencia || null,
    evento: evento || null,
    dataAssinatura: parseDate(dataAssinatura),
    dataPublicacao: parseDate(dataPublicacao),
    uf: "SP", ufNome: "São Paulo", municipio: "São Paulo", codigoIbge: "3550308",
    esfera: "M", poder: "E",
    ano: Number(ano) || ano,
  };
  out.raw = rec;
  return out;
}

async function fetchPage(resourceId: string, limit: number, offset: number): Promise<CkanResult> {
  const u = new URL(CKAN);
  u.searchParams.set("resource_id", resourceId);
  u.searchParams.set("limit", String(limit));
  u.searchParams.set("offset", String(offset));
  const res = await fetch(u.toString(), { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${u.toString()}`);
  const body = (await res.json()) as CkanResponse;
  if (!body.success || !body.result) {
    throw new Error(`CKAN success=false em ${resourceId}: ${JSON.stringify(body.error ?? {})}`);
  }
  return body.result;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const anosParam = url.searchParams.get("anos");
  const anos = anosParam
    ? anosParam.split(",").map((s) => s.trim()).filter((a) => RESOURCES[a])
    : Object.keys(RESOURCES);
  const maxPaginas = Number(url.searchParams.get("maxPaginas") ?? "0");
  const pageSize = Math.min(Math.max(1, Number(url.searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE))), MAX_PAGE_SIZE);
  const offsetStart = Math.max(0, Number(url.searchParams.get("offsetStart") ?? "0"));
  const maxRecords = Number(url.searchParams.get("maxRecords") ?? "0");

  try {
    const collectedAt = new Date().toISOString();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const errors: Array<{ ano: string; offset: number; error: string }> = [];
    const perAno: Record<string, number> = {};
    let coletadas = 0;
    let ingested = 0;

    async function rpcWithRetry(batch: Array<Record<string, unknown>>): Promise<number> {
      const maxTries = 5;
      let lastErr = "";
      for (let attempt = 1; attempt <= maxTries; attempt++) {
        const { data, error } = await supabase.rpc("ingest_sp_contratos", {
          p_payload: { collectedAt, sourceId: SOURCE_ID, items: batch },
        });
        if (!error) return typeof data === "number" ? data : batch.length;
        lastErr = error.message ?? JSON.stringify(error);
        const transient = /timeout|deadlock|conflict|connection|terminating|temporar|57014|40001|40P01|08\d{3}/i.test(lastErr);
        if (!transient || attempt === maxTries) break;
        await sleep(500 * attempt);
      }
      throw new Error(lastErr);
    }

    async function flush(buf: Array<Record<string, unknown>>): Promise<void> {
      for (let i = 0; i < buf.length; i += RPC_BATCH) {
        ingested += await rpcWithRetry(buf.slice(i, i + RPC_BATCH));
      }
    }

    const windowed = anos.length === 1 && (offsetStart > 0 || maxRecords > 0);

    for (const ano of anos) {
      const resourceId = RESOURCES[ano];
      let offset = windowed ? offsetStart : 0;
      let collectedThisYear = 0;
      let pagina = 0;
      let total = Infinity;
      perAno[ano] = 0;
      let buffer: Array<Record<string, unknown>> = [];

      while (offset < total) {
        const remaining = maxRecords > 0 ? maxRecords - collectedThisYear : pageSize;
        if (remaining <= 0) break;
        const thisPage = Math.min(pageSize, remaining);
        try {
          const result = await fetchPage(resourceId, thisPage, offset);
          total = result.total ?? 0;
          const recs = result.records ?? [];
          if (recs.length === 0) break;
          for (const rec of recs) {
            buffer.push(normalize(rec, resourceId, ano, collectedAt));
            perAno[ano] += 1;
            coletadas += 1;
            collectedThisYear += 1;
          }
          offset += recs.length;
        } catch (e) {
          errors.push({ ano, offset, error: String(e) });
          break;
        }
        if (buffer.length >= FLUSH_EVERY) { await flush(buffer); buffer = []; }
        pagina += 1;
        if (maxPaginas > 0 && pagina >= maxPaginas) break;
        if (offset < total && RATE_MS > 0) await sleep(RATE_MS);
      }
      if (buffer.length > 0) { await flush(buffer); buffer = []; }
      if (RATE_MS > 0) await sleep(RATE_MS);
    }

    return new Response(
      JSON.stringify({ ok: true, fonte: SOURCE_ID, anos, janela: windowed ? { offsetStart, maxRecords } : undefined, coletadas, porAno: perAno, ingested, errors: errors.length > 0 ? errors : undefined }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
