export interface BarProps {
  label: string;
  /** Percentage 0–100 */
  value: number;
  color?: string | undefined;
  /**
   * Labels for the three threshold bands shown next to the percentage.
   * Provide Portuguese or English strings as needed (e.g. ["Alto","Médio","Baixo"]).
   * Defaults to ["Alto","Médio","Baixo"].
   * a11y: exposes a textual level so daltonic / low-vision users don't rely on
   * color alone to understand the value's severity.
   */
  levelLabels?: readonly [high: string, mid: string, low: string] | undefined;
}

/** Derive a textual level from the 0–100 value using simple thirds. */
function deriveLevel(
  value: number,
  labels: readonly [string, string, string],
): string {
  if (value >= 67) return labels[0];
  if (value >= 34) return labels[1];
  return labels[2];
}

const DEFAULT_LABELS = ["Alto", "Médio", "Baixo"] as const;

/**
 * Labeled horizontal progress bar. `value` is 0–100.
 * Uses `.bar` / `.track` CSS classes from the design system.
 *
 * a11y: carries role="progressbar" + aria-valuenow/min/max/label so AT
 * announces the value and label correctly. Shows a textual level badge
 * ("Alto"/"Médio"/"Baixo" by default) so severity is never color-only.
 * The track fill uses a <span> (not <i>) to avoid semantic confusion.
 */
export function Bar({ label, value, color, levelLabels }: BarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const fillColor = color ?? "var(--brand)";
  const labels = levelLabels ?? DEFAULT_LABELS;
  const levelText = deriveLevel(clampedValue, labels);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div className="row between">
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span className="row" style={{ gap: 6, alignItems: "center" }}>
          {/* a11y: textual level so color is not the only signal */}
          <span
            aria-hidden="true"
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: fillColor,
              opacity: 0.8,
            }}
          >
            {levelText}
          </span>
          <span
            className="num"
            aria-label={`${clampedValue}% — ${levelText}`}
            style={{ fontSize: 13, fontWeight: 700, color: fillColor }}
          >
            {clampedValue}%
          </span>
        </span>
      </div>
      <div
        className="track"
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${clampedValue}% — ${levelText}`}
      >
        <span
          style={{
            display: "block",
            height: "100%",
            width: `${clampedValue}%`,
            borderRadius: "999px",
            background: fillColor,
            transition: "width 1s cubic-bezier(.2,.7,.3,1)",
          }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
