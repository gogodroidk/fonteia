// Supabase Edge Function: "ingest-portal-transparencia"
// Ingestão de EMPRESAS/PESSOAS SANCIONADAS — Portal da Transparência Federal.
//
// Fontes:
//   CEIS — Cadastro de Empresas Inidôneas e Suspensas
//     GET https://api.portaldatransparencia.gov.br/api-de-dados/ceis?pagina={n}
//   CNEP — Cadastro Nacional de Empresas Punidas
//     GET https://api.portaldatransparencia.gov.br/api-de-dados/cnep?pagina={n}
//
// Autenticação: header "chave-api-dados: <token>" lido em runtime via vault
//   supabase.rpc('get_vault_secret', { p_name: 'PORTAL_TRANSPARENCIA_KEY' })
//   (só executável por service_role)
//
// Paginação: ~15 itens/página; por padrão até 30 páginas por origem (≈450 sanções/fonte).
//   ?maxPaginas=N -> teto por origem (0 = ilimitado)
//   ?origens=CEIS,CNEP -> subset de origens (default: ambas)
//
// Fluxo:
//   1. Lê token do vault
//   2. Para cada origem, pagina respeitando rate-limit educado (500ms entre páginas)
//   3. Normaliza: kind='sanction', dedup por (origem:id), chama RPC ingest_sancoes em lotes
//   4. Fonte atualizada apenas se ≥1 sanção inserida (status='connected')
//
// Idempotente: upsert por external_ids->>'sancaoId' (CEIS:<id> | CNEP:<id>).
//
// Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY injetados automaticamente.
//
// Deploy: Verify JWT LIGADO — o cron/admin manda Authorization (igual ingest-pncp).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchWithRetry, sleep } from "../_shared/http.ts";
import { hasValidBearerSecret } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";

const API_BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";
const PORTAL_BASE = "https://portaldatransparencia.gov.br";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const SOURCE_ID = "portal-transparencia-api";

// Pausa educada entre chamadas (ms) — API do Portal tem limite mas é generosa.
const RATE_MS = 500;
// Itens por chamada de RPC.
const RPC_BATCH = 200;
// Teto de páginas por origem (default). Cada página tem ~15 itens.
const DEFAULT_MAX_PAGINAS = 30;

// ── Tipos crus da API ────────────────────────────────────────────────────────

interface RawTipoSancao {
  descricaoResumida?: string;
  descricaoPortal?: string;
}

interface RawOrgaoSancionador {
  nome?: string;
  siglaUf?: string;
  poder?: string;
  esfera?: string;
}

interface RawFonteSancao {
  nomeExibicao?: string;
  telefoneContato?: string;
  enderecoContato?: string;
}

interface RawFundamentacao {
  codigo?: string;
  descricao?: string;
  descricaoResumida?: string;
}

interface RawPessoa {
  id?: number;
  cpfFormatado?: string;
  cnpjFormatado?: string;
  nome?: string;
  razaoSocialReceita?: string;
  nomeFantasiaReceita?: string;
  tipo?: string;
}

interface RawSancionado {
  nome?: string;
  codigoFormatado?: string;
}

interface RawSancao {
  id: number;
  dataReferencia?: string;
  dataInicioSancao?: string;
  dataFimSancao?: string;
  dataPublicacaoSancao?: string;
  dataTransitadoJulgado?: string;
  dataOrigemInformacao?: string;
  tipoSancao?: RawTipoSancao;
  fonteSancao?: RawFonteSancao;
  fundamentacao?: RawFundamentacao[];
  orgaoSancionador?: RawOrgaoSancionador;
  sancionado?: RawSancionado;
  valorMulta?: string;
  pessoa?: RawPessoa;
  textoPublicacao?: string;
  linkPublicacao?: string;
  detalhamentoPublicacao?: string;
  numeroProcesso?: string;
  abrangenciaDefinidaDecisaoJudicial?: string;
  informacoesAdicionaisDoOrgaoSancionador?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function trimStr(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Mantém só dígitos de um CNPJ; retorna "" se não tiver 14 dígitos. */
function normalizeCnpj(raw: string | undefined): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits.length === 14 ? digits : "";
}

/** Retorna true se o codigoFormatado/cnpjFormatado indicar pessoa jurídica (tem "/"). */
function isCnpj(codigo: string | undefined): boolean {
  return (codigo ?? "").includes("/");
}

/** Link canônico no portal para consultar a sanção (fallback para URL de lista). */
function sourceUrl(origem: "CEIS" | "CNEP", id: number): string {
  const endpoint = origem === "CEIS" ? "ceis" : "cnep";
  return `${PORTAL_BASE}/pessoa/sancao/${endpoint}/${id}`;
}

/** Normaliza data "DD/MM/AAAA" para ISO "AAAA-MM-DD"; mantém outros formatos. */
function normalizeDate(value: string | undefined): string {
  const s = trimStr(value);
  if (s === "" || s === "Sem informação") return "";
  // "DD/MM/AAAA"
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s;
}

// ── Normalização de um registro bruto ────────────────────────────────────────

interface SancaoItem {
  id: string;         // "CEIS:<id>" ou "CNEP:<id>"  — usado como sancaoId
  nome: string;
  cnpj: string | null;
  tipoSancao: string;
  origem: "CEIS" | "CNEP";
  dataInicioSancao: string;
  dataFimSancao: string;
  orgaoSancionador: string;
  uf: string;
  esfera: string;
  poder: string;
  fundamentacao: string;
  dataPublicacao: string;
  linkPublicacao: string;
  numeroProcesso: string;
  valorMulta: string;
  textoPublicacao: string;
  pessoaTipo: string;
  sourceUrl: string;
  raw: RawSancao;
}

function normalize(raw: RawSancao, origem: "CEIS" | "CNEP"): SancaoItem {
  const sancionadoNome = trimStr(raw.sancionado?.nome) || trimStr(raw.pessoa?.razaoSocialReceita) || trimStr(raw.pessoa?.nome);
  const codigoFormatado = trimStr(raw.sancionado?.codigoFormatado);
  const cnpjFormatado = trimStr(raw.pessoa?.cnpjFormatado);

  // Prefere CNPJ do campo pessoa (mais limpo); fallback para codigoFormatado se PJ
  const cnpjRaw = cnpjFormatado !== "" ? cnpjFormatado : (isCnpj(codigoFormatado) ? codigoFormatado : "");
  const cnpj = normalizeCnpj(cnpjRaw) || null;

  const tipoSancao = trimStr(raw.tipoSancao?.descricaoResumida) || trimStr(raw.tipoSancao?.descricaoPortal);
  const orgaoSancionador = trimStr(raw.orgaoSancionador?.nome) || trimStr(raw.fonteSancao?.nomeExibicao);
  const fundamentacao = (raw.fundamentacao ?? [])
    .map((f) => trimStr(f.descricaoResumida ?? f.codigo))
    .filter(Boolean)
    .join(" | ")
    .slice(0, 800);

  return {
    id: `${origem}:${raw.id}`,
    nome: sancionadoNome || "Sancionado nao informado",
    cnpj,
    tipoSancao: tipoSancao || "Nao informado",
    origem,
    dataInicioSancao: normalizeDate(raw.dataInicioSancao),
    dataFimSancao: normalizeDate(raw.dataFimSancao),
    orgaoSancionador,
    uf: trimStr(raw.orgaoSancionador?.siglaUf),
    esfera: trimStr(raw.orgaoSancionador?.esfera),
    poder: trimStr(raw.orgaoSancionador?.poder),
    fundamentacao,
    dataPublicacao: normalizeDate(raw.dataPublicacaoSancao),
    linkPublicacao: trimStr(raw.linkPublicacao),
    numeroProcesso: trimStr(raw.numeroProcesso),
    valorMulta: trimStr(raw.valorMulta),
    textoPublicacao: trimStr(raw.textoPublicacao),
    pessoaTipo: trimStr(raw.pessoa?.tipo),
    sourceUrl: sourceUrl(origem, raw.id),
    raw,
  };
}

// ── Fetch de uma página ──────────────────────────────────────────────────────

async function fetchPage(
  endpoint: string,
  pagina: number,
  apiKey: string,
): Promise<RawSancao[]> {
  const url = `${API_BASE}/${endpoint}?pagina=${pagina}`;
  const res = await fetchWithRetry(url, {
    timeoutMs: 15000,
    retries: 3,
    backoffMs: 800,
    init: {
      headers: {
        "chave-api-dados": apiKey,
        accept: "application/json",
        "user-agent": UA,
      },
    },
  });
  if (res.status === 204) return [];
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API retornou ${res.status} em ${url}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data as RawSancao[];
}

// ── HTTP handler ─────────────────────────────────────────────────────────────

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
    console.warn("[ingest-portal-transparencia] INGEST_CRON_SECRET não definido — função sem segredo de cron.");
  }

  const urlObj = new URL(req.url);

  // maxPaginas=0 significa ILIMITADO (consistente com ingest-pncp e ingest-pncp-contratos).
  const maxPaginasRaw = urlObj.searchParams.get("maxPaginas");
  const maxPaginas = maxPaginasRaw !== null ? Number(maxPaginasRaw) : DEFAULT_MAX_PAGINAS;
  // 0 = sem teto (ilimitado); negativo tratamos como 0 também
  const effectiveMaxPaginas = maxPaginas > 0 ? maxPaginas : 0;

  const origensParam = urlObj.searchParams.get("origens");
  const origensRequested = origensParam
    ? origensParam.split(",").map((s) => s.trim().toUpperCase())
    : ["CEIS", "CNEP"];
  const origens = (["CEIS", "CNEP"] as const).filter((o) => origensRequested.includes(o));

  try {
    const collectedAt = new Date().toISOString();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1) Lê o token do vault em runtime (só funciona com service_role).
    const { data: apiKey, error: vaultErr } = await supabase.rpc("get_vault_secret", {
      p_name: "PORTAL_TRANSPARENCIA_KEY",
    });
    if (vaultErr || !apiKey) {
      throw new Error(`Falha ao ler vault: ${vaultErr?.message ?? "token vazio"}`);
    }

    const items: SancaoItem[] = [];
    const errors: Array<{ origem: string; pagina: number; error: string }> = [];
    const seen = new Set<string>(); // dedup por "ORIGEM:id" na mesma execução

    // 2) Pagina cada origem.
    for (const origem of origens) {
      const endpoint = origem === "CEIS" ? "ceis" : "cnep";
      let pagina = 1;
      let emptyPages = 0;

      // effectiveMaxPaginas=0 -> ilimitado; usa Number.MAX_SAFE_INTEGER como teto prático
      const pageLimit = effectiveMaxPaginas > 0 ? effectiveMaxPaginas : Number.MAX_SAFE_INTEGER;

      while (pagina <= pageLimit) {
        try {
          const page = await fetchPage(endpoint, pagina, apiKey as string);
          if (page.length === 0) {
            emptyPages += 1;
            // Duas páginas vazias consecutivas = fim do dataset
            if (emptyPages >= 2) break;
          } else {
            emptyPages = 0;
            for (const raw of page) {
              if (raw?.id == null) continue;
              const key = `${origem}:${raw.id}`;
              if (seen.has(key)) continue;
              seen.add(key);
              items.push(normalize(raw, origem));
            }
          }
        } catch (e) {
          errors.push({ origem, pagina, error: String(e) });
          break; // não insiste nessa origem
        }

        pagina += 1;
        if (pagina <= pageLimit && RATE_MS > 0) await sleep(RATE_MS);
      }

      // Pausa entre origens
      if (origens.indexOf(origem) < origens.length - 1 && RATE_MS > 0) {
        await sleep(RATE_MS);
      }
    }

    // 3) Grava em lotes via RPC.
    const rpcItems = items.map((item) => ({
      id: String(item.raw.id),
      origem: item.origem,
      nome: item.nome,
      cnpj: item.cnpj ?? "",
      tipoSancao: item.tipoSancao,
      dataInicioSancao: item.dataInicioSancao,
      dataFimSancao: item.dataFimSancao,
      orgaoSancionador: item.orgaoSancionador,
      uf: item.uf,
      esfera: item.esfera,
      poder: item.poder,
      fundamentacao: item.fundamentacao,
      dataPublicacao: item.dataPublicacao,
      linkPublicacao: item.linkPublicacao,
      numeroProcesso: item.numeroProcesso,
      valorMulta: item.valorMulta,
      textoPublicacao: item.textoPublicacao,
      pessoaTipo: item.pessoaTipo,
      sourceUrl: item.sourceUrl,
      raw: item.raw,
    }));

    let ingested = 0;
    for (let i = 0; i < rpcItems.length; i += RPC_BATCH) {
      const batch = rpcItems.slice(i, i + RPC_BATCH);
      const { data, error } = await supabase.rpc("ingest_sancoes", {
        p_payload: { collectedAt, items: batch },
      });
      if (error) throw error;
      ingested += typeof data === "number" ? data : batch.length;
    }

    // 4) Atualiza o status da fonte se temos dados.
    if (ingested > 0 || items.length > 0) {
      await supabase
        .from("sources")
        .update({ status: "connected", updated_at: new Date().toISOString() })
        .eq("id", SOURCE_ID);
    }

    return jsonResponse({
      ok: true,
      origens,
      maxPaginas: effectiveMaxPaginas === 0 ? "ilimitado" : effectiveMaxPaginas,
      coletados: items.length,
      ingested,
      errors,
    }, {}, req);
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, { status: 500 }, req);
  }
});
