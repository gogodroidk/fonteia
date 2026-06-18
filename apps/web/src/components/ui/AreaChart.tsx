import { useId } from "react";

export interface AreaChartProps {
  data: number[];
  width?: number | undefined;
  height?: number | undefined;
  color?: string | undefined;
  labels?: string[] | undefined;
}

/**
 * Area chart with dashed grid lines and optional axis labels.
 */
export function AreaChart({
  data,
  width = 640,
  height = 200,
  color = "var(--brand-ink)",
  labels,
}: AreaChartProps) {
  const id = useId();

  if (data.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        aria-hidden="true"
      />
    );
  }

  const max = Math.max(...data) * 1.1;
  const min = 0;
  const range = max - min || 1;

  const nx = (i: number): number => (i / (data.length - 1)) * width;
  const nxStr = (i: number): string => nx(i).toFixed(1);
  const ny = (v: number): number => height - ((v - min) / range) * height;
  const nyStr = (v: number): string => ny(v).toFixed(1);

  const line = data
    .map((v, i) => `${i === 0 ? "M" : "L"}${nx(i)} ${ny(v)}`)
    .join(" ");

  const lastIdx = data.length - 1;
  const lastVal = data[lastIdx] ?? 0;

  const gridLines: number[] = [0.25, 0.5, 0.75, 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      style={{ display: "block", overflow: "visible" }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.32} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {gridLines.map((g) => (
        <line
          key={g}
          x1={0}
          x2={width}
          y1={height * g}
          y2={height * g}
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray="3 5"
        />
      ))}

      <path d={`${line} L${width} ${height} L0 ${height} Z`} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {data.map((v, i) => (
        <circle
          key={`pt-${i}-${v}`}
          cx={nx(i)}
          cy={ny(v)}
          r={i === lastIdx ? 4 : 0}
          fill={color}
        />
      ))}

      {labels !== undefined &&
        labels.map((lbl, i) => {
          const dataIdx = Math.round((i / (labels.length - 1)) * (data.length - 1));
          const safeIdx = Math.min(dataIdx, data.length - 1);
          const val = data[safeIdx] ?? 0;
          return (
            <text
              key={`lbl-${i}-${lbl}`}
              x={nx(safeIdx)}
              y={ny(val) - 8}
              textAnchor="middle"
              fontSize={10}
              fill="var(--t-low)"
            >
              {lbl}
            </text>
          );
        })}
    </svg>
  );
}
