import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowRight, Check, X, Lock, ChevronDown, Zap, Shield, Database, ShieldCheck } from "lucide-react";
import { ScoreRing, FonteDots, ThemeToggle } from "../../components/ui";
import {
  PLANOS,
  FONTES,
  LEILAO_SEED,
  formatBRL,
} from "../../data/leiloes-seed";

// ─── Reveal on scroll ───────────────────────────────────────────────────────

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!("IntersectionObserver" in window)) { setSeen(true); return; }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e?.isIntersecting) { setSeen(true); io.disconnect(); } },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    const t = setTimeout(() => setSeen(true), 1600);
    return () => { io.disconnect(); clearTimeout(t); };
  }, []);
  return [ref, seen] as const;
}

function Reveal({
  children,
  delay = 0,
  className,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [ref, seen] = useReveal();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        opacity: seen ? 1 : 0,
        transform: seen ? "none" : "translateY(24px)",
        transition: `opacity .65s cubic-bezier(.2,.7,.3,1) ${delay}s, transform .65s cubic-bezier(.2,.7,.3,1) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

// ─── Scroll-tracking nav ────────────────────────────────────────────────────

function useScrolled(threshold = 32) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > threshold);
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, [threshold]);
  return scrolled;
}

// ─── Mouse-parallax for Hero card ───────────────────────────────────────────
// Pointer-only and disabled on touch / small / reduced-motion devices so the
// hero never repaints on scroll-heavy phones and the card can't drift offscreen.

function useMouse() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const onMove = useCallback((e: MouseEvent) => {
    setPos({
      x: (e.clientX / window.innerWidth - 0.5) * 12,
      y: (e.clientY / window.innerHeight - 0.5) * 8,
    });
  }, []);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    // Only fine pointers (real mouse) on wide screens, respecting reduced motion.
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const wide = window.matchMedia("(min-width: 920px)");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const enabled = () => finePointer.matches && wide.matches && !reduce.matches;
    let attached = false;
    const attach = () => {
      if (enabled() && !attached) {
        window.addEventListener("mousemove", onMove, { passive: true });
        attached = true;
      } else if (!enabled() && attached) {
        window.removeEventListener("mousemove", onMove);
        attached = false;
        setPos({ x: 0, y: 0 });
      }
    };
    attach();
    wide.addEventListener("change", attach);
    reduce.addEventListener("change", attach);
    return () => {
      wide.removeEventListener("change", attach);
      reduce.removeEventListener("change", attach);
      if (attached) window.removeEventListener("mousemove", onMove);
    };
  }, [onMove]);
  return pos;
}

// ─── Inline mini score ring for mock card ───────────────────────────────────

function MiniRing({ score, size = 52 }: { score: number; size?: number }) {
  const r = (size - 7) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? "var(--ok)" : score >= 65 ? "var(--warn)" : "var(--danger)";
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth="7" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - score / 100)}
          strokeLinecap="round"
        />
      </svg>
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column",
      }}>
        <span className="num" style={{ fontWeight: 800, fontSize: size * 0.3, color, lineHeight: 1 }}>{score}</span>
      </div>
    </div>
  );
}

// ─── FAQ accordion item ──────────────────────────────────────────────────────

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="card"
      style={{
        overflow: "hidden",
        transition: "box-shadow .2s",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          padding: "18px 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          cursor: "pointer",
          textAlign: "left",
          color: "var(--t-hi)",
          fontFamily: "var(--font)",
          fontWeight: 600,
          fontSize: 15,
          lineHeight: 1.4,
        }}
        aria-expanded={open}
      >
        <span>{q}</span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          style={{
            flexShrink: 0,
            color: "var(--t-low)",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform .25s",
          }}
        />
      </button>
      {open && (
        <div
          style={{
            padding: "0 22px 18px",
            color: "var(--t-mid)",
            fontSize: 14,
            lineHeight: 1.65,
          }}
        >
          {a}
        </div>
      )}
    </div>
  );
}

// ─── Module chip (locked / active) ──────────────────────────────────────────

function ModuleChip({
  label,
  active,
  icon,
}: {
  label: string;
  active: boolean;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="card card--pad"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 10,
        opacity: active ? 1 : 0.55,
        position: "relative",
        minWidth: 150,
        flex: "1 1 150px",
      }}
    >
      {!active && (
        <span
          className="badge badge--neutral"
          style={{ position: "absolute", top: 10, right: 10, fontSize: 10, padding: "3px 7px" }}
        >
          <Lock size={10} aria-hidden="true" style={{ marginRight: 3 }} />
          Em breve
        </span>
      )}
      {active && (
        <span
          className="badge badge--ok"
          style={{ position: "absolute", top: 10, right: 10, fontSize: 10, padding: "3px 7px" }}
        >
          Ativo
        </span>
      )}
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
          background: active
            ? "linear-gradient(135deg,var(--brand),var(--accent))"
            : "var(--surface-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: active ? "#fff" : "var(--t-low)",
          boxShadow: active ? "var(--shadow-md)" : "none",
        }}
      >
        {icon}
      </div>
      <span style={{ fontWeight: 700, fontSize: 14, color: active ? "var(--t-hi)" : "var(--t-mid)" }}>
        {label}
      </span>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function LandingPage({ onLogin }: { onLogin: () => void }) {
  const scrolled = useScrolled();
  const mouse = useMouse();

  // The first 3 seed lotes for the hero mock
  const heroLotes = LEILAO_SEED.slice(0, 3);

  // Font items for the hero mock (from the first lote)
  const firstLote = LEILAO_SEED[0]!;
  const heroFontItems = firstLote.fontes
    .map((fid) => FONTES.find((f) => f.id === fid))
    .filter((f): f is NonNullable<typeof f> => f !== undefined)
    .map((f) => ({ sigla: f.sigla, cor: f.cor, nome: f.nome }));

  const FAQ_ITEMS = [
    {
      q: "O que é um leilão da Receita Federal e como funciona?",
      a: "A Receita Federal leiloa mercadorias apreendidas (eletrônicos, veículos, bebidas) e abandonadas em alfândegas. A Fonte.ia mostra exatamente os dados publicados na fonte oficial — número do lote, edital, lance mínimo, prazo e quem pode participar (PF/PJ) — sem estimativas ou complementos.",
    },
    {
      q: "Como a Fonte.ia calcula o score de oportunidade de um lote?",
      a: "O score (0–100) é calculado por regras fixas a partir dos dados publicados na fonte: quem pode participar (PF/PJ), prazo disponível para análise, acessibilidade do valor mínimo e se o lote tem imagem. É um apoio de decisão calculado por regra — não é opinião de IA nem análise humana, e não substitui a leitura do edital.",
    },
    {
      q: "Posso usar para PGFN, SPU, DETRAN e Compras.gov.br além da Receita?",
      a: "Hoje a plataforma cobre os leilões da Receita Federal (Sistema de Leilão Eletrônico — SLE). A integração com outros órgãos, como PGFN, SPU, DETRAN e Compras.gov.br, está no roteiro e será liberada em breve.",
    },
    {
      q: "Os dados são confiáveis? De onde vêm?",
      a: "Cada dado exibido vem direto da fonte oficial, com a URL e a data de coleta registradas para você conferir na origem. A IA nunca inventa: se a informação não existir na fonte, ela informa 'evidência insuficiente' em vez de preencher com estimativas.",
    },
    {
      q: "Quanto tempo leva para analisar um lote?",
      a: "Os dados oficiais do lote são exibidos imediatamente. Quando o assistente de IA está ativo, ele gera uma leitura em linguagem simples do lote em segundos, sempre a partir dos dados publicados na fonte.",
    },
    {
      q: "Posso cancelar quando quiser?",
      a: "Sim, sem contrato e sem multa. Os planos começam com 7 dias grátis — você só é cobrado depois e pode cancelar a qualquer momento; cancelando durante o teste, não paga nada.",
    },
  ];

  return (
    <div className="lp-root" style={{ background: "var(--bg)", color: "var(--t-hi)", minHeight: "100vh", overflowX: "hidden" }}>

      {/* ── Responsive rules (scoped; global CSS untouched) ───────────── */}
      <style>{`
        .lp-root { width: 100%; }
        /* CTA shows full label by default; a compact label kicks in on tiny screens. */
        .lp-nav-cta-short { display: none; }
        /* ── Below the hero breakpoint: stack hero, calm the mock card ── */
        @media (max-width: 920px) {
          .lp-hero-grid {
            grid-template-columns: 1fr !important;
            gap: 36px !important;
          }
          .lp-hero-scene { transform: scale(.9); transform-origin: top center; }
        }
        /* ── Phones: hide secondary nav, shrink padding, drop heavy mock ── */
        @media (max-width: 720px) {
          .lp-nav-links { display: none !important; }
          .lp-nav-inner { padding: 11px 18px !important; gap: 10px !important; }
          /* Tighten the generous 24px gutters to 18px on every section/footer.
             Structural + !important so it beats the inline padding. */
          .lp-root > section { padding-left: 18px !important; padding-right: 18px !important; }
          .lp-root > section { padding-top: 64px !important; padding-bottom: 64px !important; }
          .lp-root > footer { padding-left: 18px !important; padding-right: 18px !important; }
          #inicio { padding-top: 112px !important; padding-bottom: 64px !important; }
          .lp-hero-grid { padding-left: 18px !important; padding-right: 18px !important; }
          /* The 3D parallax mock is decorative — remove it on phones so nothing
             can overflow and the hero copy + CTAs lead. */
          .lp-hero-scene-wrap { display: none !important; }
        }
        @media (max-width: 420px) {
          .lp-nav-signin { display: none !important; }
          .lp-nav-cta-full { display: none !important; }
          .lp-nav-cta-short { display: inline !important; }
        }
      `}</style>

      {/* ── NAV ────────────────────────────────────────────────────────── */}
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          transition: "all .3s",
        }}
      >
        <div
          className={scrolled ? "glass" : ""}
          style={{
            borderBottom: scrolled ? "1px solid var(--glass-border)" : "1px solid transparent",
            transition: "all .3s",
          }}
        >
          <div
            className="lp-nav-inner"
            style={{
              maxWidth: 1200,
              margin: "0 auto",
              padding: "13px 24px",
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            {/* Logo */}
            <a
              href="#inicio"
              style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", flexShrink: 0 }}
              aria-label="Fonte.ia — página inicial"
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  background: "linear-gradient(135deg,var(--brand),var(--accent))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 900,
                  fontSize: 16,
                  color: "#fff",
                  letterSpacing: "-0.02em",
                  flexShrink: 0,
                  boxShadow: "var(--shadow-md)",
                }}
                aria-hidden="true"
              >
                f
              </div>
              <span style={{ fontWeight: 800, fontSize: 17, letterSpacing: "-0.025em", color: "var(--t-hi)" }}>
                Fonte<span style={{ color: "var(--accent-ink)" }}>.ia</span>
              </span>
            </a>

            {/* Nav links */}
            <nav
              className="lp-nav-links"
              style={{ display: "flex", alignItems: "center", gap: 22, marginLeft: 24 }}
              aria-label="Menu principal"
            >
              {[
                { label: "Como funciona", href: "#como-funciona" },
                { label: "Planos", href: "#planos" },
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: "var(--t-mid)",
                    textDecoration: "none",
                    transition: "color .18s",
                  }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "var(--t-hi)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "var(--t-mid)")}
                >
                  {link.label}
                </a>
              ))}
            </nav>

            {/* Right actions */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexShrink: 0 }}>
              <ThemeToggle />
              <button
                type="button"
                className="btn btn--ghost btn--sm lp-nav-signin"
                onClick={onLogin}
              >
                Entrar
              </button>
              <button
                type="button"
                className="btn btn--accent btn--sm lp-nav-cta"
                onClick={onLogin}
              >
                <Zap size={14} fill="currentColor" aria-hidden="true" />
                <span className="lp-nav-cta-full">Começar agora</span>
                <span className="lp-nav-cta-short" aria-hidden="true">Entrar</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── HERO ───────────────────────────────────────────────────────── */}
      <section
        id="inicio"
        style={{ position: "relative", overflow: "hidden", paddingTop: 130, paddingBottom: 90 }}
      >
        {/* Background radials */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background:
              "radial-gradient(1200px 600px at 72% 0%, color-mix(in srgb,var(--brand) 22%,transparent), transparent 58%), " +
              "radial-gradient(900px 500px at 10% 40%, color-mix(in srgb,var(--accent) 14%,transparent), transparent 55%)",
          }}
        />
        <div
          aria-hidden="true"
          className="gridbg"
          style={{
            position: "absolute", inset: 0, opacity: 0.45,
            maskImage: "radial-gradient(800px 460px at 50% 0%, #000, transparent 70%)",
            WebkitMaskImage: "radial-gradient(800px 460px at 50% 0%, #000, transparent 70%)",
          }}
        />

        <div
          className="lp-hero-grid"
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "0 24px",
            display: "grid",
            gridTemplateColumns: "minmax(0,1.05fr) minmax(0,.95fr)",
            gap: 48,
            alignItems: "center",
            position: "relative",
          }}
        >
          {/* Left copy */}
          <div>
            <Reveal>
              <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                <span className="badge badge--accent" style={{ padding: "6px 12px" }}>
                  <span
                    className="dot pulse"
                    style={{ background: "var(--accent-ink)", marginRight: 5 }}
                    aria-hidden="true"
                  />
                  Leilões da Receita Federal · mais órgãos em breve
                </span>
              </div>
            </Reveal>

            <Reveal delay={0.05}>
              <h1
                className="display"
                style={{
                  fontSize: "clamp(34px,4.6vw,58px)",
                  lineHeight: 1.03,
                  margin: 0,
                  letterSpacing: "-0.03em",
                }}
              >
                Antes de dar lance,<br />
                <span
                  className="clip-text"
                  style={{
                    backgroundImage: "linear-gradient(100deg,var(--brand-2),var(--accent-2))",
                  }}
                >
                  passe o lote no Raio-X.
                </span>
              </h1>
            </Reveal>

            <Reveal delay={0.1}>
              <p
                style={{
                  fontSize: "clamp(15px,1.5vw,18px)",
                  color: "var(--t-mid)",
                  lineHeight: 1.65,
                  marginTop: 22,
                  maxWidth: 520,
                }}
              >
                A Fonte.ia organiza cada lote de leilão da Receita Federal com os dados
                oficiais — lance mínimo, prazo, quem pode participar — e entrega{" "}
                <strong style={{ color: "var(--t-hi)" }}>score de oportunidade por regra e rastreabilidade até a fonte</strong>{" "}
                para você decidir com fundamento, não com intuição.
              </p>
            </Reveal>

            <Reveal delay={0.15}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 32 }}>
                <button
                  type="button"
                  className="btn btn--accent btn--lg"
                  onClick={onLogin}
                >
                  <Zap size={18} fill="currentColor" aria-hidden="true" />
                  Começar agora
                </button>
                <a
                  href="#como-funciona"
                  className="btn btn--ghost btn--lg"
                >
                  Como funciona <ArrowRight size={16} aria-hidden="true" />
                </a>
              </div>
            </Reveal>

          </div>

          {/* Right: 3D mock card */}
          <Reveal delay={0.08} className="lp-hero-scene-wrap">
            <div className="scene lp-hero-scene" style={{ position: "relative", paddingTop: 40, paddingBottom: 40 }}>
              {/* Ambient orbs */}
              <div
                aria-hidden="true"
                className="orb mesh-anim"
                style={{
                  width: 280, height: 240,
                  background: "var(--accent)",
                  top: 0, right: -30,
                  opacity: 0.18,
                  position: "absolute",
                }}
              />
              <div
                aria-hidden="true"
                className="orb"
                style={{
                  width: 220, height: 180,
                  background: "var(--brand)",
                  bottom: 0, left: 10,
                  opacity: 0.14,
                  position: "absolute",
                }}
              />

              {/* Main bobbing + parallax card */}
              <div
                className="bob3d"
                style={{
                  transform: `perspective(1400px) rotateY(${-8 + mouse.x * 0.35}deg) rotateX(${4 - mouse.y * 0.3}deg)`,
                  transition: "transform .2s ease-out",
                }}
              >
                <div
                  className="panel elevated"
                  style={{
                    overflow: "hidden",
                    borderRadius: 20,
                    boxShadow: "0 44px 100px rgba(0,0,0,.42), 0 8px 24px rgba(0,0,0,.22)",
                  }}
                >
                  {/* Window chrome */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "11px 16px",
                      borderBottom: "1px solid var(--border)",
                      background: "var(--surface-2)",
                    }}
                  >
                    {(["#ff5f57", "#febc2e", "#28c840"] as const).map((c) => (
                      <span
                        key={c}
                        className="dot"
                        style={{ width: 10, height: 10, background: c }}
                        aria-hidden="true"
                      />
                    ))}
                    <span className="kbd" style={{ marginLeft: 10, fontSize: 10 }}>
                      fonte.ia/lotes · exemplo ilustrativo
                    </span>
                  </div>

                  {/* Card body */}
                  <div style={{ padding: "18px 20px", background: "var(--surface)" }}>
                    {/* Header row */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        marginBottom: 14,
                        gap: 12,
                      }}
                    >
                      <div>
                        <span className="badge badge--neutral" style={{ marginBottom: 8, fontSize: 10 }}>
                          Exemplo ilustrativo · RFB
                        </span>
                        <div className="h3" style={{ lineHeight: 1.25, fontSize: 14 }}>
                          Lote de eletrônicos
                        </div>
                        <div className="small muted" style={{ marginTop: 2, fontWeight: 500, fontSize: 12 }}>
                          Alfândega de Santos · SP
                        </div>
                      </div>
                      <ScoreRing value={82} size={54} />
                    </div>

                    {/* Stats grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                      <div className="inset" style={{ padding: 11 }}>
                        <div className="tiny muted">Lance mínimo (fonte)</div>
                        <div className="num" style={{ fontWeight: 800, fontSize: 15 }}>R$ 414.000</div>
                      </div>
                      <div className="inset" style={{ padding: 11 }}>
                        <div className="tiny muted">Quem pode participar</div>
                        <div className="num" style={{ fontWeight: 800, fontSize: 15 }}>PF e PJ</div>
                      </div>
                    </div>

                    {/* Score bars */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {(
                        [
                          ["Quem pode participar (PF/PJ)", 90, "var(--ok)"],
                          ["Prazo para análise", 85, "var(--accent-ink)"],
                          ["Acessibilidade do valor mínimo", 88, "var(--brand-ink)"],
                        ] as const
                      ).map(([lb, v, c]) => (
                        <div key={lb}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginBottom: 3,
                            }}
                          >
                            <span className="tiny muted">{lb}</span>
                            <span className="num tiny" style={{ color: c, fontWeight: 700 }}>{v}</span>
                          </div>
                          <div className="track">
                            <i style={{ display: "block", width: `${v}%`, background: c, height: "100%", borderRadius: 999 }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Footer row */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: 14,
                        paddingTop: 14,
                        borderTop: "1px solid var(--border)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <FonteDots fontes={heroFontItems} size={20} />
                        <span className="tiny muted">Fonte oficial: Receita Federal</span>
                      </div>
                      <span className="badge badge--ok" style={{ fontSize: 10 }}>
                        <ShieldCheck size={10} aria-hidden="true" style={{ marginRight: 3 }} />
                        Rastreável
                      </span>
                    </div>
                  </div>
                </div>

                {/* Floating chips */}
                <div
                  className="glass float"
                  style={{
                    position: "absolute",
                    top: -16,
                    left: -36,
                    padding: "10px 15px",
                    borderRadius: 14,
                    boxShadow: "0 20px 48px rgba(0,0,0,.32)",
                    zIndex: 2,
                  }}
                  aria-hidden="true"
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 9,
                        background: "linear-gradient(135deg,var(--brand),var(--accent))",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Zap size={15} fill="#fff" color="#fff" />
                    </div>
                    <div>
                      <div className="tiny muted">Dados</div>
                      <div className="num" style={{ fontWeight: 800, fontSize: 14 }}>direto da fonte</div>
                    </div>
                  </div>
                </div>

                <div
                  className="glass float-2"
                  style={{
                    position: "absolute",
                    bottom: -16,
                    right: -30,
                    padding: "10px 15px",
                    borderRadius: 14,
                    boxShadow: "0 20px 48px rgba(0,0,0,.32)",
                    zIndex: 2,
                  }}
                  aria-hidden="true"
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <ShieldCheck size={18} style={{ color: "var(--accent-ink)" }} />
                    <div>
                      <div className="tiny muted">Fonte oficial</div>
                      <div
                        className="num"
                        style={{ fontWeight: 800, fontSize: 14, color: "var(--accent-ink)" }}
                      >
                        Receita Federal
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  className="glass float-3"
                  style={{
                    position: "absolute",
                    top: "40%",
                    right: -38,
                    padding: "9px 13px",
                    borderRadius: 12,
                    boxShadow: "0 12px 32px rgba(0,0,0,.28)",
                    zIndex: 2,
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                  }}
                  aria-hidden="true"
                >
                  <span style={{ color: "var(--brand-ink)" }}>★</span>
                  <span className="num small" style={{ fontWeight: 800 }}>Score 82</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>

      </section>

      {/* ── FONTES STRIP ───────────────────────────────────────────────── */}
      <section
        style={{
          padding: "40px 24px",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center" }}>
          <Reveal>
            <p
              className="tiny muted"
              style={{ fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 20 }}
            >
              Hoje conectado à Receita Federal · mais fontes governamentais em breve
            </p>
          </Reveal>
          <Reveal delay={0.05}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                justifyContent: "center",
              }}
            >
              {FONTES.map((f) => {
                const active = f.id === "rfb";
                return (
                <div
                  key={f.id}
                  className="card"
                  style={{
                    padding: "11px 18px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    opacity: active ? 1 : 0.55,
                  }}
                >
                  <div
                    className="num"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: f.cor,
                      color: "#fff",
                      fontWeight: 800,
                      fontSize: 10,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  >
                    {f.sigla}
                  </div>
                  <span className="small" style={{ fontWeight: 600, color: "var(--t-mid)" }}>
                    {f.nome.split("—")[0]?.trim() ?? f.nome}
                  </span>
                  <span
                    className={`badge ${active ? "badge--ok" : "badge--neutral"}`}
                    style={{ fontSize: 9, padding: "2px 6px", flexShrink: 0 }}
                  >
                    {active ? "Ativo" : "Em breve"}
                  </span>
                </div>
                );
              })}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── ANTES x DEPOIS ─────────────────────────────────────────────── */}
      <section style={{ padding: "90px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Reveal style={{ textAlign: "center", marginBottom: 50 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Do caos à clareza</div>
            <h2
              className="display"
              style={{ fontSize: "clamp(28px,3.4vw,42px)", lineHeight: 1.1, margin: 0 }}
            >
              Leilão judicial não precisa<br />dar medo.
            </h2>
          </Reveal>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 22,
            }}
          >
            {/* Sem a Fonte.ia */}
            <Reveal>
              <div
                className="panel"
                style={{
                  padding: 30,
                  height: "100%",
                  borderColor: "color-mix(in srgb,var(--danger) 22%,var(--border))",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: "color-mix(in srgb,var(--danger) 12%,transparent)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <X size={20} color="var(--danger)" aria-hidden="true" />
                  </div>
                  <span className="h3" style={{ color: "var(--t-mid)", fontWeight: 700 }}>
                    Sem a Fonte.ia
                  </span>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                  {[
                    "Editais publicados em PDFs dispersos por dezenas de portais",
                    "Risco oculto em cláusulas técnicas que exigem tempo e especialização",
                    "Cruzamento manual entre lote, laudo e tributação — horas de trabalho",
                    "Prazo de leilão eletrônico encerrado sem aviso prévio",
                    "Comprador paga o lance e descobre depois o ônus tributário",
                  ].map((t) => (
                    <li key={t} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                      <X
                        size={16}
                        color="var(--danger)"
                        aria-hidden="true"
                        style={{ flexShrink: 0, marginTop: 2, opacity: 0.75 }}
                      />
                      <span className="small" style={{ color: "var(--t-mid)", lineHeight: 1.55 }}>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            {/* Com a Fonte.ia */}
            <Reveal delay={0.08}>
              <div
                className="panel glow-accent"
                style={{
                  padding: 30,
                  height: "100%",
                  position: "relative",
                  overflow: "hidden",
                  borderColor: "color-mix(in srgb,var(--accent) 30%,var(--border))",
                }}
              >
                <div
                  aria-hidden="true"
                  className="orb"
                  style={{ width: 180, height: 140, background: "var(--accent)", top: -40, right: -20, opacity: 0.15 }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: "linear-gradient(135deg,var(--brand),var(--accent))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Shield size={20} color="#fff" aria-hidden="true" />
                  </div>
                  <span className="h3">Com a Fonte.ia</span>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
                  {[
                    "Lotes da Receita Federal reunidos em uma única plataforma",
                    "Score de oportunidade por regra, com cada lote rastreado à fonte oficial",
                    "Lance mínimo, prazo e elegibilidade (PF/PJ) lidos direto da fonte",
                    "Alerta de prazo para não perder a data do leilão",
                    "Relatório PDF com link e data de coleta da fonte oficial",
                  ].map((t) => (
                    <li key={t} style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                      <Check
                        size={16}
                        color="var(--accent-ink)"
                        aria-hidden="true"
                        style={{ flexShrink: 0, marginTop: 2 }}
                      />
                      <span className="small" style={{ lineHeight: 1.55, fontWeight: 500 }}>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── COMO FUNCIONA ──────────────────────────────────────────────── */}
      <section
        id="como-funciona"
        style={{
          padding: "90px 24px",
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Reveal style={{ textAlign: "center", marginBottom: 54 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Simples assim</div>
            <h2
              className="display"
              style={{ fontSize: "clamp(28px,3.4vw,42px)", lineHeight: 1.1, margin: 0 }}
            >
              Do clique ao arremate em 3 passos
            </h2>
            <p className="muted" style={{ fontSize: 16, marginTop: 14, maxWidth: 520, margin: "14px auto 0" }}>
              Para o investidor que exige rigor. E para quem está começando e não quer depender de sorte.
            </p>
          </Reveal>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 22,
            }}
          >
            {(
              [
                {
                  icon: <Database size={24} color="#fff" aria-hidden="true" />,
                  title: "Acompanhe os leilões da Receita",
                  desc: "Os lotes do Sistema de Leilão Eletrônico da Receita Federal chegam reunidos em um só lugar — nenhum lote passa despercebido. Mais órgãos em breve.",
                },
                {
                  icon: <Zap size={24} fill="#fff" color="#fff" aria-hidden="true" />,
                  title: "Veja o lote com rastreabilidade",
                  desc: "Lance mínimo, prazo, elegibilidade (PF/PJ) e score de oportunidade por regra — cada dado vinculado à fonte oficial. Pergunte em português ao assistente, receba com prova.",
                },
                {
                  icon: <ShieldCheck size={24} color="#fff" aria-hidden="true" />,
                  title: "Decida com fundamento",
                  desc: "Relatório com link e data de coleta da fonte oficial e evidência rastreável. O score é apoio de decisão — confirme sempre no edital antes de propor.",
                },
              ] as const
            ).map((step, i) => (
              <Reveal key={step.title} delay={i * 0.08}>
                <div
                  className="card card--pad card--hover"
                  style={{ padding: 28, height: "100%", position: "relative" }}
                >
                  <div
                    className="num display"
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: 18,
                      right: 22,
                      fontSize: 44,
                      color: "var(--border-2)",
                      opacity: 0.7,
                      lineHeight: 1,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 14,
                      background: "linear-gradient(135deg,var(--brand),var(--accent))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "var(--shadow-md)",
                      marginBottom: 20,
                    }}
                  >
                    {step.icon}
                  </div>
                  <div className="h3" style={{ fontSize: 17 }}>{step.title}</div>
                  <p className="muted small" style={{ marginTop: 10, lineHeight: 1.6 }}>{step.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── MÓDULOS ────────────────────────────────────────────────────── */}
      <section style={{ padding: "90px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Reveal style={{ textAlign: "center", marginBottom: 50 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Módulos</div>
            <h2
              className="display"
              style={{ fontSize: "clamp(28px,3.4vw,42px)", lineHeight: 1.1, margin: 0 }}
            >
              Uma plataforma.<br />Toda a inteligência pública.
            </h2>
            <p className="muted" style={{ fontSize: 15, marginTop: 14, maxWidth: 480, margin: "14px auto 0" }}>
              Leilões já disponíveis. Os demais módulos abrem conforme a demanda.
            </p>
          </Reveal>

          <Reveal delay={0.05}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center" }}>
              <ModuleChip
                label="Leilões Públicos"
                active={true}
                icon={<Zap size={20} fill="#fff" color="#fff" />}
              />
              <ModuleChip
                label="Licitações"
                active={false}
                icon={<Database size={20} />}
              />
              <ModuleChip
                label="Empresas (CNPJ)"
                active={false}
                icon={<Database size={20} />}
              />
              <ModuleChip
                label="INPI / Marcas"
                active={false}
                icon={<Shield size={20} />}
              />
              <ModuleChip
                label="Ambiental"
                active={false}
                icon={<Database size={20} />}
              />
            </div>
          </Reveal>

          {/* Sample lotes */}
          <Reveal delay={0.1} style={{ marginTop: 44 }}>
            <div className="panel" style={{ overflow: "hidden" }}>
              <div
                style={{
                  padding: "14px 20px",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--surface-2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span className="h3" style={{ fontSize: 14 }}>Lotes em destaque — Receita Federal</span>
                <span className="badge badge--neutral" style={{ fontSize: 10 }}>Exemplo ilustrativo</span>
              </div>
              <div>
                {heroLotes.map((lote, i) => {
                  const lotesFontItems = lote.fontes
                    .map((fid) => FONTES.find((f) => f.id === fid))
                    .filter((f): f is NonNullable<typeof f> => f !== undefined)
                    .map((f) => ({ sigla: f.sigla, cor: f.cor, nome: f.nome }));

                  return (
                    <div
                      key={lote.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        padding: "16px 20px",
                        borderBottom: i < heroLotes.length - 1 ? "1px solid var(--border)" : "none",
                        flexWrap: "wrap",
                      }}
                    >
                      <MiniRing score={lote.score} size={48} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--t-hi)" }}>
                          {lote.titulo}
                        </div>
                        <div className="tiny muted" style={{ marginTop: 2 }}>
                          {lote.cidade} · prazo {lote.dataFim}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div className="num" style={{ fontWeight: 800, fontSize: 14, color: "var(--t-hi)" }}>
                          {formatBRL(lote.minimo)}
                        </div>
                        <div className="tiny muted">lance mínimo</div>
                      </div>
                      <FonteDots fontes={lotesFontItems} size={18} />
                    </div>
                  );
                })}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── PLANOS ─────────────────────────────────────────────────────── */}
      <section
        id="planos"
        style={{
          padding: "90px 24px",
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Reveal style={{ textAlign: "center", marginBottom: 50 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Planos</div>
            <h2
              className="display"
              style={{ fontSize: "clamp(28px,3.4vw,42px)", lineHeight: 1.1, margin: 0 }}
            >
              Simples. Transparente.<br />Sem surpresa.
            </h2>
            <p className="muted" style={{ fontSize: 15, marginTop: 14 }}>
              Cancele quando quiser. Sem contrato.
            </p>
          </Reveal>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))",
              gap: 22,
              alignItems: "start",
            }}
          >
            {PLANOS.map((plano) => (
              <Reveal key={plano.id} delay={plano.destaque ? 0 : 0.06}>
                <div
                  style={{
                    background: plano.destaque
                      ? "linear-gradient(180deg,var(--surface),var(--surface))"
                      : "var(--surface)",
                    border: plano.destaque
                      ? "2px solid var(--accent)"
                      : "1px solid var(--border)",
                    borderRadius: "var(--r-xl)",
                    padding: 28,
                    position: "relative",
                    boxShadow: plano.destaque
                      ? "0 0 0 1px var(--glass-border), 0 30px 70px rgba(16,201,176,.18)"
                      : "var(--shadow-sm)",
                  }}
                >
                  {plano.destaque && (
                    <div
                      style={{
                        position: "absolute",
                        top: -13,
                        left: "50%",
                        transform: "translateX(-50%)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span className="badge badge--accent" style={{ fontSize: 11, padding: "5px 12px" }}>
                        ⭐ Mais popular
                      </span>
                    </div>
                  )}

                  <div style={{ marginBottom: 20 }}>
                    <div className="h3" style={{ fontSize: 18 }}>{plano.nome}</div>
                    <div className="small muted" style={{ marginTop: 5 }}>{plano.tagline}</div>
                  </div>

                  <div style={{ marginBottom: 22 }}>
                    {plano.preco === 0 ? (
                      <div
                        className="display"
                        style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}
                      >
                        Grátis
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                        <span className="display" style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.03em" }}>
                          {formatBRL(plano.preco)}
                        </span>
                        <span className="muted small">{plano.periodo}</span>
                      </div>
                    )}
                  </div>

                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "flex", flexDirection: "column", gap: 11 }}>
                    {plano.feats.map((feat) => (
                      <li key={feat} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <Check
                          size={16}
                          color={plano.destaque ? "var(--accent-ink)" : "var(--ok)"}
                          aria-hidden="true"
                          style={{ flexShrink: 0, marginTop: 1 }}
                        />
                        <span className="small" style={{ lineHeight: 1.5 }}>{feat}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    className={`btn ${plano.destaque ? "btn--accent" : "btn--ghost"} btn--block btn--lg`}
                    onClick={onLogin}
                  >
                    {plano.cta}
                  </button>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.1}>
            <p style={{ textAlign: "center", marginTop: 28, fontSize: 13, color: "var(--t-mid)" }}>
              Precisa de API, white-label ou mais usuários?{" "}
              <button type="button" className="link" onClick={onLogin} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                Fale com a gente
              </button>
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────── */}
      <section
        id="faq"
        style={{
          padding: "90px 24px",
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <Reveal style={{ textAlign: "center", marginBottom: 50 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Dúvidas frequentes</div>
            <h2
              className="display"
              style={{ fontSize: "clamp(26px,3vw,38px)", lineHeight: 1.1, margin: 0 }}
            >
              Perguntas que todo<br />mundo faz
            </h2>
          </Reveal>

          <Reveal delay={0.05}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {FAQ_ITEMS.map((item) => (
                <FaqItem key={item.q} q={item.q} a={item.a} />
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── CTA FINAL ──────────────────────────────────────────────────── */}
      <section
        style={{
          padding: "100px 24px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(800px 500px at 50% 50%, color-mix(in srgb,var(--brand) 18%,transparent), transparent 65%), " +
              "radial-gradient(600px 400px at 80% 20%, color-mix(in srgb,var(--accent) 12%,transparent), transparent 55%)",
            pointerEvents: "none",
          }}
        />
        <div
          aria-hidden="true"
          className="gridbg"
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0.35,
            maskImage: "radial-gradient(700px 400px at 50% 50%, #000, transparent 70%)",
            WebkitMaskImage: "radial-gradient(700px 400px at 50% 50%, #000, transparent 70%)",
          }}
        />

        <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center", position: "relative" }}>
          <Reveal>
            <div className="badge badge--accent" style={{ marginBottom: 20, padding: "7px 14px" }}>
              <span className="dot pulse" style={{ background: "var(--accent-ink)", marginRight: 6 }} aria-hidden="true" />
              7 dias grátis · Cancele quando quiser
            </div>
            <h2
              className="display"
              style={{ fontSize: "clamp(30px,4vw,48px)", lineHeight: 1.05, margin: "0 0 18px" }}
            >
              Comece hoje.
              <br />
              <span
                className="clip-text"
                style={{ backgroundImage: "linear-gradient(100deg,var(--brand-2),var(--accent-2))" }}
              >
                O próximo lote é seu.
              </span>
            </h2>
            <p className="muted" style={{ fontSize: 16, marginBottom: 36, lineHeight: 1.6 }}>
              Acesse os leilões da Receita Federal, passe qualquer lote no Raio-X
              e decida antes do concorrente saber que ele existe.
            </p>
            <button
              type="button"
              className="btn btn--accent btn--lg"
              onClick={onLogin}
              style={{ fontSize: 16, padding: "15px 32px" }}
            >
              <Zap size={18} fill="currentColor" aria-hidden="true" />
              Começar agora
            </button>
            <p className="tiny muted" style={{ marginTop: 16 }}>
              Sem contrato · Cancele quando quiser · Dados de fontes oficiais
            </p>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: "1px solid var(--border)",
          padding: "32px 24px",
          background: "var(--surface)",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          {/* Brand */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 7,
                background: "linear-gradient(135deg,var(--brand),var(--accent))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: 13,
                color: "#fff",
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              f
            </div>
            <span style={{ fontWeight: 800, fontSize: 14, letterSpacing: "-0.025em" }}>
              Fonte<span style={{ color: "var(--accent-ink)" }}>.ia</span>
              <span className="muted small" style={{ fontWeight: 400, marginLeft: 6 }}>by Olli</span>
            </span>
          </div>

          {/* Recursos gratuitos — links reais p/ SEO e p/ o leigo explorar antes de pagar */}
          <nav style={{ display: "flex", gap: 20, flexWrap: "wrap" }} aria-label="Recursos gratuitos">
            {[
              { label: "Calculadora de lance", href: "/ferramentas/calculadora-lance" },
              { label: "Guias de leilão", href: "/guias" },
              { label: "Como comprar na Receita", href: "/guias/como-comprar-leilao-receita" },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="link"
                style={{ fontSize: 13, fontWeight: 500, color: "var(--t-mid)" }}
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Legal links */}
          <nav style={{ display: "flex", gap: 20, flexWrap: "wrap" }} aria-label="Links legais">
            {[
              { label: "Privacidade", href: "/privacidade" },
              { label: "Cookies", href: "/cookies" },
              { label: "Termos", href: "/termos" },
            ].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="link"
                style={{ fontSize: 13, fontWeight: 500, color: "var(--t-mid)" }}
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Copyright */}
          <p className="tiny muted" style={{ margin: 0 }}>
            © {new Date().getFullYear()} Olli. Dados públicos com evidência rastreável.
          </p>
        </div>
      </footer>
    </div>
  );
}
