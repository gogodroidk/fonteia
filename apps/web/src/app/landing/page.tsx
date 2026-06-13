import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowRight, Check, X, Lock, ChevronDown, Zap, Shield, Database, Star, ShieldCheck } from "lucide-react";
import { ScoreRing, FonteDots, ThemeToggle } from "../../components/ui";
import {
  DEPOIMENTOS,
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

function useMouse() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const onMove = useCallback((e: MouseEvent) => {
    setPos({
      x: (e.clientX / window.innerWidth - 0.5) * 12,
      y: (e.clientY / window.innerHeight - 0.5) * 8,
    });
  }, []);
  useEffect(() => {
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
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
      a: "A Receita Federal leiloa mercadorias apreendidas (eletrônicos, veículos, bebidas) e abandonadas em alfândegas. O lance mínimo costuma ser 45% do valor de avaliação oficial — a Fonte.ia mostra exatamente o valor de avaliação, o mínimo, e cruza com tributos e laudos para que você saiba o que está comprando.",
    },
    {
      q: "Como a Fonte.ia calcula o score de risco de um lote?",
      a: "O score (0–100) combina quatro dimensões: documentação e laudo técnico, carga tributária estimada, liquidez de revenda e situação de ocupação do bem. Cada ponto tem a fonte oficial vinculada — você vê por que o lote tirou 94 ou 55.",
    },
    {
      q: "Posso usar para PGFN e SPU além da Receita?",
      a: "Sim. A plataforma já monitora editais da Receita Federal (SLE), da Procuradoria-Geral da Fazenda Nacional (PGFN) e da Secretaria de Patrimônio da União (SPU), além do DETRAN e do Compras.gov.br.",
    },
    {
      q: "Os dados são confiáveis? De onde vêm?",
      a: "Cada dado exibido tem fonte oficial, data de coleta e hash SHA-256. A IA nunca inventa: se a informação não existir na fonte, ela informa 'evidência insuficiente' em vez de preencher com estimativas.",
    },
    {
      q: "Quanto tempo leva para analisar um lote?",
      a: "Entre 30 e 60 segundos após o carregamento. A plataforma cruza o edital com CNPJ do leiloeiro, situação tributária, laudo técnico e demais documentos disponíveis nos órgãos oficiais — tudo automaticamente.",
    },
    {
      q: "Posso cancelar quando quiser?",
      a: "Sim, sem contrato e sem multa. Você mantém o acesso até o fim do período já pago. O plano Avaliação é permanentemente gratuito.",
    },
  ];

  return (
    <div style={{ background: "var(--bg)", color: "var(--t-hi)", minHeight: "100vh" }}>

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
              style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}
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
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
              <ThemeToggle />
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={onLogin}
              >
                Entrar
              </button>
              <button
                type="button"
                className="btn btn--accent btn--sm"
                onClick={onLogin}
              >
                <Zap size={14} fill="currentColor" aria-hidden="true" />
                Começar grátis
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
                  Leilões públicos · Receita Federal · PGFN · SPU
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
                A Fonte.ia cruza cada lote de leilão da Receita Federal, PGFN e SPU com
                editais, laudos e tributos em segundos — e entrega{" "}
                <strong style={{ color: "var(--t-hi)" }}>score de risco, economia potencial e rastreabilidade</strong>{" "}
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
                  Iniciar avaliação gratuita
                </button>
                <a
                  href="#como-funciona"
                  className="btn btn--ghost btn--lg"
                >
                  Como funciona <ArrowRight size={16} aria-hidden="true" />
                </a>
              </div>
            </Reveal>

            {/* Social proof */}
            <Reveal delay={0.2}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 28, flexWrap: "wrap" }}>
                {/* Stacked avatars */}
                <div style={{ display: "flex" }} aria-label="Usuários da plataforma">
                  {DEPOIMENTOS.map((d, i) => (
                    <div
                      key={d.avatar}
                      className="avatar"
                      style={{
                        width: 32,
                        height: 32,
                        fontSize: 10,
                        fontWeight: 800,
                        marginLeft: i > 0 ? -9 : 0,
                        border: "2.5px solid var(--bg)",
                        zIndex: DEPOIMENTOS.length - i,
                        position: "relative",
                      }}
                      title={d.nome}
                    >
                      {d.avatar}
                    </div>
                  ))}
                  {/* extra placeholder avatars */}
                  {(["JV", "LS"] as const).map((initials, i) => (
                    <div
                      key={initials}
                      className="avatar"
                      style={{
                        width: 32,
                        height: 32,
                        fontSize: 10,
                        fontWeight: 800,
                        marginLeft: -9,
                        border: "2.5px solid var(--bg)",
                        position: "relative",
                        zIndex: i,
                        background: "linear-gradient(135deg,var(--brand),var(--accent))",
                      }}
                      aria-hidden="true"
                    >
                      {initials}
                    </div>
                  ))}
                </div>

                <div>
                  <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} size={13} fill="var(--gold)" color="var(--gold)" aria-hidden="true" />
                    ))}
                  </div>
                  <div className="tiny muted" style={{ marginTop: 3 }}>
                    <strong style={{ color: "var(--t-hi)" }}>2.400+</strong> profissionais já utilizam
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Right: 3D mock card */}
          <Reveal delay={0.08}>
            <div className="scene" style={{ position: "relative", paddingTop: 40, paddingBottom: 40 }}>
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
                      fonte.ia/lotes/RFB-0042-87
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
                        <span className="badge badge--accent" style={{ marginBottom: 8, fontSize: 10 }}>
                          Análise concluída · RFB
                        </span>
                        <div className="h3" style={{ lineHeight: 1.25, fontSize: 14 }}>
                          Lote 42 — Eletrônicos
                        </div>
                        <div className="small muted" style={{ marginTop: 2, fontWeight: 500, fontSize: 12 }}>
                          Alfândega de Santos · SP
                        </div>
                      </div>
                      <ScoreRing value={94} size={54} />
                    </div>

                    {/* Stats grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                      <div className="inset" style={{ padding: 11 }}>
                        <div className="tiny muted">Lance mínimo</div>
                        <div className="num" style={{ fontWeight: 800, fontSize: 15 }}>R$ 414.000</div>
                      </div>
                      <div
                        style={{
                          padding: 11,
                          borderRadius: "var(--r-md)",
                          background: "color-mix(in srgb,var(--accent) 12%,transparent)",
                          border: "1px solid color-mix(in srgb,var(--accent) 26%,transparent)",
                        }}
                      >
                        <div className="tiny" style={{ color: "var(--accent-ink)", fontWeight: 700 }}>
                          Economia potencial
                        </div>
                        <div
                          className="num"
                          style={{ fontWeight: 800, fontSize: 15, color: "var(--accent-ink)" }}
                        >
                          R$ 506.000
                        </div>
                      </div>
                    </div>

                    {/* Score bars */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {(
                        [
                          ["Documentação e laudo", 96, "var(--ok)"],
                          ["Tributos e custos", 90, "var(--accent-ink)"],
                          ["Liquidez de revenda", 90, "var(--brand-ink)"],
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
                        <span className="tiny muted">3 fontes oficiais</span>
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
                      <div className="tiny muted">Análise em</div>
                      <div className="num" style={{ fontWeight: 800, fontSize: 14 }}>32 segundos</div>
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
                        RFB · PGFN
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
                  <span style={{ color: "var(--brand-ink)" }}>↗</span>
                  <span className="num small" style={{ fontWeight: 800 }}>-55%</span>
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Stats strip */}
        <div
          style={{
            maxWidth: 1180,
            margin: "60px auto 0",
            padding: "0 24px",
            display: "flex",
            gap: 0,
            flexWrap: "wrap",
            position: "relative",
          }}
        >
          {(
            [
              { value: "1.284", label: "Lotes disponíveis agora" },
              { value: "47", label: "Órgãos monitorados" },
              { value: "R$ 8,6M", label: "Economia potencial mapeada" },
              { value: "SHA-256", label: "Evidência rastreável" },
            ] as const
          ).map((s, i) => (
            <div
              key={s.label}
              style={{
                flex: "1 1 180px",
                borderLeft: i > 0 ? "1px solid var(--border)" : "none",
                padding: "0 28px",
                textAlign: "center",
              }}
            >
              <div
                className="display num"
                style={{ fontSize: "clamp(22px,2.4vw,30px)", fontWeight: 800, color: "var(--t-hi)" }}
              >
                {s.value}
              </div>
              <div className="tiny muted" style={{ marginTop: 5 }}>{s.label}</div>
            </div>
          ))}
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
              Conectado às fontes governamentais que sustentam a decisão
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
              {FONTES.map((f) => (
                <div
                  key={f.id}
                  className="card"
                  style={{
                    padding: "11px 18px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
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
                </div>
              ))}
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
                    "Todos os órgãos monitorados em uma única plataforma",
                    "Score de risco com cada ponto rastreado à fonte oficial",
                    "Tributos, laudos e situação do bem consolidados em segundos",
                    "Alerta imediato assim que o órgão publica o edital",
                    "Relatório PDF com hash SHA-256 para apresentar ao cliente",
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
                  title: "Monitore os órgãos oficiais",
                  desc: "Configure quais órgãos e regiões acompanhar. Novos editais da Receita, PGFN e SPU chegam automaticamente — nenhum lote passa despercebido.",
                },
                {
                  icon: <Zap size={24} fill="#fff" color="#fff" aria-hidden="true" />,
                  title: "A IA analisa o lote",
                  desc: "Score de risco, tributos, laudos e rastreabilidade da fonte em segundos. Cada informação tem o documento oficial vinculado. Pergunte em português, receba com prova.",
                },
                {
                  icon: <ShieldCheck size={24} color="#fff" aria-hidden="true" />,
                  title: "Decida com fundamento",
                  desc: "Relatório com selo de fonte oficial, margem calculada e evidência rastreável. Apresente ao cliente com total segurança jurídica.",
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
                <span className="h3" style={{ fontSize: 14 }}>Lotes em destaque — Receita Federal & PGFN</span>
                <span className="badge badge--accent" style={{ fontSize: 10 }}>Ao vivo</span>
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

      {/* ── DEPOIMENTOS ────────────────────────────────────────────────── */}
      <section style={{ padding: "90px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Reveal style={{ textAlign: "center", marginBottom: 50 }}>
            <div className="eyebrow" style={{ marginBottom: 12 }}>Resultados reais</div>
            <h2
              className="display"
              style={{ fontSize: "clamp(28px,3.4vw,42px)", lineHeight: 1.1, margin: 0 }}
            >
              Quem usa, não volta<br />ao método antigo.
            </h2>
          </Reveal>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 20,
            }}
          >
            {DEPOIMENTOS.map((d, i) => (
              <Reveal key={d.nome} delay={i * 0.06}>
                <div
                  className="card card--pad card--hover"
                  style={{ padding: 26, height: "100%", display: "flex", flexDirection: "column", gap: 16 }}
                >
                  {/* Stars */}
                  <div style={{ display: "flex", gap: 3 }}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} size={13} fill="var(--gold)" color="var(--gold)" aria-hidden="true" />
                    ))}
                  </div>

                  <blockquote
                    style={{ margin: 0, fontSize: 14, lineHeight: 1.65, color: "var(--t-mid)", flex: 1 }}
                  >
                    "{d.txt}"
                  </blockquote>

                  {/* Gain badge */}
                  <div
                    className="inset"
                    style={{ padding: "8px 12px", display: "inline-flex", alignSelf: "flex-start" }}
                  >
                    <span
                      className="num small"
                      style={{ fontWeight: 800, color: "var(--accent-ink)" }}
                    >
                      {d.ganho}
                    </span>
                  </div>

                  {/* Author */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      className="avatar"
                      style={{ width: 38, height: 38, fontSize: 13, fontWeight: 800 }}
                      aria-hidden="true"
                    >
                      {d.avatar}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{d.nome}</div>
                      <div className="tiny muted">{d.papel}</div>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
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
              5 análises gratuitas · Sem cartão de crédito
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
              Acesse os editais da Receita Federal, PGFN e SPU, passe qualquer lote no Raio-X
              e decida antes do concorrente saber que ele existe.
            </p>
            <button
              type="button"
              className="btn btn--accent btn--lg"
              onClick={onLogin}
              style={{ fontSize: 16, padding: "15px 32px" }}
            >
              <Zap size={18} fill="currentColor" aria-hidden="true" />
              Iniciar avaliação gratuita
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
