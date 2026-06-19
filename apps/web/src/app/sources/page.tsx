import { useEffect, useState } from "react";
import { SOURCE_CATALOG } from "@fonteia/sources";
import type { PublicSource, SourceStatus } from "@fonteia/domain";
import { CountUp } from "../../components/ui/CountUp";
import { listLeilaoLots } from "../../features/leiloes/leiloes-api";

// ---------------------------------------------------------------------------
// Status overrides — applied HERE (not in packages/sources) because the
// package is shared domain territory. Only flip when the module truly has
// ingested data confirmed in production (CLAUDE.md § Estado real, 2026-06).
//
// Sources with real data in the platform:
//   leilões        → receita-leiloes-sle  (already fragile_operational / runtime overrides to connected)
//   licitações     → pncp-consulta        (already connected in catalog)
//   empresas       → compras-gov-dados-abertos (already connected)
//   política/câmara → camara-dados-abertos → connected  ← FLIPPED (deputados, CEAP, votações ingeridos)
//   jurídico        → cnj-datajud         → connected  ← FLIPPED (DataJud ingerido)
//   INPI            → inpi-dados-abertos  → connected  ← FLIPPED (29.5k marcas RPI ingeridas)
//   ambiental       → ibama-dados-abertos → connected  ← FLIPPED (IBAMA ambiental ingerido)
//   municípios/IBGE não têm entrada própria no catálogo ainda; outros (Senado,
//   INPE, TSE, ANA, Tesouro, DOU) NÃO têm dados ingeridos — permanecem como estão.
// ---------------------------------------------------------------------------

const STATUS_OVERRIDES: Partial<Record<string, SourceStatus>> = {
  "camara-dados-abertos": "connected",
  "cnj-datajud": "connected",
  "inpi-dados-abertos": "connected",
  "ibama-dados-abertos": "connected",
};

// ---------------------------------------------------------------------------
// Plain-language purpose notes — shown to lay users alongside each source.
// Connected sources: explain what module(s) they power and what data is live.
// Integrating sources: honest one-liner of what they will bring when ready.
// Never claim a source is live if it isn't.
// ---------------------------------------------------------------------------

const SOURCE_PURPOSE: Record<string, string> = {
  // ── Connected / fragile_operational ──────────────────────────────────────
  "receita-leiloes-sle":
    "Alimenta o módulo Leilões — editais oficiais de leilão eletrônico da Receita Federal, com data, lote e valor estimado.",
  "pncp-consulta":
    "Alimenta Licitações e Contratos — aviso de licitação, ata de registro de preço e contrato publicados no Portal Nacional de Contratações Públicas.",
  "compras-gov-dados-abertos":
    "Alimenta Empresas e Licitações — fornecedores do governo federal, itens comprados e preços praticados em pregões e dispensas.",
  "camara-dados-abertos":
    "Alimenta Política — perfil dos 513 deputados federais, despesas parlamentares (CEAP) e votações em plenário, atualizados diariamente.",
  "cnj-datajud":
    "Alimenta Jurídico — metadados de processos judiciais de todos os tribunais brasileiros, incluindo classe, assunto e movimentação.",
  "inpi-dados-abertos":
    "Alimenta INPI — 29,5 mil marcas registradas da Revista da Propriedade Industrial (RPI), consultáveis por CNPJ ou razão social.",
  "ibama-dados-abertos":
    "Alimenta Ambiental — embargos, autos de infração e bases ambientais do IBAMA, cruzados com CNPJ de empresas.",

  // ── Em integração — roadmap honesto ──────────────────────────────────────
  "portal-transparencia-api":
    "Quando integrado: gastos federais por CNPJ e CPF, sanções (CEIS/CNEP) e benefícios pagos — fonte essencial para 'siga o dinheiro'.",
  "senado-dados-abertos":
    "Quando integrado: votações, matérias em tramitação e autores de projetos de lei no Senado Federal.",
  "tse-dados-abertos":
    "Quando integrado: candidaturas, resultado de eleições e doações eleitorais por CPF/CNPJ.",
  "inpe-terrabrasilis":
    "Quando integrado: desmatamento anual (PRODES) e alertas de corte raso (DETER) por município e bioma.",
  "inpe-queimadas":
    "Quando integrado: focos de fogo e risco de incêndio por município, com atualização próxima de tempo real.",
  "mapbiomas-alerta":
    "Fonte complementar: alertas de desmatamento com validação por satélite — usada para enriquecer o módulo Ambiental.",
  "ana-hidrowebservice":
    "Quando integrado: dados hidrológicos oficiais (chuva, nível de rios) — relevante para municípios em zona de risco hídrico.",
  "tesouro-siconfi":
    "Quando integrado: balanço fiscal e contábil de estados e municípios, com série histórica de receitas e despesas.",
  "transferegov-dados-abertos":
    "Quando integrado: convênios, repasses federais e execução de obras por município — complementa o módulo Municípios.",
  "bndes-dados-abertos":
    "Quando integrado: financiamentos do BNDES por empresa e setor, com valores e prazo de carência.",
  "dados-gov-br-ckan":
    "Catálogo federal de dados abertos — usado como fonte auxiliar para conjuntos específicos não cobertos por outras APIs.",
  "dados-prefeitura-sp-ckan":
    "Quando integrado: contratos e empenhos da Prefeitura de São Paulo — piloto do módulo de dados municipais.",
  "dou-inlabs":
    "Quando integrado: publicações do Diário Oficial da União, incluindo licitações, nomeações e atos administrativos.",
};

// ---------------------------------------------------------------------------
// Derived stats — computed AFTER merging overrides so counters are accurate
// ---------------------------------------------------------------------------

const CATALOG_WITH_OVERRIDES = SOURCE_CATALOG.map((s) => ({
  ...s,
  status: (STATUS_OVERRIDES[s.id] ?? s.status) as SourceStatus,
}));

const TOTAL_SOURCES = CATALOG_WITH_OVERRIDES.length;
const CONNECTED_SOURCES = CATALOG_WITH_OVERRIDES.filter(
  (s) => s.status === "connected" || s.status === "fragile_operational",
).length;
const INTEGRATING_SOURCES = CATALOG_WITH_OVERRIDES.filter(
  (s) => s.status === "integrating" || s.status === "open_no_api",
).length;

const GOVT_SOURCES = CATALOG_WITH_OVERRIDES.filter(
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
  integrating: { label: "em integração", badgeClass: "badge--info", pulse: false },
  open_no_api: { label: "sem API pública", badgeClass: "badge--neutral", pulse: false },
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
// Reliability helpers
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
// StatusBadge
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
// BadgesLegend — brief key shown above the catalog table/cards
// ---------------------------------------------------------------------------

function BadgesLegend() {
  const items: Array<{ status: SourceStatus; description: string }> = [
    { status: "connected", description: "dados indexados na plataforma" },
    { status: "fragile_operational", description: "dados indexados, portal sem API oficial" },
    { status: "integrating", description: "previsto no roadmap, ainda não ingerido" },
    { status: "open_no_api", description: "fonte pública, sem API transacional" },
    { status: "complementary_non_government", description: "fonte complementar não governamental" },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "8px 20px",
        padding: "12px 22px",
        borderBottom: "1px solid var(--border)",
        background: "color-mix(in srgb, var(--bg-base) 60%, transparent)",
      }}
      aria-label="Legenda de status"
    >
      {items.map(({ status, description }) => (
        <div
          key={status}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <StatusBadge status={status} />
          <span className="tiny" style={{ color: "var(--t-low)" }}>
            = {description}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SourceRow — table variant (desktop)
// ---------------------------------------------------------------------------

function SourceRow({
  source,
  index,
  isActive,
  runtimeStatus,
  checkLoading,
}: {
  source: PublicSource & { status: SourceStatus };
  index: number;
  isActive: boolean;
  runtimeStatus: SourceStatus | undefined;
  checkLoading: boolean;
}) {
  const effectiveStatus: SourceStatus = runtimeStatus ?? source.status;
  const modules = source.modules.map(moduleLabel).join(", ");
  const dotColor = reliabilityDot(source.reliability);
  const reliabilityText = reliabilityLabel(source.reliability);
  const purpose = SOURCE_PURPOSE[source.id];

  return (
    <tr
      style={{
        borderTop: index > 0 ? "1px solid var(--border)" : undefined,
        background: isActive ? "color-mix(in srgb,var(--brand) 4%,transparent)" : undefined,
      }}
    >
      {/* Órgão + nome + purpose note */}
      <td style={{ padding: "15px 20px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
          {purpose ? (
            <span
              className="tiny"
              style={{ color: "var(--t-mid)", lineHeight: 1.5, maxWidth: 340 }}
            >
              {purpose}
            </span>
          ) : null}
        </div>
      </td>

      {/* Status — runtime override when available, catalog (+ static overrides) otherwise */}
      <td style={{ padding: "15px 20px", verticalAlign: "top", paddingTop: 17 }}>
        {isActive && checkLoading ? (
          <span className="badge badge--neutral" style={{ color: "var(--t-mid)" }}>
            verificando…
          </span>
        ) : (
          <StatusBadge status={effectiveStatus} />
        )}
      </td>

      {/* Módulos */}
      <td style={{ padding: "15px 20px", verticalAlign: "top", paddingTop: 17 }}>
        <span
          className="tiny"
          style={{ color: "var(--t-mid)", fontWeight: 500 }}
        >
          {modules}
        </span>
      </td>

      {/* Confiabilidade */}
      <td style={{ padding: "15px 20px", verticalAlign: "top", paddingTop: 17 }}>
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
      <td style={{ padding: "15px 20px", verticalAlign: "top", paddingTop: 17 }}>
        <a
          href={source.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="tiny link"
          style={{ fontWeight: 600 }}
        >
          Fonte oficial ↗
        </a>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// SourceCard — card variant (mobile / narrow viewport)
// ---------------------------------------------------------------------------

function SourceCard({
  source,
  isActive,
  runtimeStatus,
  checkLoading,
}: {
  source: PublicSource & { status: SourceStatus };
  isActive: boolean;
  runtimeStatus: SourceStatus | undefined;
  checkLoading: boolean;
}) {
  const effectiveStatus: SourceStatus = runtimeStatus ?? source.status;
  const modules = source.modules.map(moduleLabel).join(", ");
  const dotColor = reliabilityDot(source.reliability);
  const reliabilityText = reliabilityLabel(source.reliability);
  const purpose = SOURCE_PURPOSE[source.id];

  return (
    <div
      className="sources-card"
      style={{
        padding: "16px 18px",
        borderBottom: "1px solid var(--border)",
        background: isActive ? "color-mix(in srgb,var(--brand) 4%,transparent)" : undefined,
      }}
    >
      {/* Header row: name + status */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: purpose ? 8 : 10,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--t-hi)",
              lineHeight: 1.3,
              wordBreak: "break-word",
            }}
          >
            {source.name}
            {isActive ? (
              <span
                className="badge badge--ok"
                style={{ marginLeft: 8, fontSize: 10 }}
              >
                módulo ativo
              </span>
            ) : null}
          </div>
          <div
            className="tiny"
            style={{ color: "var(--t-low)", fontWeight: 500, marginTop: 2 }}
          >
            {source.owner}
          </div>
        </div>

        {/* Status badge */}
        <div style={{ flexShrink: 0 }}>
          {isActive && checkLoading ? (
            <span className="badge badge--neutral" style={{ color: "var(--t-mid)" }}>
              verificando…
            </span>
          ) : (
            <StatusBadge status={effectiveStatus} />
          )}
        </div>
      </div>

      {/* Purpose note */}
      {purpose ? (
        <p
          className="tiny"
          style={{
            color: "var(--t-mid)",
            lineHeight: 1.55,
            margin: "0 0 10px",
          }}
        >
          {purpose}
        </p>
      ) : null}

      {/* Meta row: modules + reliability + link */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "8px 20px",
          alignItems: "center",
        }}
      >
        <span className="tiny" style={{ color: "var(--t-mid)", fontWeight: 500 }}>
          {modules}
        </span>

        <div
          style={{ display: "flex", alignItems: "center", gap: 5 }}
          title={reliabilityText}
        >
          <span className="dot" style={{ background: dotColor, flexShrink: 0 }} />
          <span className="tiny" style={{ color: "var(--t-mid)" }}>
            {reliabilityText}
          </span>
        </div>

        <a
          href={source.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="tiny link"
          style={{ fontWeight: 600, marginLeft: "auto" }}
        >
          Fonte oficial ↗
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SourcesPage
// ---------------------------------------------------------------------------

export function SourcesPage() {
  const activeSourceId = "receita-leiloes-sle";

  // Runtime health-check: call listLeilaoLots() once on mount. If it returns
  // dados reais (source !== "empty"), promovemos a Receita para "conectado".
  //
  // IMPORTANTE: "empty" (a coleta rodou mas não há lote AGORA) e uma falha de
  // rede NÃO significam que a fonte oficial foi descontinuada. Marcar a Receita
  // como "descontinuado" nesses casos destrói a credibilidade do produto. Por
  // isso, sem dados, mantemos o status estático do catálogo ("operacional
  // frágil"), em vez de aplicar um override enganoso. As demais fontes mantêm o
  // status estático ou os overrides declarados em STATUS_OVERRIDES acima.
  const [runtimeStatus, setRuntimeStatus] = useState<Record<string, SourceStatus>>({});
  const [checkLoading, setCheckLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setCheckLoading(true);

    listLeilaoLots()
      .then((result) => {
        if (cancelled) return;
        // Só fazemos override quando há dados confirmados; sem lotes no momento,
        // o status estático ("operacional frágil") já é honesto.
        if (result.source !== "empty") {
          setRuntimeStatus({ [activeSourceId]: "connected" });
        }
      })
      .catch(() => {
        // Falha transitória de rede não é "descontinuado": preservamos o
        // status estático do catálogo.
      })
      .finally(() => {
        if (!cancelled) setCheckLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      {/*
        Scoped responsive styles for this page only.
        - .sources-table-wrap: desktop = normal table; mobile = hidden (cards shown instead)
        - .sources-cards-wrap: mobile = shown; desktop = hidden
        Breakpoint 640px matches the point where a 5-column table gets cramped.
      */}
      <style>{`
        .sources-table-wrap { display: block; }
        .sources-cards-wrap { display: none; }
        @media (max-width: 640px) {
          .sources-table-wrap { display: none; }
          .sources-cards-wrap { display: block; }
        }
        /* On narrow viewports where table is still shown (641px–768px),
           ensure horizontal scroll is obvious with a fade hint. */
        @media (min-width: 641px) and (max-width: 900px) {
          .sources-table-scroll {
            -webkit-mask-image: linear-gradient(90deg, #000 80%, transparent 100%);
            mask-image: linear-gradient(90deg, #000 80%, transparent 100%);
          }
        }
        /* Last row in card list has no bottom border (panel clips it) */
        .sources-card:last-child {
          border-bottom: none;
        }
        /* Reduced-motion: disable CountUp animation */
        @media (prefers-reduced-motion: reduce) {
          .sources-card, .panel { animation: none !important; transition: none !important; }
        }
      `}</style>

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
            <span className="eyebrow">Fontes e Rastreabilidade</span>
            <h1
              className="h1"
              style={{ marginTop: 8, fontSize: 24, lineHeight: 1.2 }}
            >
              {CONNECTED_SOURCES} fontes conectadas —{" "}
              <span style={{ color: "var(--accent-ink)" }}>
                cada número aponta à origem oficial.
              </span>
            </h1>
            <p
              className="muted small"
              style={{ marginTop: 10, lineHeight: 1.65, maxWidth: 480 }}
            >
              Todo dado exibido na plataforma vem de uma fonte pública oficial e carrega
              link, data e identificador rastreável — você pode verificar diretamente no
              órgão. Mais {INTEGRATING_SOURCES} fontes estão em integração e serão
              ativadas conforme novos módulos forem ao ar.
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
                <CountUp value={CONNECTED_SOURCES} durationMs={800} />
              </div>
              <div className="tiny muted" style={{ marginTop: 3 }}>
                {CONNECTED_SOURCES === 1 ? "fonte conectada" : "fontes conectadas"}
              </div>
            </div>

            <div>
              <div
                className="display num"
                style={{ fontSize: 34, color: "var(--brand-ink)" }}
              >
                <CountUp value={INTEGRATING_SOURCES} durationMs={800} />
              </div>
              <div className="tiny muted" style={{ marginTop: 3 }}>
                em integração
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

      {/* ── Fontes cadastradas ────────────────────────── */}
      <div className="panel rise" style={{ overflow: "hidden" }}>
        {/* header bar */}
        <div
          className="row between"
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <div className="h3">Fontes cadastradas</div>
            <div className="tiny muted" style={{ marginTop: 3 }}>
              {CONNECTED_SOURCES} ativas · {INTEGRATING_SOURCES} em integração · {TOTAL_SOURCES} total
            </div>
          </div>
          <span
            className="row tiny muted"
            style={{ gap: 7 }}
          >
            <span
              className="dot"
              style={{ background: "var(--warn)" }}
            />
            Coleta periódica
          </span>
        </div>

        {/* Badges legend */}
        <BadgesLegend />

        {/* ── DESKTOP: scrollable table ─────────────────── */}
        <div className="sources-table-wrap">
          <div
            className="sources-table-scroll"
            style={{ overflowX: "auto" }}
          >
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
                {CATALOG_WITH_OVERRIDES.map((source, i) => (
                  <SourceRow
                    key={source.id}
                    source={source}
                    index={i}
                    isActive={source.id === activeSourceId}
                    runtimeStatus={runtimeStatus[source.id]}
                    checkLoading={checkLoading}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── MOBILE: stacked cards ─────────────────────── */}
        <div className="sources-cards-wrap" aria-label="Catálogo de fontes públicas">
          {CATALOG_WITH_OVERRIDES.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              isActive={source.id === activeSourceId}
              runtimeStatus={runtimeStatus[source.id]}
              checkLoading={checkLoading}
            />
          ))}
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
          Todas as fontes listadas são públicas ou de acesso aberto. Cada registro exibido
          na plataforma carrega link direto à publicação original, data de extração e hash
          de verificação — você pode conferir na fonte oficial a qualquer momento. Fontes
          marcadas como{" "}
          <span className="badge badge--warn" style={{ fontSize: 10 }}>
            operacional frágil
          </span>{" "}
          dependem de scraping de portais sem API documentada e podem apresentar
          instabilidade pontual. Fontes{" "}
          <span className="badge badge--info" style={{ fontSize: 10 }}>
            em integração
          </span>{" "}
          fazem parte do roadmap e ainda não têm dados indexados — nunca exibimos
          informação de uma fonte que não esteja ativa. Nenhum dado é estimado ou
          gerado por IA; só publicamos o que o órgão divulga.
        </p>
      </div>
    </section>
  );
}
