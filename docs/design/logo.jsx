// logo.jsx — Fonte.ia mark system: symbol variants + lockups
// Palette: deep navy ink, brand blue, teal "intelligence" accent.
// Symbol concept: monogram "F" built from data lines + a verified pinpoint.

const BRAND = {
  ink:    '#0B2240', // deep institutional navy
  blue:   '#1D5FE0', // brand blue
  accent: '#14BBA4', // teal — intelligence / verified
  accentBright: '#2DD4BF',
  paper:  '#FFFFFF',
  mist:   '#F3F6FB',
  hair:   '#E4EAF2',
  slate:  '#5A6B82',
  fog:    '#9AA8BC',
};

// ---- The symbol -------------------------------------------------------------
// viewBox 0 0 64 64. F backbone: stem + two arms (data rows). A teal pinpoint
// marks the verified source point.
function FSymbol({ v = 'node', s = 64, ink = BRAND.ink, accent = BRAND.accent, style }) {
  const stem  = <rect x="16"   y="15"   width="7.6"  height="34"  rx="3.8" fill={ink} />;
  const top   = <rect x="16"   y="15"   width="25"   height="7.6" rx="3.8" fill={ink} />;
  const mid   = <rect x="16"   y="28.6" width="17.5" height="7.6" rx="3.8" fill={ink} />;

  let extra = null;
  if (v === 'node') {
    extra = <circle cx="47" cy="18.8" r="5" fill={accent} />;
  } else if (v === 'beacon') {
    extra = (
      <g>
        <circle cx="47" cy="18.8" r="4.3" fill={accent} />
        <g stroke={accent} strokeWidth="2.1" strokeLinecap="round" opacity="0.55">
          <line x1="47" y1="9.4"  x2="47" y2="6.4" />
          <line x1="54.2" y1="11.6" x2="56.3" y2="9.5" />
          <line x1="39.8" y1="11.6" x2="37.7" y2="9.5" />
        </g>
      </g>
    );
  } else if (v === 'linked') {
    extra = (
      <g>
        <line x1="38" y1="32.4" x2="44.3" y2="21.6" stroke={accent} strokeWidth="2.2" strokeLinecap="round" opacity="0.5" />
        <circle cx="37.5" cy="32.4" r="2.7" fill={accent} opacity="0.5" />
        <circle cx="47" cy="18.8" r="5" fill={accent} />
      </g>
    );
  } else if (v === 'strata') {
    // arms rendered as stacked data rows
    return (
      <svg width={s} height={s} viewBox="0 0 64 64" style={style} aria-label="Fonte.ia symbol">
        {stem}
        <rect x="25.4" y="15"   width="21.6" height="3.2" rx="1.6" fill={ink} />
        <rect x="25.4" y="19.4" width="14.5" height="3.2" rx="1.6" fill={ink} />
        <rect x="25.4" y="28.6" width="16"   height="3.2" rx="1.6" fill={ink} />
        <rect x="25.4" y="33"   width="10"   height="3.2" rx="1.6" fill={ink} />
        <circle cx="51.4" cy="16.6" r="3.4" fill={accent} />
      </svg>
    );
  }

  return (
    <svg width={s} height={s} viewBox="0 0 64 64" style={style} aria-label="Fonte.ia symbol">
      {stem}{top}{mid}{extra}
    </svg>
  );
}

// App-icon tile: navy rounded square, white F, teal pin.
function FTile({ s = 96, bg = BRAND.ink, radius = 0.225, v = 'node', mono = false }) {
  const id = React.useId();
  const onLight = bg === '#FFFFFF' || bg === '#fff' || bg === '#FFF' || bg === 'white';
  const fInk = onLight ? BRAND.ink : '#FFFFFF';
  const fAccent = mono ? fInk : (onLight ? BRAND.accent : BRAND.accentBright);
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" aria-label="Fonte.ia app icon">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0E2A4F" />
          <stop offset="1" stopColor="#0A1E3A" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="64" height="64" rx={64 * radius}
        fill={bg === 'grad' ? `url(#g${id})` : bg}
        stroke={onLight ? BRAND.hair : 'none'} strokeWidth={onLight ? 1 : 0} />
      <g transform="translate(8.5 8.5) scale(0.735)">
        <FSymbol v={v} s={64} ink={fInk} accent={fAccent} />
      </g>
    </svg>
  );
}

// ---- Wordmark + lockups -----------------------------------------------------
function Wordmark({ size = 44, ink = BRAND.ink, accent = BRAND.accent, sub = BRAND.slate, align = 'left' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align === 'center' ? 'center' : 'flex-start', lineHeight: 1 }}>
      <div style={{
        fontFamily: "'Figtree', sans-serif", fontWeight: 600, fontSize: size,
        letterSpacing: '-0.02em', color: ink, lineHeight: 1,
      }}>
        Fonte<span style={{ color: accent }}>.ia</span>
      </div>
      <div style={{
        fontFamily: "'Figtree', sans-serif", fontWeight: 500, fontSize: size * 0.235,
        letterSpacing: '0.26em', textTransform: 'uppercase', color: sub,
        marginTop: size * 0.2, paddingLeft: align === 'center' ? 0 : '0.12em',
      }}>
        by&nbsp;Olli
      </div>
    </div>
  );
}

function LockupH({ symS = 58, wordS = 44, ink = BRAND.ink, accent = BRAND.accent, sub = BRAND.slate, v = 'node' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: symS * 0.34 }}>
      <FSymbol v={v} s={symS} ink={ink} accent={accent} />
      <Wordmark size={wordS} ink={ink} accent={accent} sub={sub} />
    </div>
  );
}

function LockupV({ symS = 76, wordS = 40, ink = BRAND.ink, accent = BRAND.accent, sub = BRAND.slate, v = 'node' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: symS * 0.28 }}>
      <FSymbol v={v} s={symS} ink={ink} accent={accent} />
      <Wordmark size={wordS} ink={ink} accent={accent} sub={sub} align="center" />
    </div>
  );
}

Object.assign(window, { BRAND, FSymbol, FTile, Wordmark, LockupH, LockupV });
