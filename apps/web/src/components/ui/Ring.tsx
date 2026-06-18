import { useEffect, useState, type ReactNode } from "react";

export interface RingProps {
  /** Progress value between 0 and 1 */
  value: number;
  size?: number | undefined;
  stroke?: number | undefined;
  color?: string | undefined;
  track?: string | undefined;
  children?: ReactNode | undefined;
}

/**
 * Generic progress ring. `value` is 0–1.
 * Children are rendered centered inside the ring.
 */
export function Ring({
  value,
  size = 64,
  stroke = 7,
  color = "var(--accent-ink)",
  track = "var(--surface-2)",
  children,
}: RingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clampedValue = Math.min(1, Math.max(0, value));
  const off = c * (1 - clampedValue);

  // `window.matchMedia` must not be called during render (breaks SSR and React
  // hydration). Read the preference once in an effect and subscribe to changes
  // so the transition is disabled reactively if the user toggles the OS setting.
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const motionStyle: React.CSSProperties = reducedMotion
    ? {}
    : { transition: "stroke-dashoffset .9s cubic-bezier(.2,.7,.3,1)" };

  return (
    <div
      style={{ position: "relative", width: size, height: size, flexShrink: 0 }}
    >
      <svg
        width={size}
        height={size}
        style={{ transform: "rotate(-90deg)" }}
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={track}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
          style={motionStyle}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
