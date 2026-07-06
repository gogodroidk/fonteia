// Supabase Edge Function: "enrich-sales-leads"
//
// Enriquece os leads de vendas (public.sales_leads) com CONTATO oficial de PJ —
// email, telefone, razão social, CNAE, porte, sócios — a partir da MINHA RECEITA
// (minhareceita.org), espelho aberto e GRATUITO da base de CNPJ da Receita Federal.
//
// ROTEAMENTO POR CUSTO: fonte grátis primeiro. A InfoSimples (paga) fica para uma
// camada premium de compliance depois (certidões/sanções), não para o contato.
//
// PRIORIDADE: processa os leads `pending` ordenados por GMV arrematado DESC — os
// maiores compradores ganham contato primeiro (é onde está o dinheiro).
//
// PAGINAÇÃO: cada invocação processa um lote (limit, default 40, máx 100). Chame
// repetidamente (cron ou manual) até `remaining_pending` = 0. Rate-limit educado
// com a fonte pública (sleep entre chamadas live).
//
// AUTH: verify_jwt=false. Guard opcional ENRICH_CRON_SECRET (Bearer). Só roda com
//   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (service_role ignora a RLS estrita da
//   sales_leads). Nunca exposto ao browser.
//
// SEGREDOS (Supabase -> Edge Functions -> Secrets):
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  injetados pela plataforma.
//   ENRICH_CRON_SECRET   opcional; se setado, exige Authorization: Bearer <secret>.

const MINHA_RECEITA = "https://minhareceita.org";
const UA = "FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)";

// fetch com timeout (inline p/ deploy autocontido, sem dependência de ../_shared).
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

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
const trimStr = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

// E-mail só é aceito com formato plausível (senão vira "" — nada de contato falso).
function cleanEmail(v: unknown): string {
  const s = trimStr(v).toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : "";
}

// Telefone da Receita costuma vir com placeholders (ex.: "6200000000", subscriber
// todo-zero). Mantém só dígitos; rejeita < 10 dígitos ou subscriber (pós-DDD)
// repetitivo/zerado. Retorna dígitos limpos ou "".
function cleanPhone(v: unknown): string {
  const d = trimStr(v).replace(/\D+/g, "");
  if (d.length < 10 || d.length > 11) return "";
  const sub = d.slice(2); // remove DDD
  if (/^0+$/.test(sub)) return "";              // subscriber todo zero
  if (/^(\d)\1+$/.test(sub)) return "";          // subscriber com um único dígito repetido
  return d;
}

interface RawSocio {
  nome_socio?: string;
  qualificacao_socio?: string;
}
interface RawEmpresa {
  razao_social?: string;
  nome_fantasia?: string;
  descricao_situacao_cadastral?: string;
  cnae_fiscal?: number;
  cnae_fiscal_descricao?: string;
  porte?: string;
  uf?: string;
  municipio?: string;
  ddd_telefone_1?: string;
  email?: string;
  qsa?: RawSocio[];
  message?: string;
  detail?: string;
}

interface Contact {
  razao_social: string;
  nome_fantasia: string;
  email: string;
  telefone: string;
  uf: string;
  municipio: string;
  cnae: string;
  cnae_codigo: string;
  porte: string;
  situacao_cadastral: string;
  socios: { nome: string; qualificacao: string }[];
}

type FetchResult =
  | { ok: true; contact: Contact }
  | { notFound: true }
  | { failed: string };

async function fetchContact(cnpj: string): Promise<FetchResult> {
  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${MINHA_RECEITA}/${cnpj}`,
      { headers: { accept: "application/json", "user-agent": UA } },
      12000,
    );
  } catch (e) {
    return { failed: String(e) };
  }
  if (res.status === 404) return { notFound: true };
  if (!res.ok) return { failed: `Minha Receita respondeu ${res.status}` };

  let raw: RawEmpresa;
  try {
    raw = (await res.json()) as RawEmpresa;
  } catch (e) {
    return { failed: `Resposta inválida: ${String(e)}` };
  }
  // 200 sem razão social + mensagem de erro = CNPJ inexistente/erro lógico.
  if (!raw || (trimStr(raw.razao_social) === "" && (raw.message || raw.detail))) {
    return { notFound: true };
  }

  const socios = (raw.qsa ?? [])
    .map((s) => ({ nome: trimStr(s.nome_socio), qualificacao: trimStr(s.qualificacao_socio) }))
    .filter((s) => s.nome !== "");

  return {
    ok: true,
    contact: {
      razao_social: trimStr(raw.razao_social),
      nome_fantasia: trimStr(raw.nome_fantasia),
      email: cleanEmail(raw.email),
      telefone: cleanPhone(raw.ddd_telefone_1),
      uf: trimStr(raw.uf),
      municipio: trimStr(raw.municipio),
      cnae: trimStr(raw.cnae_fiscal_descricao),
      cnae_codigo: raw.cnae_fiscal != null ? String(raw.cnae_fiscal) : "",
      porte: trimStr(raw.porte),
      situacao_cadastral: trimStr(raw.descricao_situacao_cadastral),
      socios,
    },
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const cronSecret = Deno.env.get("ENRICH_CRON_SECRET");
  if (cronSecret) {
    const auth = req.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) return json({ ok: false, error: "Unauthorized" }, 401);
  }

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ ok: false, error: "env ausente" }, 500);

  const restHeaders = {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    "content-type": "application/json",
  };

  const u = new URL(req.url);
  const limit = Math.min(Math.max(Number(u.searchParams.get("limit")) || 40, 1), 100);

  try {
    // Seleciona leads pendentes priorizando MAIOR GMV arrematado (mais dinheiro primeiro).
    const listUrl =
      `${supabaseUrl}/rest/v1/sales_leads` +
      `?select=cnpj&enrichment_status=eq.pending&order=total_won_cents.desc&limit=${limit}`;
    const listRes = await fetch(listUrl, { headers: restHeaders });
    if (!listRes.ok) throw new Error(`select ${listRes.status}: ${(await listRes.text()).slice(0, 200)}`);
    const pending = (await listRes.json()) as Array<{ cnpj: string }>;

    let enriched = 0, notFound = 0, failed = 0, withEmail = 0, withPhone = 0;
    const errors: string[] = [];

    for (const { cnpj } of pending) {
      const result = await fetchContact(cnpj);

      let patch: Record<string, unknown>;
      if ("ok" in result) {
        const c = result.contact;
        const hasContact = c.email !== "" || c.telefone !== "";
        if (c.email) withEmail += 1;
        if (c.telefone) withPhone += 1;
        enriched += 1;
        patch = {
          razao_social: c.razao_social || null,
          nome_fantasia: c.nome_fantasia || null,
          email: c.email || null,
          telefone: c.telefone || null,
          uf: c.uf || null,
          municipio: c.municipio || null,
          cnae: c.cnae || null,
          cnae_codigo: c.cnae_codigo || null,
          porte: c.porte || null,
          situacao_cadastral: c.situacao_cadastral || null,
          socios: c.socios.length ? c.socios : null,
          enrichment_status: "enriched",
          enriched_at: new Date().toISOString(),
          contact_source: "minhareceita",
          // Avança o estágio só se o lead ainda estava 'novo' e tem como ser contatado.
          stage: hasContact ? "enriquecido" : "novo",
        };
      } else if ("notFound" in result) {
        notFound += 1;
        patch = { enrichment_status: "not_found", enriched_at: new Date().toISOString() };
      } else {
        failed += 1;
        errors.push(`${cnpj}: ${result.failed.slice(0, 120)}`);
        patch = { enrichment_status: "failed", enriched_at: new Date().toISOString() };
      }

      const patchRes = await fetch(`${supabaseUrl}/rest/v1/sales_leads?cnpj=eq.${cnpj}`, {
        method: "PATCH",
        headers: { ...restHeaders, prefer: "return=minimal" },
        body: JSON.stringify(patch),
      });
      if (!patchRes.ok) {
        errors.push(`${cnpj}: patch ${patchRes.status}`);
      }

      // Rate-limit educado com a fonte pública gratuita.
      await sleep(700);
    }

    // Quantos ainda faltam?
    const cntRes = await fetch(
      `${supabaseUrl}/rest/v1/sales_leads?select=cnpj&enrichment_status=eq.pending&limit=1`,
      { headers: { ...restHeaders, prefer: "count=exact", range: "0-0" } },
    );
    const contentRange = cntRes.headers.get("content-range") ?? "*/?";
    const remaining = Number(contentRange.split("/")[1]) || 0;

    return json({
      ok: true,
      source: "enrich-sales-leads",
      processed: pending.length,
      enriched,
      not_found: notFound,
      failed,
      with_email: withEmail,
      with_phone: withPhone,
      remaining_pending: remaining,
      errors: errors.slice(0, 20),
    });
  } catch (e) {
    return json({ ok: false, source: "enrich-sales-leads", error: String(e) }, 500);
  }
});
