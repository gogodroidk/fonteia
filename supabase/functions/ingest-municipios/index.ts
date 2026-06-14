// Supabase Edge Function: "ingest-municipios"
// Ingestão dos MUNICÍPIOS brasileiros — IBGE Localidades.
//
// Fonte: API pública do IBGE (sem auth, sem chave):
//   GET https://servicodados.ibge.gov.br/api/v1/localidades/municipios
//   Uma única chamada devolve TODOS os ~5570 municípios, cada um já com a árvore
//   microrregião → mesorregião → UF → região.
//
// Fluxo: busca a lista inteira -> normaliza cada município -> chama a RPC
// public.ingest_municipios em lotes. Espelha 1:1 a ingest-pncp.
//
// Idempotente: id do município = código IBGE (7 dígitos, perene), então rodar de
// novo não duplica (a RPC faz upsert por id via índice único parcial).
//
// Secrets: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são injetados automaticamente
// pelo Supabase nas Edge Functions — não precisa configurar nada.
//
// Parâmetros de query (todos opcionais):
//   ?uf=SP   -> filtra (no servidor desta função) só os municípios da UF.
//
// Deploy: Edge Functions -> Create function "ingest-municipios" -> cole este arquivo.
// (Verify JWT pode ficar LIGADO; o invocador manda Authorization, igual às outras.)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const BASE = "https://servicodados.ibge.gov.br/api/v1/localidades";
const PORTAL = "https://www.ibge.gov.br/cidades-e-estados";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
const HEADERS = { accept: "application/json", "user-agent": UA };
const SOURCE_ID = "ibge-localidades";

// Itens por chamada de RPC (evita payload gigante).
const RPC_BATCH = 500;

interface RawRegiao {
  id?: number;
  sigla?: string;
  nome?: string;
}
interface RawUf {
  id?: number;
  sigla?: string;
  nome?: string;
  regiao?: RawRegiao;
}
interface RawMeso {
  id?: number;
  nome?: string;
  UF?: RawUf;
}
interface RawMicro {
  id?: number;
  nome?: string;
  mesorregiao?: RawMeso;
}
interface RawMunicipio {
  id: number;
  nome: string;
  microrregiao?: RawMicro;
  [key: string]: unknown;
}

function normalize(raw: RawMunicipio): Record<string, unknown> {
  const micro = raw.microrregiao ?? {};
  const meso = micro.mesorregiao ?? {};
  const uf = meso.UF ?? {};
  const regiao = uf.regiao ?? {};

  return {
    id: String(raw.id),
    sourceId: SOURCE_ID,
    codigoIbge: String(raw.id),
    nome: (raw.nome ?? "").trim(),
    uf: (uf.sigla ?? "").trim(),
    ufNome: (uf.nome ?? "").trim(),
    regiao: (regiao.nome ?? "").trim(),
    mesorregiao: (meso.nome ?? "").trim(),
    microrregiao: (micro.nome ?? "").trim(),
    raw,
  };
}

async function getJson(url: string): Promise<RawMunicipio[]> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} em ${url}`);
  return (await res.json()) as RawMunicipio[];
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const ufFilter = (url.searchParams.get("uf") ?? "").trim().toUpperCase();

  try {
    const collectedAt = new Date().toISOString();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const raw = await getJson(`${BASE}/municipios?orderBy=nome`);

    const seen = new Set<string>(); // dedup por código IBGE dentro da execução
    const items: Array<Record<string, unknown>> = [];
    for (const m of raw) {
      if (m?.id === undefined || m?.id === null) continue;
      const item = normalize(m);
      if (ufFilter && item.uf !== ufFilter) continue;
      const id = item.id as string;
      if (seen.has(id)) continue;
      seen.add(id);
      items.push(item);
    }

    // Grava em lotes via a RPC.
    let ingested = 0;
    for (let i = 0; i < items.length; i += RPC_BATCH) {
      const batch = items.slice(i, i + RPC_BATCH);
      const { data, error } = await supabase.rpc("ingest_municipios", {
        p_payload: { collectedAt, items: batch },
      });
      if (error) throw error;
      ingested += typeof data === "number" ? data : batch.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        fonte: PORTAL,
        uf: ufFilter || null,
        coletados: items.length,
        ingested,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
