// Supabase Edge Function: "lote-detalhe"
// Proxy SOMENTE-LEITURA do detalhe de um lote no SLE da Receita Federal.
//
// Por quê: o `api/edital/{edle}` (usado na ingestão) traz só tipo/valores/fotos —
// NÃO traz a descrição dos bens. A descrição real ("SMARTPHONE APPLE IPHONE 14
// PRO MAX 256GB", quantidade, recinto) só vem no `api/lote/{u}/{n}/{e}/{lote}`.
// O SLE não tem CORS, então o navegador não pode chamá-lo direto — esta função
// repassa o dado PÚBLICO do lote com cabeçalhos CORS.
//
// Uso: GET /functions/v1/lote-detalhe?edle=317900/2/2026&lote=124
// Resposta: { ok, titulo, categoria, recinto, itens:[{descricao,quantidade,unidade}], imagens:[], avisos:[] }
//
// verify_jwt = false: é leitura de dado PÚBLICO (mesma informação do site da
// Receita), sem segredo e sem escrita. Visitantes anônimos podem ver o lote.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BASE = "https://www25.receita.fazenda.gov.br/sle-sociedade";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-max-age": "86400",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
}

interface RawItem {
  recintoArmazenador?: string;
  quantidade?: number;
  unMedida?: string;
  descricao?: string;
}
interface RawAviso {
  texto?: string;
  tipo?: string;
  data?: string;
}
interface RawLoteDetalhe {
  tipo?: string;
  cidade?: string;
  valorMinimo?: number;
  itensDetalhesLote?: RawItem[];
  imagens?: Array<{ src?: string }>;
  avisosErratas?: RawAviso[];
}

// "317900/2/2026" ou "0317900/000002/2026" -> partes padronizadas para a API.
function padEdle(edle: string): { unidade: string; numero: string; exercicio: string } | null {
  const parts = edle.split(/[/-]/).filter((p) => p.length > 0);
  if (parts.length < 3) return null;
  const [u, n, e] = parts;
  if (!u || !n || !e) return null;
  return { unidade: u.padStart(7, "0"), numero: n.padStart(6, "0"), exercicio: e };
}

// Remove o sufixo "////VEDADA A COMERCIALIZAÇÃO." e normaliza espaços.
function cleanDescricao(value: string): string {
  return value.replace(/\/{2,}.*$/s, "").replace(/\s+/g, " ").trim();
}

function buildTitulo(itens: Array<{ descricao: string }>): string | null {
  const first = itens[0]?.descricao;
  if (!first) return null;
  const head = first.length > 90 ? `${first.slice(0, 87).trimEnd()}…` : first;
  if (itens.length <= 1) return head;
  const extra = itens.length - 1;
  return `${head} (+${extra} ${extra === 1 ? "item" : "itens"})`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const edle = url.searchParams.get("edle") ?? url.searchParams.get("edital") ?? "";
  const lote = url.searchParams.get("lote") ?? "";
  const parts = padEdle(edle);
  if (!parts || !lote) {
    return json({ ok: false, error: "Parâmetros 'edle' e 'lote' são obrigatórios." }, 400);
  }

  const api = `${BASE}/api/lote/${parts.unidade}/${parts.numero}/${parts.exercicio}/${encodeURIComponent(lote)}`;
  try {
    const res = await fetch(api, { headers: { accept: "application/json", "user-agent": UA } });
    if (!res.ok) return json({ ok: false, error: `Receita respondeu ${res.status}` }, 502);
    const data = (await res.json()) as RawLoteDetalhe;

    const itens = (data.itensDetalhesLote ?? [])
      .map((it) => {
        const out: { descricao: string; quantidade?: string; unidade?: string } = {
          descricao: cleanDescricao(String(it.descricao ?? "")),
        };
        if (it.quantidade !== undefined && it.quantidade !== null) out.quantidade = String(it.quantidade);
        if (it.unMedida) out.unidade = String(it.unMedida);
        return out;
      })
      .filter((it) => it.descricao.length > 0);

    const recinto = (data.itensDetalhesLote ?? [])
      .map((it) => it.recintoArmazenador)
      .find((r): r is string => typeof r === "string" && r.trim().length > 0);

    const imagens = (data.imagens ?? [])
      .map((i) => i.src)
      .filter((s): s is string => typeof s === "string" && s.length > 0);

    const avisos = (data.avisosErratas ?? [])
      .map((a) => (a.texto ?? "").trim())
      .filter((t) => t.length > 0);

    return json({
      ok: true,
      titulo: buildTitulo(itens),
      categoria: data.tipo ?? null,
      recinto: recinto ?? null,
      itens,
      imagens,
      avisos,
    });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 502);
  }
});
