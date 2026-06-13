export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="16" y="15" width="7.6" height="34" rx="3.8" fill="currentColor" />
      <rect x="16" y="15" width="25" height="7.6" rx="3.8" fill="currentColor" />
      <rect x="16" y="28.6" width="17.5" height="7.6" rx="3.8" fill="currentColor" />
      <circle cx="47" cy="18.8" r="5" style={{ fill: "var(--accent-ink)" }} />
    </svg>
  );
}
