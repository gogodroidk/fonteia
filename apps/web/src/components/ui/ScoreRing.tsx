import { Ring } from "./Ring";

export interface ScoreRingProps {
  /** Score value 0–100 */
  value: number;
  size?: number | undefined;
  /** Override the center label (defaults to "score" when size > 80) */
  label?: string | undefined;
}

function scoreColor(v: number): string {
  if (v >= 75) return "var(--ok)";
  if (v >= 50) return "var(--warn)";
  return "var(--danger)";
}

/**
 * Score ring: 0–100, color by range (>=75 green, >=50 amber, else red),
 * large number in the center, optional "score" label below.
 *
 * a11y: the wrapper carries role="img" + aria-label so screen readers
 * announce the numeric value and label instead of reading the decorative SVG
 * and numeric characters in isolation. The inner content is aria-hidden.
 */
export function ScoreRing({ value, size = 64, label }: ScoreRingProps) {
  const color = scoreColor(value);
  const strokeWidth = size > 80 ? 9 : 7;
  const fontSize = size > 80 ? 28 : 19;
  const showLabel = size > 80;
  const resolvedLabel = label ?? "score";

  return (
    <div role="img" aria-label={`${resolvedLabel}: ${value} de 100`}>
      <Ring
        value={value / 100}
        size={size}
        stroke={strokeWidth}
        color={color}
        track="var(--surface-2)"
      >
        <div style={{ textAlign: "center", lineHeight: 1 }} aria-hidden="true">
          <div
            className="num"
            style={{ fontWeight: 800, fontSize, color }}
          >
            {value}
          </div>
          {showLabel && (
            <div className="tiny muted" style={{ marginTop: 2 }}>
              {resolvedLabel}
            </div>
          )}
        </div>
      </Ring>
    </div>
  );
}
