interface ScoreRingProps {
  score: number;
  size?: "sm" | "lg";
}

const palette = (score: number) => {
  if (score >= 75) return { stroke: "#22c87c", text: "#0b6048", glow: "rgba(34,200,124,0.3)" };
  if (score >= 50) return { stroke: "#f59e0b", text: "#92400e", glow: "rgba(245,158,11,0.3)" };
  return { stroke: "#ef4444", text: "#991b1b", glow: "rgba(239,68,68,0.3)" };
};

export function ScoreRing({ score, size = "sm" }: ScoreRingProps) {
  const dim = size === "lg" ? 80 : 52;
  const strokeW = size === "lg" ? 6 : 5;
  const r = (dim - strokeW * 2) / 2;
  const circ = 2 * Math.PI * r;
  const progress = circ - (score / 100) * circ;
  const { stroke, text, glow } = palette(score);
  const fontSize = size === "lg" ? 18 : 13;

  return (
    <svg
      width={dim}
      height={dim}
      viewBox={`0 0 ${dim} ${dim}`}
      aria-label={`Score ${score}`}
      style={{ flexShrink: 0, filter: `drop-shadow(0 0 6px ${glow})` }}
    >
      {/* Track */}
      <circle
        cx={dim / 2}
        cy={dim / 2}
        r={r}
        fill="none"
        stroke="#e8f5ef"
        strokeWidth={strokeW}
      />
      {/* Progress */}
      <circle
        cx={dim / 2}
        cy={dim / 2}
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeW}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={progress}
        transform={`rotate(-90 ${dim / 2} ${dim / 2})`}
        style={{ transition: "stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)" }}
      />
      {/* Score text */}
      <text
        x={dim / 2}
        y={dim / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={fontSize}
        fontWeight="900"
        fill={text}
        fontFamily="Inter, sans-serif"
      >
        {score}
      </text>
    </svg>
  );
}
