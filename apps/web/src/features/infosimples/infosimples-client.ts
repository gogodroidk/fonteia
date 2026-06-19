// Cliente TypeScript para o proxy Supabase Edge Function "infosimples-proxy".
//
// A Edge Function infosimples-proxy agrega certidões/consultas de órgãos públicos
// brasileiros via InfoSimples (serviço PAGO por consulta). Ela fica DORMENTE até
// o dono configurar o segredo INFOSIMPLES_TOKEN no Vault — enquanto dormente
// responde { configured: false } e nada é cobrado.
//
// Auth: header `apikey` (publishable, pública) + Bearer de SESSÃO do usuário.
// A Edge valida plano pago no servidor; sem plano ela recusa com error:'plano_requerido'.
// Esta função NUNCA lança: toda falha retorna um estado discriminado.

import { supabase } from "../../auth/supabase-client";
import {
  getConfiguredApiUrl,
  getSupabasePublicConfig,
  trimTrailingSlash,
} from "../../lib/api-client";

// ─── Kinds suportados ─────────────────────────────────────────────────────────

/** Os 9 kinds suportados pelo infosimples-proxy. */
export const CERTIDAO_KINDS = [
  "receita-federal-cnpj",
  "receita-federal-simples",
  "receita-federal-pgfn",
  "tst-cndt",
  "caixa-fgts",
  "transparencia-ceis",
  "transparencia-cnep",
  "tcu-inidoneo",
  "mte-trabalho-escravo",
] as const;

export type CertidaoKind = (typeof CERTIDAO_KINDS)[number];

// ─── Tipos do payload ─────────────────────────────────────────────────────────

/** Item de detalhe em uma certidão (ex.: "CPF": "123.456.789-00"). */
export interface CertidaoItem {
  rotulo: string;
  valor: string;
}

/**
 * Payload base devolvido pelo proxy quando ok:true e configured:true.
 * Todos os kinds retornam estes campos.
 */
export interface CertidaoPayloadBase {
  status: "regular" | "irregular" | "atencao" | "indisponivel";
  titulo: string;
  resumo: string;
  itens: CertidaoItem[];
  validade?: string;
  numeroCertidao?: string;
  fonteUrl?: string;
}

/**
 * Payload estendido exclusivo do kind 'receita-federal-cnpj'.
 * Traz dados cadastrais além do payload base.
 */
export interface ReceitaFederalCnpjPayload extends CertidaoPayloadBase {
  razaoSocial?: string;
  nomeFantasia?: string;
  cnpj?: string;
  situacaoCadastral?: string;
  socios?: { nome: string; qualificacao: string }[];
}

/** Union discriminada do payload: varia conforme o kind consultado. */
export type CertidaoPayload =
  | ({ kind: "receita-federal-cnpj" } & ReceitaFederalCnpjPayload)
  | ({ kind: Exclude<CertidaoKind, "receita-federal-cnpj"> } & CertidaoPayloadBase);

// ─── Resultado discriminado ───────────────────────────────────────────────────

/**
 * Resultado discriminado de `consultarCertidao`. A função NUNCA lança;
 * toda condição de falha é representada como um estado nomeado.
 *
 * - `ok`      — consulta bem-sucedida; `data` contém o payload tipado.
 * - `dormant` — proxy não configurado (INFOSIMPLES_TOKEN ausente); custo zero.
 * - `login`   — sessão não autenticada; usuário precisa fazer login.
 * - `plan`    — plano insuficiente; usuário precisa fazer upgrade.
 * - `empty`   — resposta ok:false por outro motivo (ex.: CNPJ não encontrado).
 * - `error`   — falha de rede, parse ou resposta HTTP inesperada.
 */
export type CertidaoResult =
  | { state: "ok"; data: CertidaoPayload }
  | { state: "dormant" }
  | { state: "login" }
  | { state: "plan" }
  | { state: "empty"; message: string }
  | { state: "error"; message: string };

// ─── Envelope interno da Edge Function ───────────────────────────────────────

/** Envelope bruto devolvido pela Edge infosimples-proxy. */
interface ProxyEnvelope {
  ok?: boolean;
  configured?: boolean;
  source?: string;
  kind?: string;
  error?: string;
  // Campos do payload base
  status?: string;
  titulo?: string;
  resumo?: string;
  itens?: CertidaoItem[];
  validade?: string;
  numeroCertidao?: string;
  fonteUrl?: string;
  // Campos exclusivos de receita-federal-cnpj
  razaoSocial?: string;
  nomeFantasia?: string;
  cnpj?: string;
  situacaoCadastral?: string;
  socios?: { nome: string; qualificacao: string }[];
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

/** Monta a URL do proxy com os query params kind e cnpj. Retorna null se a base não estiver configurada. */
function buildProxyUrl(kind: string, cnpj: string): string | null {
  const fonteiaUrl = getConfiguredApiUrl();
  if (!fonteiaUrl) return null;
  const base = trimTrailingSlash(fonteiaUrl).replace(/\/[^/]+$/, "/infosimples-proxy");
  return `${base}?kind=${encodeURIComponent(kind)}&cnpj=${encodeURIComponent(cnpj)}`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Extrai o payload tipado do envelope bruto, aplicando o kind correto. */
function extractPayload(envelope: ProxyEnvelope, kind: string): CertidaoPayload {
  const VALID_STATUSES: ReadonlyArray<CertidaoPayloadBase["status"]> = [
    "regular", "irregular", "atencao", "indisponivel",
  ];
  const rawStatus = envelope.status;
  const status: CertidaoPayloadBase["status"] =
    rawStatus !== undefined && (VALID_STATUSES as ReadonlyArray<string>).includes(rawStatus)
      ? (rawStatus as CertidaoPayloadBase["status"])
      : "indisponivel";

  const base: CertidaoPayloadBase = {
    status,
    titulo: envelope.titulo ?? "",
    resumo: envelope.resumo ?? "",
    itens: Array.isArray(envelope.itens) ? envelope.itens : [],
    ...(envelope.validade !== undefined ? { validade: envelope.validade } : {}),
    ...(envelope.numeroCertidao !== undefined ? { numeroCertidao: envelope.numeroCertidao } : {}),
    ...(envelope.fonteUrl !== undefined ? { fonteUrl: envelope.fonteUrl } : {}),
  };

  if (kind === "receita-federal-cnpj") {
    const extended: ReceitaFederalCnpjPayload = {
      ...base,
      ...(envelope.razaoSocial !== undefined ? { razaoSocial: envelope.razaoSocial } : {}),
      ...(envelope.nomeFantasia !== undefined ? { nomeFantasia: envelope.nomeFantasia } : {}),
      ...(envelope.cnpj !== undefined ? { cnpj: envelope.cnpj } : {}),
      ...(envelope.situacaoCadastral !== undefined ? { situacaoCadastral: envelope.situacaoCadastral } : {}),
      ...(envelope.socios !== undefined ? { socios: envelope.socios } : {}),
    };
    return { kind: "receita-federal-cnpj", ...extended };
  }

  // Para todos os outros kinds o tipo de kind é Exclude<CertidaoKind, "receita-federal-cnpj">.
  // O cast é seguro porque chegamos aqui apenas com kinds válidos do enum.
  return {
    kind: kind as Exclude<CertidaoKind, "receita-federal-cnpj">,
    ...base,
  };
}

// ─── Função pública ───────────────────────────────────────────────────────────

/**
 * Consulta uma certidão/situação de CNPJ via a Edge Function infosimples-proxy.
 *
 * @param kind - Um dos 9 kinds suportados (ver `CERTIDAO_KINDS`).
 * @param cnpj - CNPJ do estabelecimento (apenas dígitos ou formatado — a Edge normaliza).
 * @returns `CertidaoResult` — union discriminada; NUNCA lança exceção.
 *
 * @example
 * const result = await consultarCertidao("receita-federal-pgfn", "12345678000195");
 * if (result.state === "ok") {
 *   console.log(result.data.status); // "regular" | "irregular" | ...
 * }
 */
export async function consultarCertidao(
  kind: string,
  cnpj: string,
): Promise<CertidaoResult> {
  const target = buildProxyUrl(kind, cnpj);
  if (!target) {
    return { state: "error", message: "URL da API não configurada." };
  }

  // Obtém o Bearer de SESSÃO quando disponível. A Edge exige usuário logado +
  // plano pago para debitar a consulta. Sem sessão, mandamos a publishable como
  // Bearer e a Edge responde error:'login_requerido'.
  const { key } = getSupabasePublicConfig();
  let bearer = key;
  try {
    const sessionToken = (await supabase?.auth.getSession())?.data.session?.access_token;
    if (sessionToken) bearer = sessionToken;
  } catch {
    // Sem sessão — segue com a publishable; a Edge recusará e retornamos 'login'.
  }

  let envelope: ProxyEnvelope;
  try {
    const response = await fetch(target, {
      headers: {
        accept: "application/json",
        apikey: key,
        authorization: `Bearer ${bearer}`,
      },
    });

    // Tenta parsear independentemente do status HTTP para capturar erros de negócio.
    try {
      envelope = (await response.json()) as ProxyEnvelope;
    } catch {
      return {
        state: "error",
        message: `Resposta inválida do servidor (HTTP ${response.status}).`,
      };
    }
  } catch (error) {
    return { state: "error", message: toErrorMessage(error) };
  }

  // Proxy dormente — INFOSIMPLES_TOKEN não configurado no Vault.
  if (envelope.configured === false) {
    return { state: "dormant" };
  }

  // Recusado por falta de autenticação ou plano insuficiente.
  if (envelope.ok === false) {
    if (envelope.error === "login_requerido") {
      return { state: "login" };
    }
    if (envelope.error === "plano_requerido") {
      return { state: "plan" };
    }
    return {
      state: "empty",
      message: envelope.error ?? "Consulta não retornou resultado.",
    };
  }

  // Resposta bem-sucedida: monta o payload tipado.
  if (envelope.ok === true && envelope.configured === true) {
    return { state: "ok", data: extractPayload(envelope, kind) };
  }

  // Estado inesperado — nenhum dos ramos acima casou.
  return {
    state: "error",
    message: "Resposta inesperada do proxy InfoSimples.",
  };
}
