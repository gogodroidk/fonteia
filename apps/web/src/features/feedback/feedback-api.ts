// features/feedback/feedback-api.ts
// Módulo de suporte e feedback — PostgREST via RPCs SECURITY DEFINER.
// Não expõe segredos: usa o supabase client público (anon/authenticated key).

import { supabase } from "../../auth/supabase-client";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type FeedbackTipo = "reclamação" | "sugestão" | "melhoria" | "bug";
export type FeedbackStatus = "novo" | "em_análise" | "resolvido";

export const FEEDBACK_TIPOS: { value: FeedbackTipo; label: string; emoji: string }[] = [
  { value: "sugestão",   label: "Sugestão",   emoji: "💡" },
  { value: "melhoria",   label: "Melhoria",   emoji: "✨" },
  { value: "reclamação", label: "Reclamação", emoji: "⚠️" },
  { value: "bug",        label: "Bug",        emoji: "🐛" },
];

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  "novo":       "Novo",
  "em_análise": "Em análise",
  "resolvido":  "Resolvido",
};

export interface FeedbackItem {
  id: string;
  tipo: FeedbackTipo;
  mensagem: string;
  contexto: string | null;
  status: FeedbackStatus;
  createdAt: string;
}

export interface AdminFeedbackItem extends FeedbackItem {
  userId: string | null;
  email: string | null;
}

// ─── RPC result shape ─────────────────────────────────────────────────────────

interface SubmitRpcResult {
  ok: boolean;
  id?: string;
  message: string;
  error?: string;
}

/** Raw row from list_my_feedback() */
interface MyFeedbackRow {
  id: string;
  tipo: string;
  mensagem: string;
  contexto: string | null;
  status: string;
  created_at: string;
}

/** Raw row from list_all_feedback() */
interface AllFeedbackRow extends MyFeedbackRow {
  user_id: string | null;
  email: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTipo(raw: string): FeedbackTipo {
  const valid: FeedbackTipo[] = ["reclamação", "sugestão", "melhoria", "bug"];
  return valid.includes(raw as FeedbackTipo) ? (raw as FeedbackTipo) : "sugestão";
}

function parseStatus(raw: string): FeedbackStatus {
  const valid: FeedbackStatus[] = ["novo", "em_análise", "resolvido"];
  return valid.includes(raw as FeedbackStatus) ? (raw as FeedbackStatus) : "novo";
}

function rowToItem(row: MyFeedbackRow): FeedbackItem {
  return {
    id:        row.id,
    tipo:      parseTipo(row.tipo),
    mensagem:  row.mensagem,
    contexto:  row.contexto,
    status:    parseStatus(row.status),
    createdAt: row.created_at,
  };
}

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * Submete um novo feedback.
 * Funciona autenticado ou anônimo (a RPC aceita ambos).
 * Captura o contexto (rota) automaticamente; o chamador pode passar a rota atual.
 */
export async function submitFeedback(input: {
  tipo: FeedbackTipo;
  mensagem: string;
  contexto?: string;
  email?: string;
}): Promise<{ ok: boolean; message: string }> {
  if (!supabase) {
    return {
      ok: false,
      message: "Serviço indisponível no momento. Tente novamente em instantes.",
    };
  }

  try {
    type RpcArgs = {
      p_tipo: string;
      p_mensagem: string;
      p_contexto?: string;
      p_email?: string;
    };

    const args: RpcArgs = {
      p_tipo:      input.tipo,
      p_mensagem:  input.mensagem,
      ...(input.contexto ? { p_contexto: input.contexto } : {}),
      ...(input.email    ? { p_email:    input.email }    : {}),
    };

    const { data, error } = await supabase.rpc("submit_feedback", args);

    if (error) {
      return { ok: false, message: error.message };
    }

    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, message: "Resposta inesperada do servidor." };
    }

    const result = data as SubmitRpcResult;
    return {
      ok:      result.ok ?? false,
      message: result.message ?? "Sem mensagem do servidor.",
    };
  } catch (err: unknown) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro ao enviar feedback.",
    };
  }
}

/**
 * Lista os feedbacks do usuário autenticado atual.
 * Retorna [] se não logado ou Supabase não configurado.
 */
export async function listMyFeedback(): Promise<FeedbackItem[]> {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase.rpc("list_my_feedback");
    if (error || !Array.isArray(data)) return [];
    return (data as MyFeedbackRow[]).map(rowToItem);
  } catch {
    return [];
  }
}

/**
 * Hook de leitura admin: lista todos os feedbacks.
 * A RPC verifica server-side se o usuário é admin; erro de permissão vira [].
 */
export async function listAllFeedback(opts?: {
  status?: FeedbackStatus;
  limit?: number;
}): Promise<AdminFeedbackItem[]> {
  if (!supabase) return [];

  try {
    type RpcArgs = {
      p_status?: string;
      p_limit?: number;
    };

    const args: RpcArgs = {
      ...(opts?.status ? { p_status: opts.status } : {}),
      ...(opts?.limit  ? { p_limit:  opts.limit  } : {}),
    };

    const { data, error } = await supabase.rpc("list_all_feedback", args);
    if (error || !Array.isArray(data)) return [];

    return (data as AllFeedbackRow[]).map((row) => ({
      ...rowToItem(row),
      userId: row.user_id,
      email:  row.email,
    }));
  } catch {
    return [];
  }
}
