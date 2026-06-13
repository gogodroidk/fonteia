import { useId } from "react";

export interface SparkProps {
  data: number[];
  width?: number | undefined;
  height?: number | undefined;
  color?: string | undefined;
}

/**
 * Sparkline: mini SVG area chart from an array of numbers.
 */
export function Spark({
  data,
  width = 110,
  height = 34,
  color = "var(--brand-ink)",
}: SparkProps) {
  const id = useId();

  if (data.length < 2) {
    return <svg width={width} height={height} aria-hidden="true" />;
  }

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const nx = (i: number) => ((i / (data.length - 1)) * width).toFixed(1);
  const ny = (v: number) =>
    (height - 3 - ((v - min) / range) * (height - 6)).toFixed(1);

  const line = data
    .map((v, i) => `${i === 0 ? "M" : "L"}${nx(i)} ${ny(v)}`)
    .join(" ");

  const lastIdx = data.length - 1;
  // Safe: we know data has at least 2 elements, so data[lastIdx] is defined.
  const lastVal = data[lastIdx] ?? 0;

  return (
    <svg
      width={width}
      height={height}
      style={{ display: "block", overflow: "visible" }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.28} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path
        d={`${line} L${width} ${height} L0 ${height} Z`}
        fill={`url(#${id})`}
      />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={nx(lastIdx)} cy={ny(lastVal)} r={3} fill={color} />
    </svg>
  );
}
