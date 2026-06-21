/**
 * telemetry.ts — Instrumentação leve de observabilidade do cliente
 *
 * LGPD: coleta ZERO dados pessoais identificáveis.
 *   - Sem nome, e-mail, IP, CPF, CNPJ de usuário.
 *   - Sem conteúdo de formulários, queries de busca com dados pessoais.
 *   - Apenas: rota, tipo de evento, user_agent anonimizado (browser/SO),
 *     mensagem de erro técnica e flag de autenticado (sim/não).
 *
 * Throttle: no máximo 1 flush a cada 2 s, batch de até 20 eventos,
 * descarta overflow silenciosamente (não afeta o produto).
 *
 * Sink: Edge Function "log-event" via fetch anônimo. Falhas silenciosas —
 * o produto nunca quebra por causa de telemetria.
 */

import { getSupabasePublicConfig } from "./api-client";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type EventKind =
  | "js_error"           // window.onerror / unhandledrejection
  | "boundary_error"     // React ErrorBoundary.componentDidCatch
  | "empty_result"       // busca retornou zero resultados
  | "module_error"       // módulo / rota não carregou
  | "page_not_loaded"    // Suspense timeout ou erro de chunk lazy
  | "navigation"         // troca de rota (opcional, granularidade baixa)
  | "feature_use";       // uso de feature específica (label customizável)

export interface TelemetryEvent {
  /** Discriminador do tipo de sinal. */
  kind: EventKind;
  /** Rota/caminho no momento do evento (window.location.pathname). Nunca inclui query-string com PII. */
  route: string;
  /** Mensagem técnica (stack resumido ou label). Deve ser sanitizada antes de chegar aqui. */
  message?: string;
  /** Label opcional para feature_use / empty_result (ex.: "busca-lotes", "pesquisa-inpi"). */
  label?: string;
  /** Navegador+SO resumido, sem fingerprinting. Exemplo: "Chrome 124 / macOS". */
  ua_hint: string;
  /** Se havia um usuário autenticado (true/false). Nunca inclui o id. */
  authed: boolean;
  /** Timestamp ISO no cliente. O servidor TAMBÉM grava server_ts. */
  client_ts: string;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** Retorna só "Browser Major / OS" — sem versão completa nem fingerprinting. */
function uaHint(): string {
  const ua = navigator.userAgent;
  // Browser
  const browserMatch =
    ua.match(/Firefox\/(\d+)/) ??
    ua.match(/Edg\/(\d+)/) ??
    ua.match(/OPR\/(\d+)/) ??
    ua.match(/Chrome\/(\d+)/) ??
    ua.match(/Safari\/(\d+)/);
  const browserName = ua.includes("Firefox") ? "Firefox"
    : ua.includes("Edg/") ? "Edge"
    : ua.includes("OPR/") ? "Opera"
    : ua.includes("Chrome") ? "Chrome"
    : ua.includes("Safari") ? "Safari"
    : "Browser";
  const browserVer = browserMatch?.[1] ?? "";
  // OS
  const os = ua.includes("Android") ? "Android"
    : ua.includes("iPhone") || ua.includes("iPad") ? "iOS"
    : ua.includes("Win") ? "Windows"
    : ua.includes("Mac") ? "macOS"
    : ua.includes("Linux") ? "Linux"
    : "Other";
  return `${browserName}${browserVer ? ` ${browserVer}` : ""} / ${os}`;
}

/** Sanitiza mensagem de erro: trunca para 500 chars e remove patterns de PII comum. */
function sanitizeMessage(raw: string): string {
  // Remove números de 11+ dígitos (CPF/CNPJ-like)
  let s = raw.replace(/\b\d{11,14}\b/g, "[redacted]");
  // Remove e-mails
  s = s.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]");
  return s.slice(0, 500);
}

/** Retorna somente o pathname, sem query-string (que pode ter PII). */
function safeRoute(): string {
  return typeof window !== "undefined" ? window.location.pathname : "/";
}

// ---------------------------------------------------------------------------
// Estado global do módulo (singleton)
// ---------------------------------------------------------------------------

const BATCH_MAX = 20;
const FLUSH_INTERVAL_MS = 2000;

const _queue: TelemetryEvent[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
let _authedFlag = false;

/** Injeta estado de autenticação — chamado pelo AuthProvider ao mudar de estado. */
export function setTelemetryAuthed(authed: boolean): void {
  _authedFlag = authed;
}

// ---------------------------------------------------------------------------
// Flush (envia batch para a Edge Function)
// ---------------------------------------------------------------------------

async function flush(): Promise<void> {
  if (_queue.length === 0) return;
  const batch = _queue.splice(0, BATCH_MAX);
  const { url } = getSupabasePublicConfig();
  if (!url) return;
  const endpoint = `${url.replace(/\/+$/, "")}/functions/v1/log-event`;
  try {
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: batch }),
      // keepalive: true mantém o request vivo mesmo se a aba fechar (navegação)
      keepalive: true,
    });
  } catch {
    // Telemetria silenciosa — nunca propaga erro ao produto.
  }
}

function scheduleFlush(): void {
  if (_flushTimer !== null) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    void flush();
  }, FLUSH_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Registra um evento de telemetria.
 * Seguro chamar de qualquer lugar — não lança, não bloqueia.
 */
export function trackEvent(
  kind: EventKind,
  extras: { message?: string; label?: string } = {},
): void {
  if (typeof window === "undefined") return;
  if (_queue.length >= BATCH_MAX * 2) return; // overflow: descarta silenciosamente

  const event: TelemetryEvent = {
    kind,
    route: safeRoute(),
    ua_hint: uaHint(),
    authed: _authedFlag,
    client_ts: new Date().toISOString(),
  };

  if (extras.message) event.message = sanitizeMessage(extras.message);
  if (extras.label) event.label = extras.label.slice(0, 100);

  _queue.push(event);
  scheduleFlush();
}

/**
 * Registra um erro de JS capturado em window.onerror ou unhandledrejection.
 * Stacktrace é truncado e sanitizado.
 */
export function trackJsError(message: string, source?: string, stack?: string): void {
  const parts = [message];
  if (source) parts.push(`@ ${source}`);
  if (stack) parts.push(stack.split("\n").slice(0, 4).join(" | "));
  trackEvent("js_error", { message: parts.join(" — ") });
}

/**
 * Registra erros capturados pelo React ErrorBoundary.
 */
export function trackBoundaryError(error: unknown, route: string): void {
  const msg = error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
  // Substitui a rota no evento (o boundary pode estar em rota específica)
  const event: TelemetryEvent = {
    kind: "boundary_error",
    route,
    message: sanitizeMessage(msg),
    ua_hint: uaHint(),
    authed: _authedFlag,
    client_ts: new Date().toISOString(),
  };
  if (_queue.length < BATCH_MAX * 2) {
    _queue.push(event);
    scheduleFlush();
  }
}

/**
 * Registra que uma busca em determinado módulo não retornou resultados.
 * `label` deve ser o identificador do módulo (ex.: "lotes", "inpi").
 * `query` NÃO deve ser registrada diretamente — pode conter PII.
 */
export function trackEmptyResult(label: string): void {
  trackEvent("empty_result", { label });
}

/**
 * Registra uso de uma feature específica.
 */
export function trackFeatureUse(label: string): void {
  trackEvent("feature_use", { label });
}

// ---------------------------------------------------------------------------
// Instalação dos handlers globais de erro do browser
// Chamado uma única vez em main.tsx
// ---------------------------------------------------------------------------

let _globalHandlersInstalled = false;

export function installGlobalErrorHandlers(): void {
  if (_globalHandlersInstalled || typeof window === "undefined") return;
  _globalHandlersInstalled = true;

  const originalOnerror = window.onerror;
  window.onerror = (message, source, _lineno, _colno, error) => {
    // Ignora erros de scripts de terceiros (sem source relevante)
    const src = typeof source === "string" ? source : "";
    const isThirdParty = src && !src.includes(window.location.hostname) && !src.includes("localhost");
    if (!isThirdParty) {
      const stack = error instanceof Error ? error.stack ?? "" : "";
      trackJsError(String(message), src, stack);
    }
    if (typeof originalOnerror === "function") {
      return (originalOnerror as typeof window.onerror)?.call(window, message, source, _lineno, _colno, error) ?? false;
    }
    return false;
  };

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error
      ? `${reason.name}: ${reason.message}`
      : String(reason ?? "UnhandledRejection");
    const stack = reason instanceof Error ? reason.stack ?? "" : "";
    trackJsError(message, "", stack);
  });
}
