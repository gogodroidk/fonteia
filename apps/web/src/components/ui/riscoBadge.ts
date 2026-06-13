export type RiscoLevel = "baixo" | "medio" | "alto";

export interface RiscoBadgeResult {
  className: string;
  label: string;
}

/**
 * Maps a risk level to the corresponding design system badge class and label.
 *
 * @example
 * const { className, label } = riscoBadge("baixo");
 * // className: "badge--ok", label: "Risco baixo"
 */
export function riscoBadge(risco: RiscoLevel): RiscoBadgeResult {
  if (risco === "baixo") return { className: "badge--ok", label: "Risco baixo" };
  if (risco === "medio") return { className: "badge--warn", label: "Risco médio" };
  return { className: "badge--danger", label: "Risco alto" };
}
