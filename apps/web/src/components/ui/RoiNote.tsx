/**
 * RoiNote.tsx — Moldura de retorno (ROI) para abas pagas.
 *
 * Torna explícito, em cada tela paga, POR QUE ela vale a assinatura — sem prometer
 * resultado. Compara com o custo/risco de fazer "no balcão" (cartório, despachante,
 * consulta avulsa) ou com o prejuízo evitado (um calote, um fornecedor inidôneo).
 *
 * Honestidade é regra do produto: o texto fala de ECONOMIA DE TEMPO e RISCO
 * EVITADO, nunca de ganho garantido. As comparações de preço são ordens de
 * grandeza de mercado (rótulo "aprox."), não cotações.
 *
 * Design system: tokens var(--*), mobile-first, dark/light, reduced-motion safe.
 * Acessibilidade: role="note" e ícone aria-hidden (o texto carrega o significado).
 */

import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";

export interface RoiNoteProps {
  /** Frase principal do retorno (ex.: "Uma certidão no balcão custa tempo e fila."). */
  children: React.ReactNode;
  /** Ícone à esquerda. @default Sparkles */
  icon?: LucideIcon | undefined;
  /** Tom da moldura. @default "accent" (verde de valor) */
  tone?: "accent" | "brand" | "neutral" | undefined;
  /** Compacta o espaçamento para usar dentro de cards. @default false */
  compact?: boolean | undefined;
}

function toneVars(tone: "accent" | "brand" | "neutral"): { fg: string; bg: string; border: string } {
  switch (tone) {
    case "brand":
      return {
        fg: "var(--brand-ink)",
        bg: "color-mix(in srgb,var(--brand) 8%,var(--surface))",
        border: "color-mix(in srgb,var(--brand) 22%,transparent)",
      };
    case "neutral":
      return {
        fg: "var(--t-mid)",
        bg: "var(--surface-2)",
        border: "var(--border)",
      };
    case "accent":
    default:
      return {
        fg: "var(--accent-ink)",
        bg: "color-mix(in srgb,var(--accent) 9%,var(--surface))",
        border: "color-mix(in srgb,var(--accent) 24%,transparent)",
      };
  }
}

export function RoiNote({ children, icon: Icon = Sparkles, tone = "accent", compact = false }: RoiNoteProps) {
  const { fg, bg, border } = toneVars(tone);
  return (
    <div
      role="note"
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: compact ? "9px 12px" : "12px 14px",
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: "var(--r-md)",
      }}
    >
      <Icon size={16} aria-hidden="true" style={{ color: fg, flexShrink: 0, marginTop: 1 }} />
      <p
        style={{
          margin: 0,
          fontSize: compact ? 12.5 : 13,
          lineHeight: 1.5,
          color: "var(--t-mid)",
        }}
      >
        {children}
      </p>
    </div>
  );
}
