import type { SourceStatus } from "@fonteia/domain";

const labels: Record<SourceStatus, string> = {
  complementary_non_government: "complementar",
  connected: "conectada",
  deprecated: "descontinuada",
  fragile_operational: "operacional fragil",
  integrating: "integrando",
  open_no_api: "sem API estavel",
  paid_or_credentialed: "credencial",
  restricted_government: "restrita",
};

interface SourceStatusBadgeProps {
  status: SourceStatus;
}

export function SourceStatusBadge({ status }: SourceStatusBadgeProps) {
  return <span className={`source-badge source-${status}`}>{labels[status]}</span>;
}
