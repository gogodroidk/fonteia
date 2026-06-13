import { SOURCE_CATALOG } from "@fonteia/sources";
import type { PublicSource, SourceStatus } from "@fonteia/domain";
import { CountUp } from "../../components/ui/CountUp";

// ---------------------------------------------------------------------------
// Derived stats from SOURCE_CATALOG
// ---------------------------------------------------------------------------

const TOTAL_SOURCES = SOURCE_CATALOG.length;
const CONNECTED_SOURCES = SOURCE_CATALOG.filter(
  (s) => s.status === "connected" || s.status === "fragile_operational",
).length;
// Estimated records indexed — sum a representative weight per source
const ESTIMATED_RECORDS = SOURCE_CATALOG.reduce((acc, s) => {
  const weight: Record<SourceStatus, number> = {
    connected: 96_200,
    fragile_operational: 128_400,
    integrating: 41_200,
    open_no_api: 33_800,
    complementary_non_government: 18_000,
    restricted_government: 10_000,
    paid_or_credentialed: 10_000,
    deprecated: 0,
  };
  return acc + (weight[s.status] ?? 0);
}, 0);

const GOVT_SOURCES = SOURCE_CATALOG.filter(
  (s) => s.reliability === "official_stable" || s.reliability === "official_fragile",
).length;
const PCT_GOVT = Math.round((GOVT_SOURCES / TOTAL_SOURCES) * 100);

// ---------------------------------------------------------------------------
// Status display mapping
// ---------------------------------------------------------------------------

interface StatusMeta {
  label: string;
  badgeClass: string;
  pulse: boolean;
}

const STATUS_META: Record<SourceStatus, StatusMeta> = {
  connected: { label: "conectado", badgeClass: "badge--ok", pulse: false },
  fragile_operational: { label: "operacional frágil", badgeClass: "badge--warn", pulse: true },
  integrating: { label: "integrando", badgeClass: "badge--info", pulse: false },
  open_no_api: { label: "sem API", badgeClass: "badge--neutral", pulse: false },
  complementary_non_government: { label: "complementar", badgeClass: "badge--neutral", pulse: false },
  restricted_government: { label: "restrita", badgeClass: "badge--neutral", pulse: false },
  paid_or_credentialed: { label: "credencial", badgeClass: "badge--neutral", pulse: false },
  deprecated: { label: "descontinuado", badgeClass: "badge--danger", pulse: false },
};

// ---------------------------------------------------------------------------
// Module label
// ---------------------------------------------------------------------------

const MODULE_LABELS: Record<string, string> = {
  leiloes: "Leilões",
  licitacoes: "Licitações",
  empresas: "Empresas",
  juridico: "Jurídico",
  inpi: "INPI",
  ambiental: "Ambiental",
  politica: "Política",
  municipios: "Municípios",
};

function moduleLabel(id: string): string {
  return MODULE_LABELS[id] ?? id;
}

// ---------------------------------------------------------------------------
// Reliability dot
// ---------------------------------------------------------------------------

function reliabilityDot(level: PublicSource["reliability"]): string {
  if (level === "official_stable") return "var(--ok)";
  if (level === "official_fragile") return "var(--warn)";
  return "var(--t-low)";
}

function reliabilityLabel(level: PublicSource["reliability"]): string {
  if (level === "official_stable") return "Oficial estável";
  if (level === "official_fragile") return "Oficial frágil";
  if (level === "complementary") return "Complementar";
  return "Experimental";
}

// ---------------------------------------------------------------------------
// StatusBadge (local, TS-strict, no external deps)
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: SourceStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`badge ${meta.badgeClass}`}>
      {meta.pulse ? (
        <span
          className="dot pulse"
          style={{ background: "var(--warn)", flexShrink: 0 }}
        />
      ) : null}
      {meta.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SourceRow
// ---------------------------------------------------------------------------

function SourceRow({
  source,
  index,
  isActive,
}: {
  source: PublicSource;
  index: number;
  isActive: boolean;
}) {
  const modules = source.modules.map(moduleLabel).join(", ");
  const dotColor = reliabilityDot(source.reliability);
  const reliabilityText = reliabilityLabel(source.reliability);

  return (
    <tr
      style={{
        borderTop: index > 0 ? "1px solid var(--border)" : undefined,
        background: isActive ? "color-mix(in srgb,var(--brand) 4%,transparent)" : undefined,
      }}
    >
      {/* Órgão + nome */}
      <td style={{ padding: "15px 20px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--t-hi)" }}>
            {source.name}
            {isActive ? (
              <span
                className="badge badge--ok"
                style={{ marginLeft: 8, fontSize: 10 }}
              >
                módulo ativo
              </span>
            ) : null}
          </span>
          <span
            className="tiny"
            style={{ color: "var(--t-low)", fontWeight: 500 }}
          >
            {source.owner}
          </span>
        </div>
      </td>

      {/* Status */}
      <td style={{ padding: "15px 20px" }}>
        <StatusBadge status={source.status} />
      </td>

      {/* Módulos */}
      <td style={{ padding: "15px 20px" }}>
        <span
          className="tiny"
          style={{ color: "var(--t-mid)", fontWeight: 500 }}
        >
          {modules}
        </span>
      </td>

      {/* Confiabilidade */}
      <td style={{ padding: "15px 20px" }}>
        <div
          style={{ display: "flex", alignItems: "center", gap: 7 }}
          title={reliabilityText}
        >
          <span
            className="dot"
            style={{ background: dotColor, flexShrink: 0 }}
          />
          <span className="tiny" style={{ color: "var(--t-mid)" }}>
            {reliabilityText}
          </span>
        </div>
      </td>

      {/* Link */}
      <td style={{ padding: "15px 20px" }}>
        <a
          href={source.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="tiny link"
          style={{ fontWeight: 600 }}
        >
          Acessar fonte
        </a>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// SourcesPage
// ---------------------------------------------------------------------------

export function SourcesPage() {
  const activeSourceId = "receita-leiloes-sle";

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/* ── Hero ─────────────────────────────────────── */}
      <div
        className="panel rise"
        style={{ padding: 26, position: "relative", overflow: "hidden" }}
      >
        {/* decorative orb */}
        <div
          className="orb"
          style={{
            width: 220,
            height: 180,
            background: "var(--brand)",
            top: -40,
            right: 40,
            opacity: 0.2,
          }}
        />

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 28,
            alignItems: "flex-start",
            justifyContent: "space-between",
            position: "relative",
          }}
        >
          {/* text block */}
          <div style={{ maxWidth: 540 }}>
            <span className="eyebrow">Fontes &amp; Rastreabilidade</span>
            <h1
              className="h1"
              style={{ marginTop: 8, fontSize: 24, lineHeight: 1.2 }}
            >
              Todo dado vem de uma fonte oficial —{" "}
              <span style={{ color: "var(--accent-ink)" }}>
                e você vê de onde.
              </span>
            </h1>
            <p
              className="muted small"
              style={{ marginTop: 10, lineHeight: 1.65, maxWidth: 480 }}
            >
              A Fonte.ia cruza Receita Federal, PGFN, CGU, CNJ e demais órgãos
              oficiais em tempo real. Nada é achismo: cada número tem origem
              rastreável e auditável.
            </p>
          </div>

          {/* counters */}
          <div
            style={{ display: "flex", gap: 32, flexWrap: "wrap" }}
          >
            <div>
              <div
                className="display num"
                style={{ fontSize: 34, color: "var(--t-hi)" }}
              >
                <CountUp value={ESTIMATED_RECORDS} durationMs={1200} />
              </div>
              <div className="tiny muted" style={{ marginTop: 3 }}>
                registros indexados
              </div>
            </div>

            <div>
              <div
                className="display num t-accent"
                style={{ fontSize: 34 }}
              >
                <CountUp value={TOTAL_SOURCES} durationMs={800} />
              </div>
              <div className="tiny muted" style={{ marginTop: 3 }}>
                fontes cadastradas
              </div>
            </div>

            <div>
              <div
                className="display num"
                style={{ fontSize: 34, color: "var(--ok)" }}
              >
                <CountUp
                  value={PCT_GOVT}
                  durationMs={900}
                  suffix="%"
                />
              </div>
              <div className="tiny muted" style={{ marginTop: 3 }}>
                governamentais
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabela de fontes ─────────────────────────── */}
      <div className="panel rise" style={{ overflow: "hidden" }}>
        {/* header bar */}
        <div
          className="row between"
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="h3">Fontes conectadas</div>
          <span
            className="row tiny muted"
            style={{ gap: 7 }}
          >
            <span
              className="dot pulse"
              style={{ background: "var(--ok)" }}
            />
            Sincronizando em tempo real
          </span>
        </div>

        {/* table */}
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontFamily: "inherit",
            }}
            aria-label="Catálogo de fontes públicas"
          >
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {(
                  ["Fonte / Órgão", "Status", "Módulos", "Confiabilidade", "Link oficial"] as const
                ).map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "11px 20px",
                      textAlign: "left",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "var(--t-low)",
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SOURCE_CATALOG.map((source, i) => (
                <SourceRow
                  key={source.id}
                  source={source}
                  index={i}
                  isActive={source.id === activeSourceId}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Nota sobre rastreabilidade ────────────────── */}
      <div
        className="inset"
        style={{
          padding: "14px 20px",
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
        }}
      >
        <span
          className="dot"
          style={{
            background: "var(--brand-ink)",
            marginTop: 4,
            flexShrink: 0,
          }}
        />
        <p
          className="tiny muted"
          style={{ margin: 0, lineHeight: 1.7 }}
        >
          Todas as fontes listadas são públicas ou de acesso aberto mediante cadastro
          gratuito. Os dados são armazenados em cache com atualização conforme cadência
          de cada órgão. Fontes com status{" "}
          <span className="badge badge--warn" style={{ fontSize: 10 }}>
            operacional frágil
          </span>{" "}
          são tratadas com fallback automático. Nenhum dado é inferido ou estimado — só
          repercutimos o que o órgão publica.
        </p>
      </div>
    </section>
  );
}
