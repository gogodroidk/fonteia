import { PRODUCT_MODULES, type ModuleId } from "@fonteia/domain";
import { ModuleCard } from "../../components/module-card";

interface ModulesPageProps {
  selectedModuleId?: ModuleId;
}

const ACTIVE_MODULES = PRODUCT_MODULES.filter((m) => m.status === "active");
const TOTAL_RECORDS = ACTIVE_MODULES.reduce((sum, m) => sum + (m.recordCount ?? 0), 0);

function formatBigNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (n >= 1_000) {
    const k = n / 1_000;
    return `${Number.isInteger(k) ? k : k.toFixed(0)} mil`;
  }
  return n.toLocaleString("pt-BR");
}

export function ModulesPage({ selectedModuleId = "leiloes" }: ModulesPageProps) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div>
        <span className="eyebrow">Plataforma de dados públicos</span>
        <h2 style={{ margin: "4px 0 6px" }}>
          {ACTIVE_MODULES.length} módulos ativos — {formatBigNumber(TOTAL_RECORDS)} registros rastreáveis
        </h2>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--t-mid)", maxWidth: 560, lineHeight: 1.55 }}>
          Cada dado conectado à fonte oficial. A IA nunca inventa — exibe o registro, a origem e a data de coleta.
          Leilões é o módulo mais maduro; os demais estão indexados e navegáveis.
        </p>
      </div>

      {/* Stats strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 12,
        }}
      >
        <div className="card card--pad">
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t-mid)" }}>Módulos ativos</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--brand-ink)", marginTop: 10, letterSpacing: "-.025em" }}>
            {ACTIVE_MODULES.length}
          </div>
        </div>
        <div className="card card--pad">
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t-mid)" }}>Total indexado</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--accent-ink)", marginTop: 10, letterSpacing: "-.025em" }}>
            {formatBigNumber(TOTAL_RECORDS)}
          </div>
        </div>
        <div className="card card--pad">
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t-mid)" }}>Fontes oficiais</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#7C3AED", marginTop: 10, letterSpacing: "-.025em" }}>
            8
          </div>
        </div>
        <div className="card card--pad">
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t-mid)" }}>Carro-chefe</div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 700,
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                color: "#1D5FE0",
                background: "color-mix(in srgb, #1D5FE0 12%, var(--surface))",
                border: "1px solid color-mix(in srgb, #1D5FE0 25%, transparent)",
              }}
            >
              RFB
            </span>
            Leilões
          </div>
        </div>
      </div>

      {/* Module grid */}
      <div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))",
            gap: 16,
            alignItems: "start",
          }}
        >
          {PRODUCT_MODULES.map((module) => (
            <ModuleCard key={module.id} module={module} selected={module.id === selectedModuleId} />
          ))}
        </div>
      </div>

      {/* Footnote */}
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
        Contagens baseadas nos registros indexados (seed). Ao vivo, os números refletem a última coleta de cada fonte.
        Fontes: RFB (Receita Federal), PNCP (Portal Nacional de Contratações Públicas), IBGE, Câmara dos Deputados, Senado Federal, IBAMA, CNJ, INPI.
      </p>
    </section>
  );
}
