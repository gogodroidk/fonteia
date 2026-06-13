// sales-1.jsx — Sales page: nav, hero (3D), trust strip, before/after, how it works
const { useState: vS, useEffect: vE, useRef: vR } = React;

function useReveal() {
  const ref = vR(null);
  const [seen, setSeen] = vS(false);
  vE(() => {
    if (!('IntersectionObserver' in window)) { setSeen(true); return; }
    const el = ref.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
    io.observe(el);
    const t = setTimeout(() => setSeen(true), 1400); // safety: never stay hidden
    return () => { io.disconnect(); clearTimeout(t); };
  }, []);
  return [ref, seen];
}
function Reveal({ children, d = 0, style, className = '' }) {
  const [ref, seen] = useReveal();
  return <div ref={ref} className={className} style={{ ...style, opacity: seen ? 1 : 0, transform: seen ? 'none' : 'translateY(30px)', transition: `opacity .7s cubic-bezier(.2,.7,.3,1) ${d}s, transform .7s cubic-bezier(.2,.7,.3,1) ${d}s` }}>{children}</div>;
}

function MiniRing({ score = 94, size = 56 }) {
  const r = (size - 7) / 2, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="7" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#2DD4BF" strokeWidth="7" strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} strokeLinecap="round" />
    </svg>
  );
}

function SalesNav({ theme, setTheme }) {
  const [scr, setScr] = vS(false);
  vE(() => { const h = () => setScr(window.scrollY > 30); window.addEventListener('scroll', h); return () => window.removeEventListener('scroll', h); }, []);
  return (
    <header style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50, transition: 'all .3s' }}>
      <div className={scr ? 'glass' : ''} style={{ borderBottom: scr ? '1px solid var(--glass-border)' : '1px solid transparent', transition: 'all .3s' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '14px 26px', display: 'flex', alignItems: 'center', gap: 20 }}>
          <LockupH symS={28} wordS={21} ink="var(--t-hi)" accent="var(--accent-ink)" sub="var(--t-low)" />
          <nav className="row" style={{ gap: 26, marginLeft: 28 }}>
            {['Como funciona', 'Resultados', 'Planos'].map(t => <a key={t} href={'#' + t.split(' ')[0].toLowerCase()} className="small nav-link" style={{ color: 'var(--t-mid)', textDecoration: 'none', fontWeight: 600 }}>{t}</a>)}
            <a href="Plataforma.html" className="small nav-link" style={{ color: 'var(--t-mid)', textDecoration: 'none', fontWeight: 600 }}>Plataforma</a>
            <a href="API.html" className="small nav-link" style={{ color: 'var(--t-mid)', textDecoration: 'none', fontWeight: 600 }}>API</a>
          </nav>
          <div className="row" style={{ gap: 10, marginLeft: 'auto' }}>
            <ThemeToggle theme={theme} setTheme={setTheme} />
            <a href="Fonte.ia App.html" className="btn btn--ghost btn--sm">Entrar</a>
            <a href="Fonte.ia App.html" className="btn btn--accent btn--sm"><Icon name="zap" size={15} fill="currentColor" />Começar grátis</a>
          </div>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const [p, setP] = vS({ x: 0, y: 0 });
  const move = (e) => setP({ x: (e.clientX / window.innerWidth - .5) * 14, y: (e.clientY / window.innerHeight - .5) * 10 });
  return (
    <section onMouseMove={move} style={{ position: 'relative', overflow: 'hidden', padding: '150px 26px 90px' }}>
      {/* background */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(1200px 600px at 70% 0%, color-mix(in srgb,var(--brand) 26%,transparent), transparent 60%), radial-gradient(900px 500px at 10% 30%, color-mix(in srgb,var(--accent) 16%,transparent), transparent 55%)', pointerEvents: 'none' }} />
      <div className="gridbg" style={{ position: 'absolute', inset: 0, opacity: .5, maskImage: 'radial-gradient(900px 500px at 50% 0%, #000, transparent 70%)', WebkitMaskImage: 'radial-gradient(900px 500px at 50% 0%, #000, transparent 70%)' }} />
      <div className="hero-grid" style={{ maxWidth: 1180, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.05fr .95fr', gap: 50, alignItems: 'center', position: 'relative' }}>
        {/* left copy */}
        <div>
          <Reveal>
            <div className="row" style={{ gap: 8, marginBottom: 22 }}>
              <span className="badge badge--accent" style={{ padding: '6px 12px', whiteSpace: 'nowrap' }}><span className="dot pulse" style={{ background: 'var(--accent-ink)' }} />Leilões públicos · Receita Federal · PGFN · SPU</span>
            </div>
          </Reveal>
          <Reveal d={.05}>
            <h1 className="display" style={{ fontSize: 'clamp(36px,4.8vw,58px)', lineHeight: 1.03 }}>
              Dado oficial do governo.<br /><span className="clip-text" style={{ backgroundImage: 'linear-gradient(100deg,var(--brand-2),var(--accent-2))' }}>Decisão com fundamento.</span>
            </h1>
          </Reveal>
          <Reveal d={.1}>
            <p style={{ fontSize: 'clamp(15px,1.5vw,18px)', color: 'var(--t-mid)', lineHeight: 1.65, marginTop: 22, maxWidth: 520 }}>
              A Fonte.ia monitora editais da Receita Federal, PGFN e demais órgãos públicos, cruza cada lote com as fontes oficiais e entrega <b className="t-hi">risco, rastreabilidade e economia potencial em segundos</b> — para quem toma decisões com responsabilidade.
            </p>
          </Reveal>
          <Reveal d={.15}>
            <div className="row wrap" style={{ gap: 12, marginTop: 32 }}>
              <a href="Fonte.ia App.html" className="btn btn--accent btn--lg"><Icon name="zap" size={18} fill="currentColor" />Iniciar avaliação gratuita</a>
              <a href="#como" className="btn btn--ghost btn--lg"><Icon name="eye" size={18} />Como funciona</a>
            </div>
          </Reveal>
          <Reveal d={.2}>
            <div className="row wrap" style={{ gap: 18, marginTop: 28 }}>
              <div style={{ display: 'flex' }}>{['MA', 'RT', 'CB', 'JV', 'LS'].map((a, i) => <div key={i} className="avatar" style={{ width: 32, height: 32, fontSize: 11, marginLeft: i ? -9 : 0, border: '2px solid var(--bg)' }}>{a}</div>)}</div>
              <div><div className="row" style={{ gap: 3 }}>{[1, 2, 3, 4, 5].map(i => <Icon key={i} name="star" size={14} fill="var(--gold)" style={{ color: 'var(--gold)' }} />)}</div><div className="tiny muted" style={{ marginTop: 3 }}><b className="t-hi">2.400+</b> profissionais e escritórios já utilizam</div></div>
            </div>
          </Reveal>
        </div>
        {/* right 3D mock — strong depth + continuous bob */}
        <Reveal d={.08}>
          <div className="scene" style={{ position: 'relative', paddingTop: 40, paddingBottom: 40 }}>
            {/* ambient orbs behind the mock */}
            <div className="orb mesh-anim" style={{ width: 300, height: 260, background: 'var(--accent)', top: 10, right: -30, opacity: .18, borderRadius: '50%', filter: 'blur(60px)', position: 'absolute', pointerEvents: 'none' }} />
            <div className="orb" style={{ width: 240, height: 200, background: 'var(--brand)', bottom: 0, left: 10, opacity: .15, borderRadius: '50%', filter: 'blur(55px)', position: 'absolute', pointerEvents: 'none' }} />
            {/* main tiltable + bobbing card */}
            <div className="bob3d" style={{ transform: `perspective(1400px) rotateY(${-8 + p.x * .35}deg) rotateX(${5 - p.y * .35}deg)`, transition: 'transform .18s ease-out' }}>
              <div className="panel elevated" style={{ overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,.45), 0 8px 24px rgba(0,0,0,.25)', borderRadius: 20 }}>
                <div className="row" style={{ gap: 7, padding: '13px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <span className="dot" style={{ width: 10, height: 10, background: '#ff5f57' }} /><span className="dot" style={{ width: 10, height: 10, background: '#febc2e' }} /><span className="dot" style={{ width: 10, height: 10, background: '#28c840' }} />
                  <span className="kbd" style={{ marginLeft: 12 }}>fonte.ia/lotes/RFB-0042-87</span>
                </div>
                <div style={{ padding: 22, background: 'var(--surface)' }}>
                  <div className="row between" style={{ marginBottom: 16 }}>
                    <div>
                      <div className="badge badge--accent" style={{ marginBottom: 8 }}><Icon name="sparkle" size={12} fill="currentColor" />Análise concluída · RFB</div>
                      <div className="h3" style={{ lineHeight: 1.25 }}>Lote 42 — Eletrônicos<br /><span className="small muted" style={{ fontWeight: 500 }}>Alfândega de Santos · SP</span></div>
                    </div>
                    <div style={{ position: 'relative' }}><MiniRing score={94} size={62} /><div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="num" style={{ fontWeight: 800, color: 'var(--accent-ink)', fontSize: 15 }}>94</span></div></div>
                  </div>
                  <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div className="inset" style={{ padding: 12 }}><div className="tiny muted">Lance mínimo</div><div className="num" style={{ fontWeight: 800, fontSize: 17 }}>R$ 414.000</div></div>
                    <div style={{ padding: 12, borderRadius: 12, background: 'color-mix(in srgb,var(--accent) 14%,transparent)', border: '1px solid color-mix(in srgb,var(--accent) 28%,transparent)' }}><div className="tiny t-accent" style={{ fontWeight: 700 }}>Economia potencial</div><div className="num t-accent" style={{ fontWeight: 800, fontSize: 17 }}>R$ 506.000</div></div>
                  </div>
                  {/* score bars */}
                  <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 7 }}>
                    {[['Documentação e laudo', 96, 'var(--ok)'], ['Tributos e custos', 90, 'var(--accent-ink)'], ['Liquidez de revenda', 90, 'var(--brand-ink)']].map(([lb, v, c]) => (
                      <div key={lb}>
                        <div className="row between" style={{ marginBottom: 3 }}><span className="tiny muted">{lb}</span><span className="num tiny" style={{ color: c, fontWeight: 700 }}>{v}</span></div>
                        <div className="track"><i style={{ width: v + '%', background: c, transition: 'width 1.2s cubic-bezier(.2,.7,.3,1)' }} /></div>
                      </div>
                    ))}
                  </div>
                  <div className="row between" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                    <div className="row" style={{ gap: 8 }}><FonteDots ids={['rfb', 'compras', 'pgfn']} size={20} /><span className="tiny muted">3 fontes oficiais</span></div>
                    <span className="badge badge--ok"><Icon name="shieldcheck" size={12} />Rastreável</span>
                  </div>
                </div>
              </div>
              {/* floating chips — stronger translateZ depth */}
              <div className="glass float" style={{ position: 'absolute', top: -18, left: -38, padding: '11px 16px', borderRadius: 14, boxShadow: '0 20px 48px rgba(0,0,0,.32)', zIndex: 2 }}>
                <div className="row" style={{ gap: 10 }}><div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,var(--brand),var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(29,95,224,.5)' }}><Icon name="zap" size={16} fill="#fff" style={{ color: '#fff' }} /></div><div><div className="tiny muted">Análise em</div><div className="num" style={{ fontWeight: 800, fontSize: 15.5 }}>32 segundos</div></div></div>
              </div>
              <div className="glass float-2" style={{ position: 'absolute', bottom: -18, right: -32, padding: '11px 16px', borderRadius: 14, boxShadow: '0 20px 48px rgba(0,0,0,.32)', zIndex: 2 }}>
                <div className="row" style={{ gap: 10 }}><Icon name="shieldcheck" size={20} style={{ color: 'var(--accent-ink)' }} /><div><div className="tiny muted">Fonte oficial</div><div className="num" style={{ fontWeight: 800, fontSize: 15.5, color: 'var(--accent-ink)' }}>RFB · PGFN</div></div></div>
              </div>
              <div className="glass float-3" style={{ position: 'absolute', top: '42%', right: -40, padding: '10px 14px', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,.28)', zIndex: 2 }}>
                <div className="row" style={{ gap: 8 }}><Icon name="trend" size={17} style={{ color: 'var(--brand-ink)' }} /><span className="num small" style={{ fontWeight: 800 }}>-55%</span></div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function TrustStrip() {
  return (
    <section style={{ padding: '10px 26px 40px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', textAlign: 'center' }}>
        <Reveal><div className="tiny muted" style={{ fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 20 }}>Conectado às fontes governamentais que sustentam a decisão</div></Reveal>
        <Reveal d={.05}>
          <div className="row wrap" style={{ gap: 14, justifyContent: 'center' }}>
            {FONTES.map(f => (
              <div key={f.id} className="card" style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="num" style={{ width: 30, height: 30, borderRadius: 8, background: f.cor, color: '#fff', fontWeight: 800, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{f.sigla}</div>
                <span className="small" style={{ fontWeight: 600, color: 'var(--t-mid)' }}>{f.nome.split('—')[0].trim()}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function BeforeAfter() {
  const antes = ['Editais publicados em PDFs dispersos por dezenas de portais', 'Risco oculto em cláusulas técnicas que exigem tempo e especialização', 'Cruzamento manual entre lote, laudo e tributação — horas de trabalho', 'Prazo de leilão eletrônico encerrado sem aviso prévio'];
  const depois = ['Todos os órgãos monitorados em uma única plataforma', 'Score de risco com cada ponto rastreado à fonte oficial', 'Tributos, laudos e situação do bem consolidados em segundos', 'Alerta de novo edital assim que o órgão publica'];
  return (
    <section style={{ padding: '80px 26px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 50 }}>
          <div className="eyebrow">Do caos à clareza</div>
          <h2 className="display" style={{ fontSize: 'clamp(28px,3.6vw,42px)', marginTop: 12 }}>Leilão judicial não precisa<br />dar medo.</h2>
        </Reveal>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 22 }}>
          <Reveal>
            <div className="panel" style={{ padding: 30, height: '100%', borderColor: 'color-mix(in srgb,var(--danger) 22%,var(--border))' }}>
              <div className="row" style={{ gap: 10, marginBottom: 20 }}><div style={{ width: 38, height: 38, borderRadius: 10, background: 'color-mix(in srgb,var(--danger) 14%,transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={20} style={{ color: 'var(--danger)' }} /></div><div className="h3" style={{ color: 'var(--t-mid)', fontWeight: 700 }}>Sem a Fonte.ia</div></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{antes.map(t => <div key={t} className="row" style={{ gap: 11, alignItems: 'flex-start' }}><Icon name="x" size={17} style={{ color: 'var(--danger)', flex: '0 0 auto', marginTop: 1, opacity: .8 }} /><span className="small" style={{ color: 'var(--t-mid)', lineHeight: 1.5 }}>{t}</span></div>)}</div>
            </div>
          </Reveal>
          <Reveal d={.08}>
            <div className="panel glow-accent" style={{ padding: 30, height: '100%', position: 'relative', overflow: 'hidden', borderColor: 'color-mix(in srgb,var(--accent) 30%,var(--border))' }}>
              <div className="orb" style={{ width: 180, height: 140, background: 'var(--accent)', top: -40, right: -20, opacity: .18 }} />
              <div className="row" style={{ gap: 10, marginBottom: 20 }}><div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg,var(--brand),var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FSymbol v="node" s={22} ink="#fff" accent="#fff" /></div><div className="h3">Com a Fonte.ia</div></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{depois.map(t => <div key={t} className="row" style={{ gap: 11, alignItems: 'flex-start' }}><Icon name="check" size={17} style={{ color: 'var(--accent-ink)', flex: '0 0 auto', marginTop: 1 }} sw={2.6} /><span className="small" style={{ lineHeight: 1.5, fontWeight: 500 }}>{t}</span></div>)}</div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { ic: 'database', t: 'Monitore os órgãos oficiais', d: 'Configure quais órgãos e regiões acompanhar. Novos editais chegam automaticamente — nenhum lote passa despercebido.' },
    { ic: 'sparkle', t: 'A IA analisa o lote', d: 'Score de risco, tributos, laudos e rastreabilidade da fonte em segundos. Cada informação com o documento oficial vinculado.' },
    { ic: 'shieldcheck', t: 'Decida com fundamento', d: 'Relatório com selo de fonte, lance sugerido e margem calculada. Sua decisão amparada em dado público verificável.' },
  ];
  return (
    <section id="como" style={{ padding: '80px 26px', background: 'var(--surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <Reveal style={{ textAlign: 'center', marginBottom: 54 }}>
          <div className="eyebrow">Simples assim</div>
          <h2 className="display" style={{ fontSize: 'clamp(28px,3.6vw,42px)', marginTop: 12 }}>Do clique ao arremate em 3 passos</h2>
          <p className="muted" style={{ fontSize: 16, marginTop: 14 }}>Para o investidor experiente que exige rigor. E para quem está começando e não quer depender de sorte.</p>
        </Reveal>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3,1fr)', gap: 22 }}>
          {steps.map((s, i) => (
            <Reveal key={i} d={i * .08}>
              <div className="card card--pad card--hover" style={{ padding: 28, height: '100%', position: 'relative' }}>
                <div className="num display" style={{ position: 'absolute', top: 20, right: 24, fontSize: 46, color: 'var(--border-2)', opacity: .7 }}>{i + 1}</div>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg,var(--brand),var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-md)', marginBottom: 20 }}><Icon name={s.ic} size={24} style={{ color: '#fff' }} fill={s.ic === 'sparkle' ? '#fff' : 'none'} /></div>
                <div className="h3" style={{ fontSize: 18 }}>{s.t}</div>
                <p className="muted small" style={{ marginTop: 10, lineHeight: 1.6 }}>{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { Reveal, SalesNav, Hero, TrustStrip, BeforeAfter, HowItWorks, MiniRing });
