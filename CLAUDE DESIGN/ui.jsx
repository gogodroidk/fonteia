// ui.jsx — shared UI primitives: icon set, charts, theme toggle, usage meter
const { useState, useEffect, useRef } = React;

/* ---------------- ICONS (lucide-ish, 24px stroke) ---------------- */
const PATHS = {
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  gavel: 'M14 13l-7.5 7.5a2.1 2.1 0 0 1-3-3L11 10M16 11l5-5M12.5 6.5l5 5M9 9l6-6M19 13l2 2',
  database: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  star: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.2l5.9-.9z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7a1.6 1.6 0 0 0 1-1.5V1a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  filter: 'M3 4h18l-7 8v6l-4 2v-8z',
  check: 'M20 6L9 17l-5-5',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  shieldcheck: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  trenddown: 'M3 7l6 6 4-4 8 8M15 17h6v-6',
  pin: 'M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  zap: 'M13 2L4 14h7l-1 8 9-12h-7z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  unlock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 7.5-2',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  arrowup: 'M12 19V5M6 11l6-6 6 6',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  external: 'M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
  building: 'M3 21h18M5 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M9 7h2M9 11h2M9 15h2',
  car: 'M5 13l1.5-4.5A2 2 0 0 1 8.4 7h7.2a2 2 0 0 1 1.9 1.5L19 13M5 13h14v5H5zM7 18v2M17 18v2M6.5 15.5h.01M17.5 15.5h.01',
  scale: 'M12 3v18M7 21h10M5 7h14M5 7l-2.5 6a3 3 0 0 0 5 0zM19 7l-2.5 6a3 3 0 0 0 5 0z',
  user: 'M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  chevdown: 'M6 9l6 6 6-6', chevright: 'M9 6l6 6-6 6', chevleft: 'M15 6l-6 6 6 6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  doc: 'M9 3h6l4 4v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM15 3v4h4',
  link: 'M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1',
  compare: 'M5 3v18M19 3v18M5 8h6M5 14h6M13 10h6M13 16h6',
  bolt2: 'M13 2L4 14h7l-1 8 9-12h-7z',
  flame: 'M12 2c1 4 4 5 4 9a4 4 0 0 1-8 0c0-1 .3-2 1-3 .2 2 1.5 2.5 2 2.5C10 9 11 6 12 2z',
  gift: 'M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7C12 7 12 3 9 3a2.5 2.5 0 0 0 0 5h3M12 7s0-4 3-4a2.5 2.5 0 0 1 0 5h-3',
  menu: 'M3 12h18M3 6h18M3 18h18', x: 'M18 6L6 18M6 6l12 12',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  layers: 'M12 2l9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7V6a2 2 0 0 1 2-2h11M17 13h.01',
};
function Icon({ name, size = 20, sw = 1.9, fill = 'none', style, className }) {
  const d = PATHS[name] || PATHS.info;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
      strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style} className={className} aria-hidden="true">
      {d.split('M').filter(Boolean).map((seg, i) => <path key={i} d={'M' + seg} />)}
    </svg>
  );
}

/* ---------------- THEME TOGGLE ---------------- */
function ThemeToggle({ theme, setTheme }) {
  const dark = theme === 'dark';
  return (
    <button className="btn btn--icon btn--ghost" onClick={() => setTheme(dark ? 'light' : 'dark')}
      title={dark ? 'Tema claro' : 'Tema escuro'} style={{ position: 'relative', overflow: 'hidden' }}>
      <Icon name={dark ? 'sun' : 'moon'} size={18} />
    </button>
  );
}

/* ---------------- SPARKLINE / AREA ---------------- */
function Spark({ data, w = 110, h = 34, color = 'var(--brand-ink)', fill = true }) {
  const max = Math.max(...data), min = Math.min(...data);
  const nx = (i) => (i / (data.length - 1)) * w;
  const ny = (v) => h - 3 - ((v - min) / (max - min || 1)) * (h - 6);
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${nx(i).toFixed(1)} ${ny(v).toFixed(1)}`).join(' ');
  const id = React.useId();
  return (
    <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={color} stopOpacity="0.28" /><stop offset="1" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      {fill && <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={`url(#${id})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={nx(data.length - 1)} cy={ny(data[data.length - 1])} r="3" fill={color} />
    </svg>
  );
}

/* area chart with grid + axis (bigger) */
function AreaChart({ data, w = 640, h = 200, color = 'var(--brand-ink)', labels }) {
  const max = Math.max(...data) * 1.1, min = 0;
  const nx = (i) => (i / (data.length - 1)) * w;
  const ny = (v) => h - ((v - min) / (max - min || 1)) * h;
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${nx(i).toFixed(1)} ${ny(v).toFixed(1)}`).join(' ');
  const id = React.useId();
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={color} stopOpacity="0.32" /><stop offset="1" stopColor={color} stopOpacity="0" />
      </linearGradient></defs>
      {[0.25, 0.5, 0.75, 1].map((g, i) => <line key={i} x1="0" x2={w} y1={h * g} y2={h * g} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 5" />)}
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {data.map((v, i) => <circle key={i} cx={nx(i)} cy={ny(v)} r={i === data.length - 1 ? 4 : 0} fill={color} />)}
    </svg>
  );
}

/* progress ring */
function Ring({ value, size = 64, sw = 7, color = 'var(--accent-ink)', track = 'var(--surface-2)', children }) {
  const r = (size - sw) / 2, c = 2 * Math.PI * r, off = c * (1 - value / 100);
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" style={{ transition: 'stroke-dashoffset .9s cubic-bezier(.2,.7,.3,1)' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
    </div>
  );
}

/* animated count-up number */
function CountUp({ value, dur = 1100, prefix = '', suffix = '', dec = 0 }) {
  const [n, setN] = useState(0);
  const ref = useRef();
  useEffect(() => {
    let raf, start;
    const tick = (t) => { if (!start) start = t; const p = Math.min(1, (t - start) / dur); const e = 1 - Math.pow(1 - p, 3); setN(value * e); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span ref={ref} className="num">{prefix}{n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })}{suffix}</span>;
}

function riscoBadge(r) {
  if (r === 'baixo') return ['badge--ok', 'Risco baixo'];
  if (r === 'medio') return ['badge--warn', 'Risco médio'];
  return ['badge--danger', 'Risco alto'];
}

Object.assign(window, { Icon, ThemeToggle, Spark, AreaChart, Ring, CountUp, riscoBadge });
