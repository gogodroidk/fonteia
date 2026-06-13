import type { PublicSource } from "@fonteia/domain";
import { SourceStatusBadge } from "./source-status-badge";

interface SourceHealthCardProps {
  source?: PublicSource;
  dataSourceLabel: string;
  message: string;
  lastSyncedAt?: string;
  isDemo?: boolean;
}

function formatSyncedAt(value?: string): string {
  if (!value) return "Ainda nao informado";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SourceHealthCard({
  source,
  dataSourceLabel,
  message,
  lastSyncedAt,
  isDemo = false,
}: SourceHealthCardProps) {
  return (
    <aside className="source-health-card">
      <div className="source-health-card-header">
        <div>
          <span className="section-label">Fonte em uso</span>
          <strong>{source?.name ?? dataSourceLabel}</strong>
        </div>
        {source ? <SourceStatusBadge status={source.status} /> : null}
      </div>

      <dl className="source-health-facts">
        <div>
          <dt>Origem</dt>
          <dd>{dataSourceLabel}</dd>
        </div>
        <div>
          <dt>Ultima coleta</dt>
          <dd>{formatSyncedAt(lastSyncedAt)}</dd>
        </div>
        <div>
          <dt>Confianca</dt>
          <dd>{source?.reliability ?? (isDemo ? "demo" : "operacional")}</dd>
        </div>
      </dl>

      <p>{message}</p>
      {source?.status === "fragile_operational" ? (
        <small>Fonte oficial com endpoint operacional. Confirmar pontos criticos na fonte original.</small>
      ) : null}
    </aside>
  );
}
