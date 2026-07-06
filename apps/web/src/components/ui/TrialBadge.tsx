/**
 * TrialBadge.tsx — Aviso de estado do teste de 7 dias (trial) do plano.
 *
 * Dois estados, ambos honestos:
 *  1. Teste vigente (trial===true e `until` no futuro): "Teste: faltam N dias"
 *     — vira "último dia" quando N<=1. N nunca é negativo.
 *  2. Teste expirado (status==="expired"): paywall honesto com CTA para os planos.
 *
 * Fora desses estados o componente não renderiza nada (retorna null) — quem é pago
 * de verdade ou nunca teve trial não vê aviso.
 *
 * Design system: CSS custom properties (var(--token)); mobile-first; dark/light.
 * Acessibilidade: role="status" (informativo), CTA é <button> com alvo ≥44px.
 */

import type { CSSProperties } from "react";
import { Clock, Zap } from "lucide-react";

const DAY_MS = 86_400_000;

/**
 * Dias restantes até `until`, arredondando para cima, com piso em 0.
 * Exportado para reuso nas páginas (billing/account) sem duplicar a conta.
 */
export function trialDaysLeft(until: string | undefined, now: number = Date.now()): number {
  if (until === undefined) return 0;
  const end = new Date(until).getTime();
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.ceil((end - now) / DAY_MS));
}

/**
 * Rótulo pt-BR dos dias restantes de teste.
 * N<=1 → "último dia"; caso contrário "faltam N dias".
 */
export function trialDaysLabel(daysLeft: number): string {
  if (daysLeft <= 1) return "Teste: último dia";
  return `Teste: faltam ${daysLeft} dias`;
}

export interface TrialBadgeProps {
  /** true quando o acesso premium vem de um teste (cupom ou assinatura em trialing). */
  trial: boolean;
  /** Estado bruto da RPC my_plan — usamos "expired" para o paywall honesto. */
  status: string;
  /** Fim do teste (ISO). Necessário para a contagem regressiva. */
  until?: string | undefined;
  /** Chamado no clique do CTA de assinar (expirado). O host navega aos planos. */
  onUpgrade?: (() => void) | undefined;
  /** Tamanho visual. @default "sm" */
  size?: "sm" | "md" | undefined;
}

export function TrialBadge({ trial, status, until, onUpgrade, size = "sm" }: TrialBadgeProps) {
  const isMd = size === "md";

  // ── Teste expirado: paywall honesto ──
  if (status === "expired") {
    const wrapStyle: CSSProperties = {
      display: "flex",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
      padding: isMd ? "12px 14px" : "10px 12px",
      borderRadius: "var(--r-sm)",
      background: "color-mix(in srgb,var(--accent) 8%,var(--surface))",
      border: "1px solid color-mix(in srgb,var(--accent) 30%,var(--border))",
      color: "var(--t-hi)",
      lineHeight: 1.45,
    };
    return (
      <div role="status" style={wrapStyle}>
        <Clock
          size={isMd ? 17 : 15}
          aria-hidden="true"
          style={{ color: "var(--accent-ink)", flexShrink: 0 }}
        />
        <span style={{ flex: 1, minWidth: 0, fontSize: isMd ? 13.5 : 12.5, fontWeight: 600 }}>
          Seu teste de 7 dias acabou — assine para continuar
        </span>
        {onUpgrade && (
          <button
            type="button"
            className="btn btn--accent btn--sm"
            onClick={onUpgrade}
            style={{ flexShrink: 0, minHeight: 44 }}
          >
            <Zap size={14} aria-hidden="true" />
            Ver planos
          </button>
        )}
      </div>
    );
  }

  // ── Teste vigente: contagem regressiva ──
  if (trial && until !== undefined) {
    const daysLeft = trialDaysLeft(until);
    const last = daysLeft <= 1;
    const badgeStyle: CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: isMd ? 6 : 5,
      padding: isMd ? "4px 10px" : "3px 8px",
      borderRadius: "var(--r-sm)",
      // Último dia ganha destaque de urgência (accent); demais ficam neutros.
      background: last
        ? "color-mix(in srgb,var(--accent) 10%,var(--surface))"
        : "color-mix(in srgb,var(--t-mid) 6%,var(--surface))",
      border: last
        ? "1px solid color-mix(in srgb,var(--accent) 30%,var(--border))"
        : "1px solid var(--border)",
      color: last ? "var(--accent-ink)" : "var(--t-mid)",
      fontSize: isMd ? 12.5 : 11.5,
      fontWeight: 600,
      lineHeight: 1.4,
      whiteSpace: "nowrap",
      verticalAlign: "middle",
    };
    return (
      <span role="status" style={badgeStyle}>
        <Clock
          size={isMd ? 13 : 12}
          aria-hidden="true"
          style={{ color: last ? "var(--accent-ink)" : "var(--t-mid)", flexShrink: 0 }}
        />
        {trialDaysLabel(daysLeft)}
      </span>
    );
  }

  return null;
}
