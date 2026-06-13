export interface BarProps {
  label: string;
  /** Percentage 0–100 */
  value: number;
  color?: string | undefined;
}

/**
 * Labeled horizontal progress bar. `value` is 0–100.
 * Uses `.bar` / `.track` CSS classes from the design system.
 */
export function Bar({ label, value, color }: BarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const fillColor = color ?? "var(--brand)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div className="row between">
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span
          className="num"
          style={{ fontSize: 13, fontWeight: 700, color: fillColor }}
        >
          {clampedValue}%
        </span>
      </div>
      <div className="track">
        <i
          style={{
            width: `${clampedValue}%`,
            background: fillColor,
            transition: "width 1s cubic-bezier(.2,.7,.3,1)",
          }}
        />
      </div>
    </div>
  );
}
