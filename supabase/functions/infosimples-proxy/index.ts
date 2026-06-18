// Supabase Edge Function: "infosimples-proxy" — proxy server-side para a
// InfoSimples (agregador PAGO por consulta). Construido para ficar DORMENTE ate
// a chave ser configurada, com CACHE-FIRST e TRAVA DE GASTO.
//
// POR QUE EXISTE: a InfoSimples cobra por consulta (~R$0,05-0,20, franquia min.
// R$100/mes). O token NUNCA pode ir ao browser, e uma consulta nunca pode ser
// disparada sem: (1) usuario logado em plano PAGO, (2) cache miss, (3) abaixo do
// teto mensal e do limite diario do usuario. Primeiro caso de uso: INPI / Marcas
// por CNPJ. Estruturado por `kind` p/ somar tribunais/certidoes depois.
//
// AUTH (verify_jwt=false — autorizado aqui dentro, igual a function "fonteia"):
//   - header `apikey` = publishable key do projeto (gate de endpoint publico);
//   - Authorization: Bearer <token de SESSAO> -> getVerifiedUserId (authz real);
//   - RPC my_plan: so plano 'pro'/'corporativo' dispara consulta paga.
//
// SEGREDOS (Supabase -> Edge Functions -> Secrets):
//   INFOSIMPLES_TOKEN          obrigatorio p/ LIGAR. Ausente => 200 configured:false
//                              (DORMENTE: o front cai no comportamento atual).
//   INFOSIMPLES_MONTHLY_CAP    opcional; teto de chamadas 'live'/mes (default 400).
//   INFOSIMPLES_DAILY_PER_USER opcional; limite de chamadas 'live'/dia por usuario (default 20).
//   INFOSIMPLES_CACHE_TTL_DAYS opcional; frescor do cache em dias (default 60).
//   INFOSIMPLES_TIMEOUT_S      opcional; timeout enviado a InfoSimples em s (default 300).
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  injetados pela plataforma.
//
// DOC InfoSimples (confirmado via WebSearch/WebFetch, jun/2026):
//   endpoint: POST https://api.infosimples.com/api/v2/consultas/inpi/marcas-titular
//   params  : token, cnpj | cpf, pagina, timeout (form-urlencoded)
//   envelope: { code, code_message, header, data_count, data[], errors[], site_receipts[] }
//   codigos : 200 (1 resultado) / 201 (varios) = sucesso; 600..621 = erro
//             (601 token invalido, 605 timeout no site, 612 sem resultado, 618 rate-limit).
//   data[].processos[]: { numero, marca, classe, situacao, tipo, titular, prioridade, registro }

import { getVerifiedUserId, hasValidApiKey } from "../_shared/auth.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { fetchWithRetry } from "../_shared/http.ts";

// Chave publica do projeto (vai no bundle do front — publica por design). Mesma
// usada na function "fonteia"; serve de gate de endpoint e de apikey ao my_plan.
const PUBLISHABLE_KEY = "sb_publishable_uojihld8t92MQXo7gXrR3w_WPVn4RkZ";

const PROVIDER = "infosimples";

// Defaults da trava — sobrescreviveis por secret (sem redeploy de logica).
const DEFAULT_MONTHLY_CAP = 400;
const DEFAULT_DAILY_PER_USER = 20;
const DEFAULT_CACHE_TTL_DAYS = 60;
const DEFAULT_TIMEOUT_S = 300;

function envInt(name: string, fallback: number): number {
  const raw = (Deno.env.get(name) ?? "").trim();
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Mantem so digitos; devolve "" se nao restarem exatamente 14 (CNPJ). */
function sanitizeCnpj(value: string): string {
  const digits = (value ?? "").replace(/\D+/g, "");
  return digits.length === 14 ? digits : "";
}

// ─── Catalogo de consultas (generico por `kind`) ─────────────────────────────
//
// Cada kind mapeia para: o endpoint da InfoSimples, como montar os params da
// chave de consulta, a validacao da chave, e um normalizador do `data` -> shape
// estavel que o front consome. Adicionar tribunais/certidoes = +1 entrada aqui.

interface LookupDef {
  /** Path completo do endpoint InfoSimples (POST). */
  endpoint: string;
  /** Le os query params da request e devolve { key, params } ou um erro. */
  build: (url: URL) => { key: string; params: Record<string, string> } | { error: string };
  /** Normaliza o envelope.data da InfoSimples p/ um shape estavel do front. */
  normalize: (data: unknown[]) => unknown;
}

interface InpiProcesso {
  numero: string;
  marca: string;
  classe: string;
  situacao: string;
  tipo: string;
  titular: string;
  prioridade: string;
  registro: string;
}

const asStr = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

const LOOKUPS: Record<string, LookupDef> = {
  // INPI / Marcas por CNPJ (titular). Caso de uso #1.
  "inpi-marcas-cnpj": {
    endpoint: "https://api.infosimples.com/api/v2/consultas/inpi/marcas-titular",
    build: (url) => {
      const cnpj = sanitizeCnpj(url.searchParams.get("cnpj") ?? "");
      if (!cnpj) return { error: "CNPJ invalido: informe os 14 numeros." };
      const pagina = url.searchParams.get("pagina") ?? "1";
      // A chave de cache inclui a pagina (cada pagina e uma consulta distinta).
      return { key: `${cnpj}:p${pagina}`, params: { cnpj, pagina } };
    },
    normalize: (data) => {
      // O endpoint de marcas devolve data[0] com processos[] + totais.
      const first = (data[0] ?? {}) as Record<string, unknown>;
      const rawProcessos = Array.isArray(first.processos) ? first.processos : [];
      const trademarks: InpiProcesso[] = rawProcessos.map((p) => {
        const o = (p ?? {}) as Record<string, unknown>;
        return {
          numero: asStr(o.numero),
          marca: asStr(o.marca),
          classe: asStr(o.classe),
          situacao: asStr(o.situacao),
          tipo: asStr(o.tipo),
          titular: asStr(o.titular),
          prioridade: asStr(o.prioridade),
          registro: asStr(o.registro),
        };
      });
      return {
        trademarks,
        total: Number(first.processos_total ?? trademarks.length) || trademarks.length,
        totalPaginas: Number(first.total_paginas ?? 1) || 1,
        paginaAtual: Number(first.pagina_atual ?? 1) || 1,
      };
    },
  },
};

// ─── Plano do usuario (gating: so plano pago dispara consulta paga) ──────────
async function isPaidUser(req: Request, supabaseUrl: string): Promise<boolean> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  // Publishable key nao e sessao; sem token de usuario => nao e pago.
  if (!token || token === PUBLISHABLE_KEY || token.startsWith("sb_publishable_")) return false;
  try {
    const res = await fetchWithRetry(`${supabaseUrl}/rest/v1/rpc/my_plan`, {
      timeoutMs: 10000,
      retries: 1,
      init: {
        method: "POST",
        headers: {
          apikey: PUBLISHABLE_KEY,
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: "{}",
      },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { plan?: string };
    return data.plan === "pro" || data.plan === "corporativo";
  } catch {
    return false;
  }
}

// ─── Acesso a tabela external_lookups (service_role; ignora RLS) ─────────────
interface DbCtx {
  url: string;
  serviceKey: string;
}

function dbCtx(): DbCtx | null {
  const url = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) return null;
  return { url, serviceKey };
}

function dbHeaders(db: DbCtx, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: db.serviceKey,
    authorization: `Bearer ${db.serviceKey}`,
    "content-type": "application/json",
    ...extra,
  };
}

interface CacheRow {
  payload: unknown;
  fetched_at: string;
}

// Le a linha de cache (provider, kind, key). Devolve null em qualquer falha
// (fail-open p/ leitura: pior caso = cache miss, que a trava ainda protege).
async function readCache(db: DbCtx, kind: string, key: string): Promise<CacheRow | null> {
  try {
    const qs = new URLSearchParams({
      provider: `eq.${PROVIDER}`,
      lookup_kind: `eq.${kind}`,
      lookup_key: `eq.${key}`,
      select: "payload,fetched_at",
      limit: "1",
    });
    const res = await fetchWithRetry(`${db.url}/rest/v1/external_lookups?${qs}`, {
      timeoutMs: 8000,
      retries: 1,
      init: { headers: dbHeaders(db) },
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as CacheRow[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

// Grava (upsert) o resultado 'live' no cache. on_conflict no indice unico
// (provider, lookup_kind, lookup_key) p/ atualizar payload+fetched_at no refresh.
async function writeCache(
  db: DbCtx,
  kind: string,
  key: string,
  payload: unknown,
  userId: string,
): Promise<void> {
  try {
    await fetchWithRetry(
      `${db.url}/rest/v1/external_lookups?on_conflict=provider,lookup_kind,lookup_key`,
      {
        timeoutMs: 8000,
        retries: 1,
        init: {
          method: "POST",
          headers: dbHeaders(db, { prefer: "resolution=merge-duplicates,return=minimal" }),
          body: JSON.stringify({
            provider: PROVIDER,
            lookup_kind: kind,
            lookup_key: key,
            payload,
            source: "live",
            requested_by: userId,
            fetched_at: new Date().toISOString(),
          }),
        },
      },
    );
  } catch (e) {
    // Falha de escrita nao derruba a resposta — so perde o cache desta consulta.
    console.error("[infosimples-proxy] writeCache falhou:", String(e));
  }
}

// Conta chamadas 'live' do mes (trava de gasto). Fail-CLOSED: se nao der p/
// contar, assume estouro e NAO chama a API paga (seguranca de custo > UX).
async function monthlyLiveCount(db: DbCtx): Promise<number | null> {
  try {
    const res = await fetchWithRetry(`${db.url}/rest/v1/rpc/external_lookup_spend_count`, {
      timeoutMs: 8000,
      retries: 1,
      init: { method: "POST", headers: dbHeaders(db), body: JSON.stringify({ p_provider: PROVIDER }) },
    });
    if (!res.ok) return null;
    return Number(await res.json());
  } catch {
    return null;
  }
}

// Conta chamadas 'live' do usuario nas ultimas 24h (rate-limit). Fail-OPEN:
// a trava mensal global ja segura o custo; nao penalizamos o usuario por erro de infra.
async function userDayCount(db: DbCtx, userId: string): Promise<number> {
  try {
    const res = await fetchWithRetry(`${db.url}/rest/v1/rpc/external_lookup_user_day_count`, {
      timeoutMs: 8000,
      retries: 1,
      init: {
        method: "POST",
        headers: dbHeaders(db),
        body: JSON.stringify({ p_provider: PROVIDER, p_user: userId }),
      },
    });
    if (!res.ok) return 0;
    return Number(await res.json()) || 0;
  } catch {
    return 0;
  }
}

// ─── Chamada a InfoSimples ───────────────────────────────────────────────────
interface InfosimplesEnvelope {
  code?: number;
  code_message?: string;
  data?: unknown[];
  errors?: unknown[];
  site_receipts?: unknown[];
}

async function callInfosimples(
  def: LookupDef,
  token: string,
  params: Record<string, string>,
): Promise<InfosimplesEnvelope> {
  const form = new URLSearchParams({ token, timeout: String(envInt("INFOSIMPLES_TIMEOUT_S", DEFAULT_TIMEOUT_S)) });
  for (const [k, v] of Object.entries(params)) form.set(k, v);
  // timeoutMs do nosso fetch > timeout da InfoSimples p/ nao abortar antes dela.
  const res = await fetchWithRetry(def.endpoint, {
    timeoutMs: (envInt("INFOSIMPLES_TIMEOUT_S", DEFAULT_TIMEOUT_S) + 20) * 1000,
    retries: 1,
    backoffMs: 1500,
    // Nao re-tentar 4xx (codigos de negocio); so erro de rede/5xx via throw.
    retryOnStatus: (s) => s >= 500,
    init: {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: form.toString(),
    },
  });
  return (await res.json()) as InfosimplesEnvelope;
}

// ─── Handler ─────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req, { methods: "GET, POST, OPTIONS" });
  if (preflight) return preflight;

  const reply = (body: unknown, status = 200) => jsonResponse(body, { status }, req);

  // Gate 1: header apikey (publishable). Sem ele, endpoint nao responde.
  if (!hasValidApiKey(req, PUBLISHABLE_KEY)) {
    return reply({ ok: false, error: "apikey_invalida", message: "apikey ausente ou invalida." }, 401);
  }

  const url = new URL(req.url);

  // Health: util p/ checar se a integracao esta ligada sem gastar consulta.
  if (url.pathname.endsWith("/health")) {
    return reply({
      service: "infosimples-proxy",
      status: "ok",
      configured: Boolean((Deno.env.get("INFOSIMPLES_TOKEN") ?? "").trim()),
      kinds: Object.keys(LOOKUPS),
      time: new Date().toISOString(),
    });
  }

  // DORMENTE: sem token => 200 configured:false, SEM erro. O front mantem o
  // comportamento atual (RPI/base ingerida). Responde antes de qualquer authz
  // de sessao p/ nunca custar nada e nunca quebrar a tela.
  const token = (Deno.env.get("INFOSIMPLES_TOKEN") ?? "").trim();
  if (!token) {
    return reply({
      ok: true,
      configured: false,
      source: "disabled",
      message: "InfoSimples nao configurada.",
    });
  }

  // Gate 2: usuario logado (token de sessao verificado contra o Supabase Auth).
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const userId = supabaseUrl ? await getVerifiedUserId(req, supabaseUrl, PUBLISHABLE_KEY) : null;
  if (!userId) {
    return reply(
      {
        ok: false,
        configured: true,
        error: "login_requerido",
        message: "Faca login para consultar dados premium (InfoSimples).",
      },
      401,
    );
  }

  // Gate 3: so plano PAGO dispara consulta paga.
  if (!(await isPaidUser(req, supabaseUrl))) {
    return reply(
      {
        ok: false,
        configured: true,
        error: "plano_requerido",
        message: "A consulta InfoSimples e do plano pago. Assine para liberar.",
      },
      403,
    );
  }

  // Roteamento por `kind` (default = caso de uso #1: INPI marcas por CNPJ).
  const kind = (url.searchParams.get("kind") ?? "inpi-marcas-cnpj").trim();
  const def = LOOKUPS[kind];
  if (!def) {
    return reply({ ok: false, configured: true, error: "kind_invalido", message: `kind '${kind}' nao suportado.` }, 400);
  }

  const built = def.build(url);
  if ("error" in built) {
    return reply({ ok: false, configured: true, error: "parametro_invalido", message: built.error }, 400);
  }

  const db = dbCtx();
  if (!db) {
    // Sem acesso ao banco nao ha como aplicar cache nem trava => NAO gastamos.
    return reply(
      { ok: false, configured: true, error: "indisponivel", message: "Servico temporariamente indisponivel." },
      503,
    );
  }

  // CACHE-FIRST: hit fresco (dentro do TTL) => devolve do cache, custo ZERO.
  const ttlMs = envInt("INFOSIMPLES_CACHE_TTL_DAYS", DEFAULT_CACHE_TTL_DAYS) * 86_400_000;
  const cached = await readCache(db, kind, built.key);
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < ttlMs) {
    // Spread do payload PRIMEIRO p/ os campos do envelope (source:'cache' etc.) vencerem.
    return reply({ ...(cached.payload as object), ok: true, configured: true, source: "cache", kind, cachedAt: cached.fetched_at });
  }

  // RATE-LIMIT por usuario (chamadas 'live'/dia). Acima do limite, recusa.
  const dailyCap = envInt("INFOSIMPLES_DAILY_PER_USER", DEFAULT_DAILY_PER_USER);
  if ((await userDayCount(db, userId)) >= dailyCap) {
    return reply(
      {
        ok: false,
        configured: true,
        error: "rate_limited",
        message: `Limite diario de ${dailyCap} consultas premium atingido. Tente amanha.`,
      },
      429,
    );
  }

  // TRAVA DE GASTO mensal. Fail-closed: se nao conseguimos contar, recusamos
  // (nunca chamamos a API paga as cegas). Acima do teto, recusa com mensagem clara.
  const monthlyCap = envInt("INFOSIMPLES_MONTHLY_CAP", DEFAULT_MONTHLY_CAP);
  const used = await monthlyLiveCount(db);
  if (used === null) {
    return reply(
      { ok: false, configured: true, error: "indisponivel", message: "Nao foi possivel validar a cota. Tente mais tarde." },
      503,
    );
  }
  if (used >= monthlyCap) {
    return reply(
      {
        ok: false,
        configured: true,
        error: "cota_mensal_excedida",
        message: "Cota mensal de consultas premium atingida. Fale com o suporte.",
        used,
        cap: monthlyCap,
      },
      429,
    );
  }

  // LIVE: chama a InfoSimples. Degrada com elegancia — qualquer falha vira
  // 200 ok:false (nao derruba a tela), e so gravamos cache em sucesso real.
  try {
    const env = await callInfosimples(def, token, built.params);
    const success = env.code === 200 || env.code === 201;
    if (!success) {
      // Codigo de negocio (sem resultado, captcha, etc.): nao e cache, nao trava.
      return reply({
        ok: false,
        configured: true,
        source: "live",
        kind,
        code: env.code ?? null,
        message: env.code_message ?? "Consulta sem resultado.",
        errors: env.errors ?? [],
      });
    }

    const normalized = def.normalize(env.data ?? []);
    const payload = {
      ...(normalized as object),
      code: env.code,
      codeMessage: env.code_message ?? null,
      siteReceipts: env.site_receipts ?? [],
    };
    // So o sucesso conta na trava e entra no cache.
    await writeCache(db, kind, built.key, payload, userId);
    return reply({ ok: true, configured: true, source: "live", kind, ...payload });
  } catch (error) {
    console.error("[infosimples-proxy] live falhou:", String(error));
    // Erro de rede/timeout: nao gravamos cache (sem custo confirmado) e nao
    // quebramos o front — ok:false com 200.
    return reply({
      ok: false,
      configured: true,
      source: "live",
      kind,
      error: "falha_consulta",
      message: "Nao foi possivel consultar a InfoSimples agora. Tente novamente em instantes.",
    });
  }
});
