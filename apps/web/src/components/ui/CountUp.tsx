import { useState, useEffect, useRef } from "react";

export interface CountUpProps {
  value: number;
  durationMs?: number | undefined;
  prefix?: string | undefined;
  suffix?: string | undefined;
  decimals?: number | undefined;
}

/**
 * Animated number that counts up to `value` using requestAnimationFrame.
 * Locale: pt-BR. Respects prefers-reduced-motion.
 */
export function CountUp({
  value,
  durationMs = 1100,
  prefix = "",
  suffix = "",
  decimals = 0,
}: CountUpProps) {
  const [current, setCurrent] = useState(0);
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reducedMotion) {
      setCurrent(value);
      return;
    }

    let rafId: number;
    let start: number | undefined;

    const tick = (timestamp: number) => {
      if (start === undefined) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(1, elapsed / durationMs);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCurrent(value * eased);
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [value, durationMs]);

  const formatted = current.toLocaleString("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span ref={spanRef} className="num" aria-live="polite" aria-atomic="true">
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
