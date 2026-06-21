// features/feedback/use-admin-feedback.ts
// Hook para o painel admin ler todos os feedbacks.
// Retorna { items, loading, error, reload }.
// A leitura já exige admin server-side (RPC list_all_feedback); aqui só gerenciamos estado.

import { useCallback, useEffect, useState } from "react";
import { type AdminFeedbackItem, type FeedbackStatus, listAllFeedback } from "./feedback-api";

export interface UseAdminFeedbackOptions {
  status?: FeedbackStatus;
  limit?: number;
  /** Se false, não dispara a query automaticamente na montagem. Default: true */
  enabled?: boolean;
}

export interface UseAdminFeedbackResult {
  items: AdminFeedbackItem[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useAdminFeedback(opts?: UseAdminFeedbackOptions): UseAdminFeedbackResult {
  const { status, limit, enabled = true } = opts ?? {};
  const [items, setItems]     = useState<AdminFeedbackItem[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError]     = useState<string | null>(null);
  const [tick, setTick]       = useState(0);

  const reload = useCallback(() => {
    setTick((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    listAllFeedback({
      ...(status !== undefined ? { status } : {}),
      ...(limit  !== undefined ? { limit  } : {}),
    })
      .then((data) => {
        if (cancelled) return;
        setItems(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erro ao carregar feedbacks.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, status, limit, tick]);

  return { items, loading, error, reload };
}
