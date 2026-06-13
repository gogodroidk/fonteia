import { Ring } from "./Ring";

export interface ScoreRingProps {
  /** Score value 0–100 */
  value: number;
  size?: number | undefined;
  /** Override the center label (defaults to "score" when size > 80) */
  label?: string | undefined;
}

function scoreColor(v: number): string {
  if (v >= 80) return "var(--ok)";
  if (v >= 65) return "var(--warn)";
  return "var(--danger)";
}

/**
 * Score ring: 0–100, color by range (>=80 green, >=65 amber, else red),
 * large number in the center, optional "score" label below.
 */
export function ScoreRing({ value, size = 64, label }: ScoreRingProps) {
  const color = scoreColor(value);
  const strokeWidth = size > 80 ? 9 : 7;
  const fontSize = size > 80 ? 28 : 19;
  const showLabel = size > 80;
  const resolvedLabel = label ?? "score";

  return (
    <Ring
      value={value / 100}
      size={size}
      stroke={strokeWidth}
      color={color}
      track="var(--surface-2)"
    >
      <div style={{ textAlign: "center", lineHeight: 1 }}>
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
  );
}
