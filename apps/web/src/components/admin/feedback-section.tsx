// Aba "Suporte" do painel admin — onde os feedbacks dos usuários aparecem.
//
// Lê via useAdminFeedback → RPC list_all_feedback (gate de admin no BANCO). O
// componente só monta quando a aba está ativa, então a query só dispara aí.
// Honesto: estado vazio explícito ("nenhum feedback ainda"), erro com retry.

import { Inbox, MessageSquare, RefreshCw, ShieldAlert } from "lucide-react";
import { useAdminFeedback } from "../../features/feedback/use-admin-feedback";
import {
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TIPOS,
  type FeedbackStatus,
  type FeedbackTipo,
} from "../../features/feedback/feedback-api";

const TIPO_META: Record<FeedbackTipo, { label: string; emoji: string }> = Object.fromEntries(
  FEEDBACK_TIPOS.map((t) => [t.value, { label: t.label, emoji: t.emoji }]),
) as Record<FeedbackTipo, { label: string; emoji: string }>;

function statusTone(s: FeedbackStatus): { bg: string; fg: string } {
  if (s === "resolvido") return { bg: "color-mix(in srgb,var(--ok) 16%,transparent)", fg: "var(--ok)" };
  if (s === "em_análise") return { bg: "color-mix(in srgb,var(--warn) 18%,transparent)", fg: "var(--warn)" };
  return { bg: "color-mix(in srgb,var(--brand) 12%,transparent)", fg: "var(--brand-ink)" };
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FeedbackSection() {
  const { items, loading, error, reload } = useAdminFeedback({ limit: 200 });

  const novos = items.filter((i) => i.status === "novo").length;

  return (
    <section className="panel" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="row between" style={{ alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <MessageSquare size={18} aria-hidden="true" style={{ color: "var(--brand-ink)" }} />
          <div>
            <strong style={{ fontSize: 15 }}>Suporte & Feedback</strong>
            <div className="muted small">
              Reclamações, sugestões, melhorias e bugs enviados pelos usuários.
              {items.length > 0 ? ` ${items.length} no total · ${novos} novo(s).` : ""}
            </div>
          </div>
        </div>
        <button className="btn btn--ghost btn--sm" type="button" onClick={reload} disabled={loading}>
          <RefreshCw size={14} aria-hidden="true" style={loading ? { animation: "adminspin 1s linear infinite" } : undefined} />
          Atualizar
        </button>
      </div>

      {error ? (
        <div className="row" role="alert" style={{ gap: 10, alignItems: "center", padding: "12px 14px", borderRadius: 10, background: "color-mix(in srgb,var(--danger) 10%,transparent)" }}>
          <ShieldAlert size={16} style={{ color: "var(--danger)", flexShrink: 0 }} aria-hidden="true" />
          <span className="small" style={{ color: "var(--t-hi)" }}>{error}</span>
        </div>
      ) : loading ? (
        <div className="muted small" style={{ padding: "24px 0", textAlign: "center" }}>Carregando feedbacks…</div>
      ) : items.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "32px 0", color: "var(--t-mid)" }}>
          <Inbox size={28} strokeWidth={1.6} aria-hidden="true" style={{ opacity: 0.4 }} />
          <span className="muted small">Nenhum feedback ainda. Quando alguém usar o botão de feedback, aparece aqui.</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((f) => {
            const tone = statusTone(f.status);
            const tipo = TIPO_META[f.tipo];
            return (
              <article
                key={f.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "12px 14px",
                  background: "var(--surface-2)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div className="row between" style={{ alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <span className="row" style={{ gap: 6, alignItems: "center", fontWeight: 700, fontSize: 13.5 }}>
                    <span aria-hidden="true">{tipo?.emoji ?? "📝"}</span>
                    {tipo?.label ?? f.tipo}
                  </span>
                  <span
                    className="badge"
                    style={{ background: tone.bg, color: tone.fg, fontWeight: 700 }}
                  >
                    {FEEDBACK_STATUS_LABELS[f.status]}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: "var(--t-hi)", overflowWrap: "anywhere" }}>
                  {f.mensagem}
                </p>
                <div className="muted small" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                  <span>{fmtDate(f.createdAt)}</span>
                  {f.contexto ? <span style={{ fontFamily: "monospace" }}>{f.contexto}</span> : null}
                  {f.email ? <span>{f.email}</span> : <span style={{ opacity: 0.7 }}>anônimo</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
