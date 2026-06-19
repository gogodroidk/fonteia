import { ChevronLeft, ExternalLink, Gavel, MapPin } from "lucide-react";
import { FonteDots } from "../../components/ui";
import type { MunicipioWithStats } from "../../features/municipios/municipios-api";
import { CreateAlertButton } from "../../components/alerts/CreateAlertButton";
import { ReportButton } from "../../components/report/ReportButton";
import type { SavedReport } from "../../features/reports/reports-store";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface MunicipioDetailPageProps {
  municipio: MunicipioWithStats;
  onBack: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FONTE_IBGE = [{ sigla: "IBGE", cor: "#0FB7A0", nome: "IBGE — Localidades" }];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildIbgeUrl(uf: string, nome: string): string {
  const ufSlug = uf.toLowerCase();
  const nomeSlug = nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "-")
    .replace(/[^\w-]/g, "");
  return `https://www.ibge.gov.br/cidades-e-estados/${ufSlug}/${nomeSlug}.html`;
}

// ─── Row item: label + value ──────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="row between"
      style={{
        gap: 12,
        paddingTop: 10,
        paddingBottom: 10,
        borderBottom: "1px solid var(--border)",
        alignItems: "flex-start",
        flexWrap: "wrap",
      }}
    >
      <span className="tiny" style={{ color: "var(--t-low)", fontWeight: 600, flexShrink: 0 }}>
        {label}
      </span>
      <span
        className="tiny num"
        style={{ color: "var(--t-hi)", fontWeight: 700, textAlign: "right", wordBreak: "break-word" }}
      >
        {value || "—"}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function buildMunicipioReport(municipio: MunicipioWithStats, ibgeUrl: string): SavedReport {
  const fields: SavedReport["fields"] = [
    { label: "Código IBGE", value: municipio.codigoIbge },
    ...(municipio.uf || municipio.ufNome
      ? [{ label: "UF", value: [municipio.uf, municipio.ufNome].filter(Boolean).join(" — ") }]
      : []),
    ...(municipio.regiao ? [{ label: "Região", value: municipio.regiao }] : []),
    ...(municipio.mesorregiao ? [{ label: "Mesorregião", value: municipio.mesorregiao }] : []),
    ...(municipio.microrregiao ? [{ label: "Microrregião", value: municipio.microrregiao }] : []),
    { label: "Licitações registradas", value: String(municipio.licitacoesCount) },
  ];
  return {
    id: `municipio:${municipio.codigoIbge}`,
    kind: "municipio",
    kindLabel: "Município",
    title: municipio.nome,
    subtitle: municipio.uf ? `${municipio.uf}${municipio.ufNome ? ` — ${municipio.ufNome}` : ""}` : undefined,
    fields,
    sources: [{ label: "IBGE — Localidades", url: ibgeUrl }],
    createdAt: new Date().toISOString(),
  };
}

export function MunicipioDetailPage({ municipio, onBack }: MunicipioDetailPageProps) {
  const ibgeUrl = buildIbgeUrl(municipio.uf, municipio.nome);
  const temLicitacoes = municipio.licitacoesCount > 0;
  const report = buildMunicipioReport(municipio, ibgeUrl);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 800 }}>
      {/* Voltar */}
      <button
        className="btn btn--ghost btn--sm"
        type="button"
        onClick={onBack}
        style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        <ChevronLeft size={16} aria-hidden="true" /> Voltar a Municípios
      </button>

      {/* Hero */}
      <div className="panel" style={{ padding: "24px 28px" }}>
        <span className="eyebrow">Municípios do Brasil</span>
        <div
          style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}
        >
          <span className="badge badge--neutral">{municipio.uf}</span>
          <span className="tiny muted">{municipio.ufNome}</span>
        </div>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 800,
            margin: "10px 0 0",
            color: "var(--t-hi)",
            lineHeight: 1.2,
          }}
        >
          {municipio.nome}
        </h1>
        {municipio.regiao && (
          <div
            className="tiny muted"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10 }}
          >
            <MapPin size={13} aria-hidden="true" />
            {municipio.regiao}
          </div>
        )}

        {/* Ações */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
          <CreateAlertButton
            kind="municipio"
            entityRef={municipio.codigoIbge}
            entityLabel={`${municipio.nome}/${municipio.uf}`}
            size="sm"
            variant="soft"
          />
          <ReportButton report={report} />
        </div>
      </div>

      {/* Identificação */}
      <div className="panel" style={{ padding: "20px 24px" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--t-low)",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            marginBottom: 4,
          }}
        >
          Identificação
        </div>
        <InfoRow label="Código IBGE" value={municipio.codigoIbge} />
        <InfoRow
          label="UF"
          value={
            municipio.uf && municipio.ufNome
              ? `${municipio.uf} — ${municipio.ufNome}`
              : municipio.uf || municipio.ufNome || "—"
          }
        />
        <InfoRow label="Região" value={municipio.regiao} />
        <InfoRow label="Mesorregião" value={municipio.mesorregiao} />
        <div
          className="row between"
          style={{
            gap: 12,
            paddingTop: 10,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <span className="tiny" style={{ color: "var(--t-low)", fontWeight: 600, flexShrink: 0 }}>
            Microrregião
          </span>
          <span
            className="tiny num"
            style={{ color: "var(--t-hi)", fontWeight: 700, textAlign: "right", wordBreak: "break-word" }}
          >
            {municipio.microrregiao || "—"}
          </span>
        </div>
      </div>

      {/* Licitações */}
      <div className="panel" style={{ padding: "20px 24px" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--t-low)",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            marginBottom: 16,
          }}
        >
          Licitações
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "var(--r-xl)",
              background: temLicitacoes
                ? "color-mix(in srgb, var(--brand-ink) 12%, var(--surface))"
                : "var(--surface-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Gavel
              size={18}
              aria-hidden="true"
              style={{ color: temLicitacoes ? "var(--brand-ink)" : "var(--t-low)" }}
            />
          </div>
          <div>
            <div
              className="num"
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: "var(--t-hi)",
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {municipio.licitacoesCount}
            </div>
            <div className="tiny muted" style={{ marginTop: 3 }}>
              {municipio.licitacoesCount === 1 ? "licitação registrada" : "licitações registradas"}
            </div>
          </div>
        </div>
        {municipio.licitacoesCount === 0 && (
          <p
            className="tiny muted"
            style={{ margin: "14px 0 0", lineHeight: 1.6 }}
          >
            Nenhuma licitação foi encontrada para este município no PNCP até o momento. Os dados são
            atualizados periodicamente — verifique novamente em breve.
          </p>
        )}
      </div>

      {/* Fonte */}
      <div className="panel" style={{ padding: "20px 24px" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--t-low)",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            marginBottom: 16,
          }}
        >
          Fonte
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <FonteDots fontes={FONTE_IBGE} size={32} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--t-hi)" }}>
              IBGE — Localidades
            </div>
            <div className="tiny muted" style={{ marginTop: 2 }}>
              Instituto Brasileiro de Geografia e Estatística
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <a
            href={ibgeUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 600,
              color: "var(--brand-ink)",
              textDecoration: "none",
            }}
          >
            <ExternalLink size={14} aria-hidden="true" />
            Ver na fonte oficial
          </a>
        </div>
      </div>
    </div>
  );
}
