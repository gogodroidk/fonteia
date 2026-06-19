import { PRODUCT_MODULES, type ModuleId, type ProductModule } from "@fonteia/domain";
import { ModuleCard } from "../../components/module-card";

/* ── types ───────────────────────────────────────────────────────────────── */

interface ModulesPageProps {
  selectedModuleId?: ModuleId;
}

/* ── example questions per module ────────────────────────────────────────── */
/*
 * These are defined locally because the `ProductModule` shape has no such
 * field. They are honest descriptions of real queries the module can handle.
 */
const EXAMPLE_QUESTIONS: Readonly<Partial<Record<ModuleId, string>>> = {
  leiloes:    "Quais lotes de veículos têm lance mínimo abaixo de R$ 15 mil na minha cidade?",
  licitacoes: "Quais editais para serviços de TI foram abertos em SP nos últimos 30 dias?",
  empresas:   "Esta empresa tem sócios com sanções federais ou contratos suspensos?",
  juridico:   "Há processos ativos no CNJ envolvendo este CNPJ ou CPF?",
  inpi:       "Essa marca já está registrada? Com quem e em quais classes?",
  ambiental:  "Este imóvel rural tem embargo do IBAMA ou área de desmatamento recente?",
  politica:   "Como este deputado votou em pautas de interesse para o meu setor?",
  municipios: "Qual a dívida per capita e o repasse federal do município onde meu cliente está?",
  api:        "Como consumo dados de licitações normalizados via API com webhook?",
};

/* ── display order: strongest modules first ──────────────────────────────── */

const MODULE_ORDER: ModuleId[] = [
  "leiloes",
  "licitacoes",
  "empresas",
  "juridico",
  "municipios",
  "politica",
  "inpi",
  "ambiental",
  "api",
];

function sortModules(modules: ProductModule[]): ProductModule[] {
  const ordered: ProductModule[] = [];
  for (const id of MODULE_ORDER) {
    const m = modules.find((mod) => mod.id === id);
    if (m != null) ordered.push(m);
  }
  // Append any module not listed in MODULE_ORDER so we never lose new ones
  for (const m of modules) {
    if (!MODULE_ORDER.includes(m.id)) ordered.push(m);
  }
  return ordered;
}

/* ── number helpers ──────────────────────────────────────────────────────── */

function formatBigNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (n >= 1_000) {
    const k = n / 1_000;
    return `${Number.isInteger(k) ? k : k.toFixed(0)} mil`;
  }
  return n.toLocaleString("pt-BR");
}

/* ── stagger delay per visible card position ─────────────────────────────── */

function entranceDelay(index: number): string {
  return `${index * 55}ms`;
}

/* ── derived data ─────────────────────────────────────────────────────────── */

const SORTED_MODULES = sortModules(PRODUCT_MODULES);
const ACTIVE_MODULES = PRODUCT_MODULES.filter((m) => m.status === "active");
const TOTAL_RECORDS = ACTIVE_MODULES.reduce((sum, m) => sum + (m.recordCount ?? 0), 0);

/* ── skeleton card ────────────────────────────────────────────────────────── */

function SkeletonCard() {
  return (
    <div
      className="skeleton-card"
      style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12, minHeight: 180 }}
      aria-hidden="true"
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="skeleton" style={{ width: 38, height: 38, borderRadius: "var(--r-md)" }} />
        <div className="skeleton" style={{ width: 54, height: 18, borderRadius: 999 }} />
      </div>
      <div className="skeleton-text" style={{ width: "55%" }} />
      <div className="skeleton-text" style={{ width: "90%" }} />
      <div className="skeleton-text" style={{ width: "75%" }} />
      <div className="skeleton-text" style={{ width: "40%", marginTop: 4 }} />
    </div>
  );
}

/* ── stat strip card ──────────────────────────────────────────────────────── */

interface StatCardProps {
  label: string;
  value: string;
  color?: string;
}

function StatCard({ label, value, color }: StatCardProps) {
  return (
    <div className="card card--pad fade-in" style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--t-mid)", letterSpacing: ".01em" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: color ?? "var(--t-hi)",
          marginTop: 8,
          letterSpacing: "-.025em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* ── page ─────────────────────────────────────────────────────────────────── */

export function ModulesPage({ selectedModuleId = "leiloes" }: ModulesPageProps) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 28 }}>

      {/* ── Header ── */}
      <div className="fade-in">
        <span className="eyebrow">Catálogo de módulos</span>
        <h2
          style={{
            margin: "6px 0 8px",
            fontSize: "clamp(18px, 4vw, 24px)",
            fontWeight: 800,
            letterSpacing: "-.025em",
            lineHeight: 1.15,
            color: "var(--t-hi)",
          }}
        >
          Dados públicos organizados para decisões reais
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: "var(--t-mid)",
            maxWidth: 560,
            lineHeight: 1.6,
          }}
        >
          Cada módulo transforma uma fonte oficial em respostas rastreáveis.
          Todo registro exibe a origem, a data de coleta e o link para o documento — a IA nunca inventa.
        </p>
      </div>

      {/* ── Stats strip ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: 10,
        }}
      >
        <StatCard
          label="Módulos ativos"
          value={String(ACTIVE_MODULES.length)}
          color="var(--brand-ink)"
        />
        <StatCard
          label="Total indexado"
          value={formatBigNumber(TOTAL_RECORDS)}
          color="var(--accent-ink)"
        />
        <StatCard
          label="Fontes oficiais"
          value="8"
          color="var(--t-hi)"
        />
        <div className="card card--pad fade-in" style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--t-mid)", letterSpacing: ".01em" }}>
            Carro-chefe
          </div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 10.5,
                fontWeight: 700,
                color: "var(--brand-ink)",
                background: "color-mix(in srgb, var(--brand) 12%, var(--surface))",
                border: "1px solid color-mix(in srgb, var(--brand) 25%, transparent)",
              }}
            >
              RFB
            </span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--t-hi)" }}>Leilões</span>
          </div>
        </div>
      </div>

      {/* ── Section heading ── */}
      <div>
        <h3
          style={{
            margin: "0 0 14px",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "var(--t-low)",
          }}
        >
          Todos os módulos — ativos primeiro
        </h3>

        {/* Module grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(300px, 100%), 1fr))",
            gap: 14,
            alignItems: "start",
          }}
        >
          {SORTED_MODULES.map((module, i) => (
            <ModuleCard
              key={module.id}
              module={module}
              selected={module.id === selectedModuleId}
              exampleQuestion={EXAMPLE_QUESTIONS[module.id]}
              entranceDelay={entranceDelay(i)}
            />
          ))}
        </div>
      </div>

      {/* ── Footnote ── */}
      <p
        style={{
          fontSize: 11.5,
          color: "var(--t-low)",
          margin: 0,
          lineHeight: 1.5,
          borderTop: "1px solid var(--border)",
          paddingTop: 14,
        }}
      >
        Contagens baseadas nos registros indexados. Ao vivo, os números refletem a última coleta.
        Fontes: RFB (Receita Federal), PNCP (Portal Nacional de Contratações Públicas), IBGE,
        Câmara dos Deputados, IBAMA, CNJ, INPI.
      </p>
    </section>
  );
}

/* ── named export for skeleton (external consumers that want to show loading state) ── */
export { SkeletonCard as ModuleCardSkeleton };
