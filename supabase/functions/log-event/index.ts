// Supabase Edge Function: "log-event"
//
// Sink de telemetria do front-end. Recebe um batch de eventos (array JSON)
// e os insere na tabela `public.client_events` via Supabase REST/PostgREST.
//
// Design:
//   • NÃO exige autenticação do chamador (telemetria pública). A função usa a
//     chave ANON internamente — RLS da tabela permite INSERT para anon.
//   • Aceita POST com body: { events: TelemetryEvent[] }
//   • Valida e sanitiza cada evento antes de inserir (nunca confia no cliente).
//   • Rate-limit simples: rejeita batches com mais de 50 eventos de uma vez.
//   • LGPD: a função nunca loga, persiste ou propaga dados pessoais.
//     O campo `message` é re-sanitizado aqui como defesa em profundidade.
//
// Secrets:
//   SUPABASE_URL e SUPABASE_ANON_KEY são injetados automaticamente pelo Supabase.
//   Sem secrets adicionais necessários.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// ---------------------------------------------------------------------------
// CORS — aceita apenas origens conhecidas da Fonte.ia
// ---------------------------------------------------------------------------
const ALLOWED_ORIGINS = new Set([
  "https://fontebrasil.online",
  "https://www.fontebrasil.online",
  "https://fonteia.pages.dev",
  "http://localhost:5173",
  "http://localhost:4173",
]);

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.fontebrasil\.online$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.fonteia\.pages\.dev$/.test(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.igoreluisa\.workers\.dev$/.test(origin)) return true;
  return false;
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowedOrigin = isAllowedOrigin(origin) && origin ? origin : "https://fontebrasil.online";
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-headers": "content-type, apikey",
    "access-control-allow-methods": "POST, OPTIONS",
    "vary": "Origin",
  };
}

// ---------------------------------------------------------------------------
// Tipos e validação
// ---------------------------------------------------------------------------

const VALID_KINDS = new Set([
  "js_error",
  "boundary_error",
  "empty_result",
  "module_error",
  "page_not_loaded",
  "navigation",
  "feature_use",
]);

interface RawEvent {
  kind?: unknown;
  route?: unknown;
  message?: unknown;
  label?: unknown;
  ua_hint?: unknown;
  authed?: unknown;
  client_ts?: unknown;
}

interface ClientEventRow {
  kind: string;
  route: string;
  message: string | null;
  label: string | null;
  ua_hint: string | null;
  authed: boolean;
  client_ts: string;
  server_ts: string;
}

/** Garante string, truncada ao limite. Retorna null se não for string válida. */
function safeStr(val: unknown, maxLen: number): string | null {
  if (typeof val !== "string" || val.trim().length === 0) return null;
  return val.trim().slice(0, maxLen);
}

/** Remove patterns de PII do campo message (defesa em profundidade). */
function sanitizeMessage(raw: string): string {
  return raw
    .replace(/\b\d{11,14}\b/g, "[redacted]")               // CPF/CNPJ numérico
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]")       // e-mails
    .replace(/Bearer\s+[A-Za-z0-9._\-]{20,}/g, "[token]")  // tokens JWT
    .slice(0, 1000);
}

function validateAndNormalizeEvent(raw: RawEvent, serverTs: string): ClientEventRow | null {
  const kind = safeStr(raw.kind, 64);
  if (!kind || !VALID_KINDS.has(kind)) return null;

  const route = safeStr(raw.route, 512);
  if (!route) return null;

  const messageRaw = safeStr(raw.message, 1000);
  const message = messageRaw ? sanitizeMessage(messageRaw) : null;

  const label = safeStr(raw.label, 128);
  const ua_hint = safeStr(raw.ua_hint, 128);
  const authed = raw.authed === true;

  // client_ts: aceita ISO8601 válido, senão usa server_ts
  let client_ts = serverTs;
  if (typeof raw.client_ts === "string") {
    const d = new Date(raw.client_ts);
    if (!isNaN(d.getTime())) {
      client_ts = d.toISOString();
    }
  }

  return { kind, route, message, label, ua_hint, authed, client_ts, server_ts: serverTs };
}

// ---------------------------------------------------------------------------
// Handler principal
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido." }), {
      status: 405,
      headers: { "content-type": "application/json; charset=utf-8", ...cors },
    });
  }

  // Parse body — tolerante a erros de serialização do cliente.
  let body: { events?: unknown[] } = {};
  try {
    body = (await req.json()) as { events?: unknown[] };
  } catch {
    return new Response(JSON.stringify({ error: "Body JSON inválido." }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8", ...cors },
    });
  }

  if (!Array.isArray(body.events)) {
    return new Response(JSON.stringify({ error: "Campo 'events' deve ser um array." }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8", ...cors },
    });
  }

  // Rate-limit: máximo 50 eventos por chamada.
  if (body.events.length > 50) {
    return new Response(JSON.stringify({ error: "Máximo de 50 eventos por chamada." }), {
      status: 429,
      headers: { "content-type": "application/json; charset=utf-8", ...cors },
    });
  }

  const serverTs = new Date().toISOString();
  const rows: ClientEventRow[] = [];

  for (const raw of body.events) {
    const row = validateAndNormalizeEvent(raw as RawEvent, serverTs);
    if (row) rows.push(row);
    // Eventos inválidos são silenciosamente descartados.
  }

  if (rows.length === 0) {
    // Nenhum evento válido — responde OK sem fazer nada (evita loops de erro).
    return new Response(JSON.stringify({ ok: true, inserted: 0 }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", ...cors },
    });
  }

  // Insere via PostgREST usando a chave ANON — RLS da tabela permite INSERT.
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    console.error("[log-event] Variáveis de ambiente faltando.");
    return new Response(JSON.stringify({ error: "Função mal configurada." }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8", ...cors },
    });
  }

  const insertUrl = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/client_events`;
  const insertRes = await fetch(insertUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "apikey": anonKey,
      "authorization": `Bearer ${anonKey}`,
      // Prefere que o PostgREST não retorne as linhas inseridas (economiza bandwidth)
      "prefer": "return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (!insertRes.ok) {
    const detail = await insertRes.text().catch(() => "");
    console.error(`[log-event] Falha ao inserir: ${insertRes.status} ${detail}`);
    // Responde 200 ao cliente mesmo em falha de banco — telemetria não deve
    // causar regressão no produto nem loops de erro de front.
    return new Response(JSON.stringify({ ok: false, error: "Falha ao persistir eventos." }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", ...cors },
    });
  }

  return new Response(JSON.stringify({ ok: true, inserted: rows.length }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", ...cors },
  });
});
