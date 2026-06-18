// Supabase Edge Function: "ingest-senado"
// Ingestão de SENADORES EM EXERCÍCIO — Senado Federal (Dados Abertos).
//
// Fonte: API pública de Dados Abertos do Senado (sem auth, sem chave):
//   GET https://legis.senado.leg.br/dadosabertos/senador/lista/atual
//       Header: Accept: application/json
//
// Retorna: ListaParlamentarEmExercicio.Parlamentares.Parlamentar[]
//
// Fluxo: única chamada à API (lista completa sem paginação) -> normaliza cada
// senador -> chama a RPC public.ingest_senado em lotes. Espelha 1:1 a
// ingest-politica.
//
// Idempotente: id = CodigoParlamentar do Senado (perene), então rodar de novo
// não duplica (a RPC faz upsert por (external_ids->>'codigoSenado') where kind='politician').
//
// Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente
// pelo Supabase nas Edge Functions — não precisa configurar nada.
//
// Deploy: Edge Functions -> "ingest-senado". Verify JWT LIGADO
// (o cron/admin manda Authorization, igual às outras).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchWithRetry, sleep } from "../_shared/http.ts";
import { hasValidBearerSecret } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";

const BASE = "https://legis.senado.leg.br/dadosabertos";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const HEADERS = { accept: "application/json", "user-agent": UA };
const SOURCE_ID = "senado-dados-abertos";

// Itens por chamada de RPC (evita payload gigante).
const RPC_BATCH = 200;

// ---------- Tipos da API do Senado ----------

interface IdentificacaoParlamentar {
  CodigoParlamentar?: string;
  CodigoPublicoNaLegAtual?: string;
  NomeParlamentar?: string;
  NomeCompletoParlamentar?: string;
  SexoParlamentar?: string;
  FormaTratamento?: string;
  UrlFotoParlamentar?: string;
  UrlPaginaParlamentar?: string;
  EmailParlamentar?: string;
  SiglaPartidoParlamentar?: string;
  UfParlamentar?: string;
  Bloco?: {
    CodigoBloco?: string;
    NomeBloco?: string;
    NomeApelido?: string;
    DataCriacao?: string;
  };
  MembroMesa?: string;
  MembroLideranca?: string;
}

interface Mandato {
  CodigoMandato?: string;
  UfParlamentar?: string;
  DescricaoParticipacao?: string;
  PrimeiraLegislaturaDoMandato?: { NumeroLegislatura?: string; DataInicio?: string; DataFim?: string };
  SegundaLegislaturaDoMandato?: { NumeroLegislatura?: string; DataInicio?: string; DataFim?: string };
}

interface RawParlamentar {
  IdentificacaoParlamentar?: IdentificacaoParlamentar;
  Mandato?: Mandato;
}

interface SenadoResponse {
  ListaParlamentarEmExercicio?: {
    Parlamentares?: {
      Parlamentar?: RawParlamentar[];
    };
    Metadados?: {
      Versao?: string;
      VersaoServico?: string;
      DataVersaoServico?: string;
      DescricaoDataSet?: string;
    };
  };
}

// ---------- Normalização ----------

function normalize(raw: RawParlamentar): Record<string, unknown> {
  const id_parl = raw.IdentificacaoParlamentar ?? {};
  const mandato = raw.Mandato ?? {};

  const id = (id_parl.CodigoParlamentar ?? "").trim();
  const nome = (id_parl.NomeParlamentar ?? id_parl.NomeCompletoParlamentar ?? "").trim();
  const partido = (id_parl.SiglaPartidoParlamentar ?? "").trim();
  const uf = (id_parl.UfParlamentar ?? mandato.UfParlamentar ?? "").trim();
  const urlPagina = (id_parl.UrlPaginaParlamentar ?? "").trim();
  const email = (id_parl.EmailParlamentar ?? "").trim();
  const foto = (id_parl.UrlFotoParlamentar ?? "").trim();

  const attributes: Record<string, unknown> = {
    casa: "senado",
    codigoParlamentar: id,
    partido,
    uf,
    email,
    foto,
    urlPagina,
    nomeCompleto: (id_parl.NomeCompletoParlamentar ?? "").trim(),
    sexo: (id_parl.SexoParlamentar ?? "").trim(),
    formaTratamento: (id_parl.FormaTratamento ?? "").trim(),
    membroMesa: id_parl.MembroMesa === "Sim",
    membroLideranca: id_parl.MembroLideranca === "Sim",
  };

  if (id_parl.CodigoPublicoNaLegAtual) {
    attributes.codigoPublico = id_parl.CodigoPublicoNaLegAtual.trim();
  }
  if (id_parl.Bloco?.NomeBloco) {
    attributes.bloco = id_parl.Bloco.NomeBloco.trim();
    attributes.blocoApelido = id_parl.Bloco.NomeApelido?.trim() ?? "";
  }
  if (mandato.CodigoMandato) {
    attributes.codigoMandato = mandato.CodigoMandato.trim();
    attributes.participacao = (mandato.DescricaoParticipacao ?? "").trim();
  }
  if (mandato.PrimeiraLegislaturaDoMandato) {
    attributes.leg1Numero = mandato.PrimeiraLegislaturaDoMandato.NumeroLegislatura;
    attributes.leg1Inicio = mandato.PrimeiraLegislaturaDoMandato.DataInicio;
    attributes.leg1Fim = mandato.PrimeiraLegislaturaDoMandato.DataFim;
  }
  if (mandato.SegundaLegislaturaDoMandato) {
    attributes.leg2Numero = mandato.SegundaLegislaturaDoMandato.NumeroLegislatura;
    attributes.leg2Inicio = mandato.SegundaLegislaturaDoMandato.DataInicio;
    attributes.leg2Fim = mandato.SegundaLegislaturaDoMandato.DataFim;
  }

  return {
    id,
    sourceId: SOURCE_ID,
    nome,
    partido,
    uf,
    email,
    foto,
    urlPagina,
    attributes,
    raw,
  };
}

// ---------- Fetch ----------

async function fetchSenadores(): Promise<RawParlamentar[]> {
  const res = await fetchWithRetry(`${BASE}/senador/lista/atual`, {
    timeoutMs: 15000,
    retries: 3,
    backoffMs: 800,
    init: { headers: HEADERS },
  });
  if (!res.ok) throw new Error(`${res.status} ao buscar lista de senadores`);
  const json = (await res.json()) as SenadoResponse;
  return json?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar ?? [];
}

// ---------- Handler ----------

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
    console.warn("[ingest-senado] INGEST_CRON_SECRET não definido — função sem segredo de cron.");
  }

  try {
    const collectedAt = new Date().toISOString();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Coleta — única chamada, lista completa
    const rawList = await fetchSenadores();

    const items: Array<Record<string, unknown>> = [];
    const seen = new Set<string>(); // dedup por CodigoParlamentar dentro da execução

    for (const raw of rawList) {
      const id = (raw.IdentificacaoParlamentar?.CodigoParlamentar ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      items.push(normalize(raw));
    }

    // Grava em lotes via a RPC.
    let ingested = 0;
    for (let i = 0; i < items.length; i += RPC_BATCH) {
      const batch = items.slice(i, i + RPC_BATCH);
      const { data, error } = await supabase.rpc("ingest_senado", {
        p_payload: { collectedAt, items: batch },
      });
      if (error) throw error;
      ingested += typeof data === "number" ? data : batch.length;
      // Pausa educada entre lotes (improvável ter >1 lote, mas respeitoso)
      if (i + RPC_BATCH < items.length) await sleep(250);
    }

    return jsonResponse({
      ok: true,
      coletados: items.length,
      ingested,
    }, {}, req);
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e) }, { status: 500 }, req);
  }
});
