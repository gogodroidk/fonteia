// Supabase Edge Function: "ingest-receita-atas"
//
// Enriquece a base histórica de lotes (public.auction_lot_history) com o ARREMATE
// (preço final de venda) e o ARREMATANTE (vencedor), a partir do PDF público
// "Extrato do Leilão" da Receita Federal (SLE).
//
// FLUXO
//   1. GET api/editais-disponiveis → editais com resultado (situação 10/11/12/15).
//   2. Para cada edital: GET api/edital/{u}/{n}/{e}/extrato-leilao → JSON
//      { data: <base64> } → bytes do PDF → texto (unpdf) → parseExtrato().
//   3. RPC apply_extrato_results(edle, resultados) grava o edital inteiro numa
//      chamada, NÃO-REGRESSIVO (não sobrescreve arremate de fonte melhor).
//
// PRIVACIDADE: CPF de pessoa física já vem MASCARADO da Receita; CNPJ é público.
//   Reespelho de documento oficial público, com fonte+data. Sem desmascaramento.
//
// SEGREDOS: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (injetados). A RPC é
//   service_role-only. Guard opcional INGEST_CRON_SECRET. verify_jwt=false.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getDocumentProxy } from "npm:unpdf";
import { parseExtrato, parseTotalGeral } from "./parse-extrato.ts";

const SLE = "https://www25.receita.fazenda.gov.br/sle-sociedade";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";
// Situações com sessão realizada (extrato disponível). 14=cancelado fica fora.
const RESULT_SITUACOES = new Set([10, 11, 12, 15]);

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, apikey, content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

interface EditalLite {
  edle?: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function extratoText(edle: string): Promise<string | null> {
  const [u, n, e] = edle.split("/");
  const res = await fetch(`${SLE}/api/edital/${u}/${n}/${e}/extrato-leilao`, {
    headers: { "user-agent": UA, accept: "application/json" },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { data?: string };
  if (!data?.data) return null;
  const bytes = b64ToBytes(data.data);
  const pdf = await getDocumentProxy(bytes);
  // Reconstrução POSICIONAL (como pdftotext -layout): agrupa os fragmentos de
  // texto por coordenada Y (linha) e ordena por X (coluna). O extractText liso do
  // unpdf embaralha a ordem coluna×linha e gera off-by-one (valor no lote errado);
  // reconstruir por posição preserva "Lote | doc | nome | valor" na ordem certa.
  const lines: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rowsByY = new Map<number, Array<{ x: number; s: string }>>();
    for (const it of content.items as Array<{ str?: string; transform?: number[] }>) {
      const s = typeof it.str === "string" ? it.str : "";
      if (s.trim() === "") continue;
      const tr = it.transform ?? [0, 0, 0, 0, 0, 0];
      const y = Math.round(tr[5] ?? 0);
      const x = tr[4] ?? 0;
      const arr = rowsByY.get(y) ?? [];
      arr.push({ x, s });
      rowsByY.set(y, arr);
    }
    const ys = [...rowsByY.keys()].sort((a, b) => b - a); // topo→base (Y desc no PDF)
    for (const y of ys) {
      const parts = (rowsByY.get(y) ?? []).sort((a, b) => a.x - b.x).map((o) => o.s);
      lines.push(parts.join(" "));
    }
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const cronSecret = Deno.env.get("INGEST_CRON_SECRET");
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "env ausente" }, 500);

  const u = new URL(req.url);
  const limit = Math.min(Math.max(Number(u.searchParams.get("limit")) || 15, 1), 100);
  const offset = Math.max(Number(u.searchParams.get("offset")) || 0, 0);
  const onlyEdle = u.searchParams.get("edle"); // teste de um único edital

  async function applyResults(edle: string, results: unknown[]): Promise<number> {
    const res = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/rpc/apply_extrato_results`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ p_edle: edle, p_results: results }),
    });
    if (!res.ok) throw new Error(`rpc ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as number;
  }

  try {
    let editais: string[];
    if (onlyEdle) {
      editais = [onlyEdle];
    } else {
      const catalog = await fetchJson<{ situacoes?: Array<{ situacao?: number; lista?: EditalLite[] }> }>(
        `${SLE}/api/editais-disponiveis`,
      );
      const all: string[] = [];
      for (const grp of catalog.situacoes ?? []) {
        if (!RESULT_SITUACOES.has(grp.situacao ?? -1)) continue;
        for (const e of grp.lista ?? []) if (e.edle) all.push(e.edle);
      }
      all.sort();
      editais = all.slice(offset, offset + limit);
    }

    let processed = 0;
    let lotsUpdated = 0;
    let naoArrematados = 0;
    let mismatchEditais = 0;
    const errors: string[] = [];

    for (const edle of editais) {
      const parts = edle.split("/");
      if (parts.length !== 3 || !parts.every((p) => /^\d+$/.test(p))) continue;
      try {
        const text = await extratoText(edle);
        if (!text) {
          errors.push(`${edle}: extrato vazio/indisponível`);
          continue;
        }
        const rows = parseExtrato(text);
        const arrematados = rows.filter((r) => r.arrematado);
        // Validação anti-lixo: a soma dos arremates DEVE bater com o "Total Geral"
        // oficial do extrato. Se não bate, o PDF foi mal extraído → pula o edital
        // (jamais grava arremate errado). Rastreável via errors[].
        const parsedSum = arrematados.reduce((a, r) => a + (r.valorCents ?? 0), 0);
        const totalGeral = parseTotalGeral(text);
        if (totalGeral != null && parsedSum !== totalGeral) {
          mismatchEditais += 1;
          errors.push(`${edle}: soma ${parsedSum} != Total Geral ${totalGeral} — parsing divergente, pulado`);
          continue;
        }
        naoArrematados += rows.filter((r) => !r.arrematado).length;
        if (arrematados.length > 0) {
          lotsUpdated += await applyResults(edle, arrematados);
        }
        processed += 1;
      } catch (e) {
        errors.push(`${edle}: ${String(e).slice(0, 160)}`);
      }
      await sleep(400);
    }

    const nextOffset = onlyEdle ? null : offset + editais.length;
    return json({
      ok: true,
      source: "ingest-receita-atas",
      processedEditais: processed,
      lotsUpdated,
      naoArrematados,
      mismatchEditais,
      offset,
      nextOffset,
      errors: errors.slice(0, 20),
    });
  } catch (e) {
    return json({ ok: false, source: "ingest-receita-atas", error: String(e) }, 500);
  }
});
