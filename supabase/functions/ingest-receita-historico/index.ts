// Supabase Edge Function: "ingest-receita-historico"
//
// CAPTURA do histórico de preços de lotes de leilão (Receita Federal / SLE),
// direto da API pública JSON — incluindo os editais ENCERRADOS/ATA/CANCELADOS que
// o coletor de "destaques" nunca trouxe (por isso a base só tinha lotes abertos).
//
// FONTE (ver docs/research/SLE_INGESTION_CONTRACT.md):
//   GET /api/editais-disponiveis            → catálogo completo (situacoes[].lista[])
//   GET /api/edital/{unidade}/{numero}/{ex} → edital + listaLotes[] (valores em REAIS)
//
// O QUE FAZ
//   1. Lista todos os editais e filtra os TERMINAIS (não abertos: !{2,3,5,6,7}).
//   2. Para cada edital (com pacing ~400ms), busca o edital + lotes.
//   3. Faz UPSERT idempotente em public.auction_lot_history (chave receita_lot_id),
//      preservando lance mínimo, avaliação, categoria, datas e evidência
//      (source_url + sha256 + collected_at). NUNCA grava final_value_* (o arremate
//      vem da ata, em outra função) — e o upsert não o apaga (não está no payload).
//
// PAGINAÇÃO / TIMEOUT
//   ?limit=N (default 40) e ?offset=M sobre a lista de editais terminais. Mantém
//   cada execução bem abaixo do timeout (~150s). Re-rodar é seguro (idempotente).
//
// SEGREDOS: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY injetados pelo Supabase.
//   Escrita só com service_role (RLS da tabela bloqueia anon). Opcional:
//   INGEST_CRON_SECRET (se definido, exige Bearer correspondente).
//
// verify_jwt = false: só lê dado PÚBLICO da Receita e escreve em tabela de leitura
//   pública. Sem segredo exposto. Guarda opcional via INGEST_CRON_SECRET.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SLE = "https://www25.receita.fazenda.gov.br/sle-sociedade";
const PORTAL = `${SLE}/portal`;
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";

// Situações de edital consideradas ABERTAS (pré/durante o pregão) — puladas aqui,
// pois esses lotes ainda estão no catálogo vivo (entities). Capturamos o resto.
const OPEN_SITUACOES = new Set([2, 3, 5, 6, 7]);

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

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Replica public.fonteia_norm_text (translate de acentos PT-BR + lower + trim).
const ACC_FROM = "ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ";
const ACC_TO = "aaaaaaaaaaeeeeeeeeiiiiiiiioooooooooouuuuuuuucCnn";
function normText(s: unknown): string | null {
  if (typeof s !== "string" || s.trim() === "") return null;
  let out = "";
  for (const ch of s) {
    const i = ACC_FROM.indexOf(ch);
    out += i >= 0 ? ACC_TO[i] : ch;
  }
  return out.toLowerCase().trim();
}

// "2026-07-15 21:00" (horário de Brasília) → ISO com offset -03:00.
function toIso(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const m = s.trim();
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(m)) return null;
  return `${m.slice(0, 16).replace(" ", "T")}:00-03:00`;
}

function reaisToCents(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null;
}

interface EditalLite {
  edle?: string;
  edital?: string;
  codigoSituacao?: number;
  cidade?: string;
}
interface Lote {
  nrAtribuido?: number;
  loleNrSq?: number;
  tipo?: string;
  situacaoLote?: number;
  valorMinimo?: number;
  valorAvaliacao?: number;
}
interface EditalFull {
  edle?: string;
  edital?: string;
  situacao?: number;
  cidade?: string;
  dataFimPropostas?: string;
  dataAberturaLances?: string;
  listaLotes?: Lote[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
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
  const limit = Math.min(Math.max(Number(u.searchParams.get("limit")) || 40, 1), 200);
  const offset = Math.max(Number(u.searchParams.get("offset")) || 0, 0);

  try {
    // 1. Catálogo completo → editais terminais (não abertos).
    const catalog = await fetchJson<{ situacoes?: Array<{ situacao?: number; lista?: EditalLite[] }> }>(
      `${SLE}/api/editais-disponiveis`,
    );
    const terminais: EditalLite[] = [];
    for (const grp of catalog.situacoes ?? []) {
      const sit = grp.situacao ?? -1;
      if (OPEN_SITUACOES.has(sit)) continue;
      for (const e of grp.lista ?? []) terminais.push({ ...e, codigoSituacao: e.codigoSituacao ?? sit });
    }
    terminais.sort((a, b) => (a.edle ?? "").localeCompare(b.edle ?? ""));
    const slice = terminais.slice(offset, offset + limit);

    let editaisOk = 0;
    let lotsUpserted = 0;
    const errors: string[] = [];

    for (const lite of slice) {
      const edle = lite.edle;
      if (!edle) continue;
      const parts = edle.split("/");
      if (parts.length !== 3 || !parts.every((p) => /^\d+$/.test(p))) continue;

      try {
        const ed = await fetchJson<EditalFull>(`${SLE}/api/edital/${parts[0]}/${parts[1]}/${parts[2]}`);
        const sit = ed.situacao ?? lite.codigoSituacao ?? -1;
        const outcome = sit === 14 ? "cancelled" : "closed";
        const closedAt = toIso(ed.dataAberturaLances) ?? toIso(ed.dataFimPropostas);
        const deadline = toIso(ed.dataFimPropostas);
        const city = (ed.cidade ?? lite.cidade ?? "").trim() || null;

        const rows: Record<string, unknown>[] = [];
        for (const lote of ed.listaLotes ?? []) {
          const nr = lote.nrAtribuido ?? lote.loleNrSq;
          if (nr == null) continue;
          const attrs = { ...lote, edle, edital: ed.edital, situacaoEdital: sit, cidade: city };
          rows.push({
            source_id: "receita-leiloes-sle",
            receita_lot_id: `${edle.replaceAll("/", "-")}-${nr}`,
            edital: ed.edital ?? lite.edital ?? null,
            edle,
            lot_number: String(nr),
            category_raw: typeof lote.tipo === "string" ? lote.tipo.trim() || null : null,
            category_norm: normText(lote.tipo),
            title: typeof lote.tipo === "string" ? lote.tipo.trim() || null : null,
            city,
            minimum_bid_cents: reaisToCents(lote.valorMinimo),
            appraisal_cents: reaisToCents(lote.valorAvaliacao),
            outcome,
            edital_situacao: sit,
            lot_situacao: lote.situacaoLote ?? null,
            proposal_deadline: deadline,
            closed_at: closedAt,
            last_snapshot_at: new Date().toISOString(),
            source_url: `${PORTAL}/edital/${edle}/lote/${nr}`,
            content_hash: `sha256:${await sha256hex(JSON.stringify(lote))}`,
            collected_at: new Date().toISOString(),
            attributes: attrs,
          });
        }

        if (rows.length > 0) {
          const res = await fetch(
            `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/auction_lot_history?on_conflict=receita_lot_id`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                apikey: serviceKey,
                authorization: `Bearer ${serviceKey}`,
                prefer: "resolution=merge-duplicates,return=minimal",
              },
              body: JSON.stringify(rows),
            },
          );
          if (!res.ok) {
            errors.push(`upsert ${edle}: ${res.status} ${(await res.text()).slice(0, 200)}`);
          } else {
            lotsUpserted += rows.length;
          }
        }
        editaisOk += 1;
      } catch (e) {
        errors.push(`${edle}: ${String(e).slice(0, 160)}`);
      }
      await sleep(400); // politeness (~1 req / 0.4s + processamento)
    }

    const nextOffset = offset + slice.length;
    return json({
      ok: true,
      source: "ingest-receita-historico",
      terminaisTotal: terminais.length,
      processedEditais: editaisOk,
      lotsUpserted,
      offset,
      nextOffset: nextOffset < terminais.length ? nextOffset : null,
      hasMore: nextOffset < terminais.length,
      errors: errors.slice(0, 20),
    });
  } catch (e) {
    return json({ ok: false, source: "ingest-receita-historico", error: String(e) }, 500);
  }
});
