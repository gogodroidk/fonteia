import { supabase } from "../../auth/supabase-client";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EntityAlert {
  id: string;
  kind: string;
  entityRef: string;
  entityLabel: string | null;
  query: string | null;
  email: string;
  status: string;
  createdAt: string;
}

/** Input for creating a new entity alert. */
export interface CreateEntityAlertInput {
  kind: string;
  ref: string;
  label?: string | undefined;
  query?: string | undefined;
  email: string;
}

/** RPC response shape from create_entity_alert. */
interface CreateRpcResult {
  ok: boolean;
  id?: string | undefined;
  message: string;
  error?: string | undefined;
}

/** RPC response shape from delete_entity_alert. */
interface DeleteRpcResult {
  ok: boolean;
  deleted: number;
}

/** Raw row returned by list_my_entity_alerts RPC. */
interface EntityAlertRow {
  id: string;
  kind: string;
  entity_ref: string;
  entity_label: string | null;
  query: string | null;
  email: string;
  channel: string;
  status: string;
  last_checked_at: string | null;
  notified_at: string | null;
  created_at: string;
}

// ─── Kind labels (pt-BR) ──────────────────────────────────────────────────────

export const ALERT_KIND_LABELS: Record<string, string> = {
  empresa: "Empresa",
  parlamentar: "Parlamentar",
  municipio: "Município",
  ambiental: "Ambiental",
  marca: "Marca",
  processo: "Processo",
  lote: "Leilão",
  busca: "Busca",
};

// ─── API functions ────────────────────────────────────────────────────────────

/**
 * Creates a new entity alert via the create_entity_alert RPC.
 * Returns { ok, message } — never throws to the caller; errors are surfaced in the message.
 */
export async function createEntityAlert(
  input: CreateEntityAlertInput,
): Promise<{ ok: boolean; message: string }> {
  if (!supabase) {
    return { ok: false, message: "Supabase não está configurado. Faça login para criar alertas." };
  }

  try {
    const rpcArgs: {
      p_kind: string;
      p_ref: string;
      p_email: string;
      p_label?: string;
      p_query?: string;
    } = {
      p_kind: input.kind,
      p_ref: input.ref,
      p_email: input.email,
      ...(input.label !== undefined ? { p_label: input.label } : {}),
      ...(input.query !== undefined ? { p_query: input.query } : {}),
    };

    const { data, error } = await supabase.rpc("create_entity_alert", rpcArgs);

    if (error) {
      return { ok: false, message: error.message };
    }

    // data comes back as jsonb — cast carefully
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      return { ok: false, message: "Resposta inesperada do servidor." };
    }

    const result = data as CreateRpcResult;
    return { ok: result.ok ?? false, message: result.message ?? "Sem mensagem do servidor." };
  } catch (err: unknown) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Erro desconhecido ao criar alerta.",
    };
  }
}

/**
 * Lists all entity alerts for the current authenticated user.
 * Returns [] on error, missing session, or unconfigured Supabase.
 */
export async function listEntityAlerts(): Promise<EntityAlert[]> {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase.rpc("list_my_entity_alerts");

    if (error || data === null) return [];

    const rows = data as EntityAlertRow[];

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      entityRef: row.entity_ref,
      entityLabel: row.entity_label,
      query: row.query,
      email: row.email,
      status: row.status,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}

/**
 * Deletes an entity alert by its UUID.
 * Returns true if deleted successfully.
 */
export async function deleteEntityAlert(id: string): Promise<boolean> {
  if (!supabase) return false;

  try {
    const { data, error } = await supabase.rpc("delete_entity_alert", { p_id: id });

    if (error || data === null) return false;

    const result = data as DeleteRpcResult;
    return result.ok && result.deleted > 0;
  } catch {
    return false;
  }
}
