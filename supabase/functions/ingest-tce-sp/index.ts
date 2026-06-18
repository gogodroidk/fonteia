// Supabase Edge Function: "ingest-tce-sp"
// Ingestão de EMPENHOS (contract-spend) municipais do TCE-SP para os ~645
// municípios de São Paulo. Mapeia para entities kind='public_contract',
// source 'tce-sp'. Mesmo shape de ingest-pncp-contratos / ingest-sp-capital-contratos.
// Idempotente: dedup por external_ids->>'tceSpId' (índice único na migration).
// Resiliente: flush incremental + retry/backoff em erros transitórios +
// try/catch por (municipio,mês) — uma falha não aborta os demais. verify_jwt LIGADO.
//
// Fonte (REST JSON, sem auth):
//   GET https://transparencia.tce.sp.gov.br/api/json/despesas/{slug}/{ano}/{mes}
//     -> ARRAY de { orgao, mes, evento, nr_empenho, id_fornecedor,
//                   nm_fornecedor, dt_emissao_despesa, vl_despesa }
//   GET https://transparencia.tce.sp.gov.br/api/json/municipios
//     -> ARRAY de { municipio (slug), municipio_extenso }  (645 entries)
//
// >>> GUARDRAIL DE RUNTIME <<<
// 645 munis × 12 meses numa só chamada estoura o limite de ~150s do edge runtime.
// Por isso a função processa só uma FATIA: `maxMunicipios` slugs a partir de `offset`.
// O orquestrador/cron dirige em ondas (offset 0,5,10,15,...) até cobrir os 645.
// Um único (municipio+mês) é sempre pequeno (Campinas Jan2024 ≈ 9.8k recs / 2.9MB),
// então NUNCA buscamos um ano inteiro de uma vez — sempre laço mês a mês.
//
// Params (query, todos opcionais):
//   ?municipios=adamantina,campinas  CSV de slugs (default: TODOS os 645 da API)
//   ?ano=2024                        ano (default 2024)
//   ?meses=1,2,3                     CSV de meses 1..12 (default 1..12)
//   ?maxMunicipios=N                 teto de munis por chamada (default 5; 0=todos)
//   ?offset=N                        início da fatia de munis (default 0)
//   ?rateMs=N                        pausa respeitosa entre chamadas (default 150)
//
// Secrets SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY são injetados pelo Supabase.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchWithRetry, sleep } from "../_shared/http.ts";
import { hasValidBearerSecret } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { extractCnpj, brMoneyToNumber, parseDateBrt } from "../_shared/br.ts";

const API = "https://transparencia.tce.sp.gov.br/api/json";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const HEADERS = { accept: "application/json", "user-agent": UA };
const SOURCE_ID = "tce-sp";

const DEFAULT_ANO = 2024;
const DEFAULT_MAX_MUNICIPIOS = 5; // fatia segura por chamada
const RATE_MS = 150;
const RPC_BATCH = 150; // itens por lote de RPC

// Nome do mês em PT-BR por número (a API devolve "Janeiro" no campo `mes`,
// mas a URL exige o número 1..12).
const MES_NOME: Record<number, string> = {
  1: "Janeiro", 2: "Fevereiro", 3: "Março", 4: "Abril", 5: "Maio", 6: "Junho",
  7: "Julho", 8: "Agosto", 9: "Setembro", 10: "Outubro", 11: "Novembro", 12: "Dezembro",
};

interface DespesaRec {
  orgao?: string;
  mes?: string;
  evento?: string;
  nr_empenho?: string;
  id_fornecedor?: string;
  nm_fornecedor?: string;
  dt_emissao_despesa?: string;
  vl_despesa?: string;
  [k: string]: unknown;
}

interface MunicipioRec {
  municipio?: string;          // slug
  municipio_extenso?: string;  // nome legível
}

// extractCnpj, brMoneyToNumber e parseDateBrt importados de _shared/br.ts

/** Um empenho -> item normalizado (shape esperado pela RPC ingest_tce_sp). */
function normalize(
  rec: DespesaRec,
  slug: string,
  ano: number,
  mesNum: number,
  collectedAt: string,
): Record<string, unknown> {
  const nrEmpenho = String(rec.nr_empenho ?? "").trim();
  const fornecedorNome = String(rec.nm_fornecedor ?? "").trim() || "Fornecedor não informado";
  const fornecedorIdRaw = String(rec.id_fornecedor ?? "").trim();
  const orgao = String(rec.orgao ?? "").trim() || "Órgão não informado";
  const evento = String(rec.evento ?? "").trim() || null;
  const valorTexto = rec.vl_despesa ?? null;
  const mesNome = String(rec.mes ?? "").trim() || MES_NOME[mesNum];

  // id estável/perene = slug:ano:mes:nr_empenho
  const id = `${slug}:${ano}:${mesNum}:${nrEmpenho}`;

  // objeto: a API não tem texto de objeto -> usa o contexto orgao + evento.
  const objeto = `${orgao} — ${evento ?? "Empenho"} ${nrEmpenho}`.trim();

  return {
    id,
    sourceId: SOURCE_ID,
    cnpj: extractCnpj(fornecedorIdRaw),

    municipio: null,
    codigoIbge: null,
    uf: "SP",
    ufNome: "São Paulo",
    esfera: "M",
    poder: "E",
    objeto,
    valorGlobal: brMoneyToNumber(valorTexto),
    valorTexto: valorTexto ?? null,
    fornecedorNome,
    fornecedorCnpj: fornecedorIdRaw || null,
    orgao,
    numeroEmpenho: nrEmpenho,
    dataEmissao: parseDateBrt(rec.dt_emissao_despesa),
    evento,
    ano,
    mes: mesNome,
    mesNumero: mesNum,
    municipioSlug: slug,
    collectedAt,

    raw: rec,
  };
}

async function getJsonArray<T>(url: string): Promise<T[]> {
  const res = await fetchWithRetry(url, {
    timeoutMs: 15000,
    retries: 3,
    backoffMs: 800,
    init: { headers: HEADERS },
  });
  if (res.status === 204 || res.status === 404) return [];
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  const body = await res.json();
  if (Array.isArray(body)) return body as T[];
  return [];
}

async function fetchAllMunicipioSlugs(): Promise<string[]> {
  const arr = await getJsonArray<MunicipioRec>(`${API}/municipios`);
  return arr
    .map((m) => String(m.municipio ?? "").trim())
    .filter((s) => s.length > 0);
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
    console.warn("[ingest-tce-sp] INGEST_CRON_SECRET não definido — função sem segredo de cron.");
  }

  const url = new URL(req.url);

  const ano = Number(url.searchParams.get("ano") ?? String(DEFAULT_ANO)) || DEFAULT_ANO;
  const mesesParam = url.searchParams.get("meses");
  const meses = (mesesParam
    ? mesesParam.split(",").map((s) => Number(s.trim()))
    : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  ).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);

  const maxMunicipios = Number(url.searchParams.get("maxMunicipios") ?? String(DEFAULT_MAX_MUNICIPIOS));
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? "0"));
  const rateMs = Math.max(0, Number(url.searchParams.get("rateMs") ?? String(RATE_MS)));
  const municipiosParam = url.searchParams.get("municipios");

  try {
    const collectedAt = new Date().toISOString();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Lista de slugs: CSV explícito OU todos da API.
    let allSlugs: string[];
    let slugFetchError: string | null = null;
    if (municipiosParam) {
      allSlugs = municipiosParam.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
    } else {
      // Erro de fetch da lista de municípios NÃO derruba a função — é registrado no response.
      try {
        allSlugs = await fetchAllMunicipioSlugs();
      } catch (e) {
        slugFetchError = String(e);
        allSlugs = [];
      }
    }

    const totalSlugs = allSlugs.length;
    // Fatia desta chamada: [offset, offset+maxMunicipios)  (maxMunicipios=0 => todos restantes)
    const slugs = maxMunicipios > 0
      ? allSlugs.slice(offset, offset + maxMunicipios)
      : allSlugs.slice(offset);

    const errors: Array<{ municipio: string; mes: number; error: string }> = [];
    if (slugFetchError) {
      // Expõe o erro de listagem de municípios como um erro visível na resposta.
      errors.push({ municipio: "_municipios_list", mes: 0, error: slugFetchError });
    }
    const porMunicipio: Record<string, number> = {};
    let coletadas = 0;
    let ingested = 0;

    async function rpcWithRetry(slug: string, mesNum: number, batch: Array<Record<string, unknown>>): Promise<number> {
      const maxTries = 5;
      let lastErr = "";
      for (let attempt = 1; attempt <= maxTries; attempt++) {
        const { data, error } = await supabase.rpc("ingest_tce_sp", {
          p_payload: { collectedAt, municipioSlug: slug, ano: String(ano), mes: String(mesNum), items: batch },
        });
        if (!error) return typeof data === "number" ? data : batch.length;
        lastErr = error.message ?? JSON.stringify(error);
        const transient = /timeout|deadlock|conflict|connection|terminating|temporar|57014|40001|40P01|08\d{3}/i.test(lastErr);
        if (!transient || attempt === maxTries) break;
        await sleep(500 * attempt);
      }
      throw new Error(lastErr);
    }

    async function flush(slug: string, mesNum: number, buf: Array<Record<string, unknown>>): Promise<void> {
      for (let i = 0; i < buf.length; i += RPC_BATCH) {
        ingested += await rpcWithRetry(slug, mesNum, buf.slice(i, i + RPC_BATCH));
      }
    }

    for (const slug of slugs) {
      porMunicipio[slug] = porMunicipio[slug] ?? 0;
      for (const mesNum of meses) {
        const target = `${API}/despesas/${encodeURIComponent(slug)}/${ano}/${mesNum}`;
        try {
          const recs = await getJsonArray<DespesaRec>(target);
          if (recs.length === 0) {
            if (rateMs > 0) await sleep(rateMs);
            continue;
          }
          const batch: Array<Record<string, unknown>> = [];
          for (const rec of recs) {
            // pula registros sem nr_empenho (id instável)
            if (!String(rec.nr_empenho ?? "").trim()) continue;
            batch.push(normalize(rec, slug, ano, mesNum, collectedAt));
            coletadas += 1;
            porMunicipio[slug] += 1;
          }
          // grava este (muni,mês) imediatamente — flush incremental
          await flush(slug, mesNum, batch);
        } catch (e) {
          // falha de um (muni,mês) é registrada mas NÃO aborta os demais
          errors.push({ municipio: slug, mes: mesNum, error: String(e) });
        }
        if (rateMs > 0) await sleep(rateMs);
      }
    }

    return jsonResponse({
      ok: true,
      fonte: SOURCE_ID,
      ano,
      meses,
      janela: { offset, maxMunicipios, totalSlugs, processadosNestaFatia: slugs.length },
      municipiosProcessados: slugs.length,
      coletadas,
      ingested,
      porMunicipio,
      errors: errors.length > 0 ? errors : undefined,
    }, {}, req);
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, { status: 500 }, req);
  }
});
