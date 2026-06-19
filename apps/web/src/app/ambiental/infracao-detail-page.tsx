import { Building2, CalendarDays, ChevronLeft, ExternalLink, MapPin, User } from "lucide-react";
import type { IbamaInfracao } from "@fonteia/sources";
import { formatDataInfracao, formatMultaCents } from "../../features/ambiental/ambiental-api";
import { FonteDots } from "../../components/ui";
import { CreateAlertButton } from "../../components/alerts/CreateAlertButton";
import { ReportButton } from "../../components/report/ReportButton";
import type { SavedReport } from "../../features/reports/reports-store";

// ─── Report builder ────────────────────────────────────────────────────────────

const IBAMA_DATASET_URL =
  "https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-auto-de-infracao";

function buildInfracaoReport(infracao: IbamaInfracao): SavedReport {
  const multaFormatada = formatMultaCents(infracao.valorMultaCents);
  const dataFormatada = formatDataInfracao(infracao.data);
  const digits = (infracao.cpfCnpj ?? "").replace(/\D/g, "");
  const isPj = digits.length > 11;

  const fields: SavedReport["fields"] = [
    { label: "Número do auto", value: infracao.id },
    ...(infracao.numProcesso ? [{ label: "Número do processo", value: infracao.numProcesso }] : []),
    { label: "Tipo de infração", value: infracao.tipoInfracao },
    ...(infracao.cpfCnpj ? [{ label: isPj ? "CNPJ" : "CPF", value: infracao.cpfCnpj }] : []),
    ...(infracao.municipio ? [{ label: "Município", value: infracao.municipio }] : []),
    ...(infracao.uf ? [{ label: "UF", value: infracao.uf }] : []),
    ...(infracao.codigoIbge ? [{ label: "Código IBGE do município", value: infracao.codigoIbge }] : []),
    { label: "Valor da multa", value: multaFormatada },
    { label: "Data", value: dataFormatada },
  ];

  const locationParts = [infracao.municipio, infracao.uf].filter(Boolean);
  return {
    id: `ambiental:${infracao.id}`,
    kind: "ambiental",
    kindLabel: "Infração Ambiental",
    title: infracao.infrator || "Infrator não informado",
    ...(locationParts.length > 0 ? { subtitle: locationParts.join(" — ") } : {}),
    fields,
    sources: [{ label: "IBAMA — Dados Abertos (autos de infração)", url: IBAMA_DATASET_URL }],
    createdAt: new Date().toISOString(),
  };
}

// ─── Props ───────────────────────────────────────────────────────────────────

export interface InfracaoDetailPageProps {
  infracao: IbamaInfracao;
  onBack: () => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FONTE_IBAMA = [
  { sigla: "IBAMA", cor: "#2FA84F", nome: "IBAMA — Dados Abertos (autos de infração)" },
];

// ─── Detail row helper ───────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="row"
      style={{
        padding: "10px 0",
        borderBottom: "1px solid var(--border)",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <span className="tiny muted" style={{ minWidth: 180, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ color: "var(--t-hi)", fontSize: 14 }}>{value}</span>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function InfracaoDetailPage({ infracao, onBack }: InfracaoDetailPageProps) {
  const digits = (infracao.cpfCnpj ?? "").replace(/\D/g, "");
  const isPj = digits.length > 11;
  const InfratorIcon = isPj ? Building2 : User;

  const multaFormatada = formatMultaCents(infracao.valorMultaCents);
  const dataFormatada = formatDataInfracao(infracao.data);
  const nomeInfrator = infracao.infrator || "Infrator não informado";
  const report = buildInfracaoReport(infracao);

  return (
    <div
      style={{
        maxWidth: 800,
        margin: "0 auto",
        padding: "0 16px 64px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      {/* Botão Voltar */}
      <div style={{ paddingTop: 24 }}>
        <button
          className="btn btn--ghost"
          onClick={onBack}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <ChevronLeft size={16} />
          Voltar a Ambiental
        </button>
      </div>

      {/* Hero panel */}
      <div className="panel inset" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Eyebrow */}
        <span className="eyebrow" style={{ color: "var(--t-low)" }}>
          Ambiental — IBAMA
        </span>

        {/* UF badge + tipo de infração */}
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className="badge">{infracao.uf}</span>
          <span className="badge badge--neutral">{infracao.tipoInfracao}</span>
        </div>

        {/* Ícone + nome do infrator */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div
            style={{
              marginTop: 4,
              flexShrink: 0,
              color: "var(--t-mid)",
            }}
          >
            <InfratorIcon size={22} />
          </div>
          <h1
            className="h2"
            style={{
              margin: 0,
              color: "var(--t-hi)",
              lineHeight: 1.25,
              wordBreak: "break-word",
            }}
          >
            {nomeInfrator}
          </h1>
        </div>

        {/* Localização */}
        {(infracao.municipio || infracao.uf) && (
          <div
            className="row"
            style={{ gap: 6, color: "var(--t-mid)", fontSize: 14, flexWrap: "wrap" }}
          >
            <MapPin size={14} style={{ flexShrink: 0, color: "var(--t-low)" }} />
            <span>
              {[infracao.municipio, infracao.uf].filter(Boolean).join(" — ")}
            </span>
          </div>
        )}

        {/* Multa em destaque */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span className="tiny muted">Valor da multa</span>
          <span
            className="num"
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: multaFormatada === "—" ? "var(--t-low)" : "var(--t-hi)",
            }}
          >
            {multaFormatada}
          </span>
        </div>

        {/* Data */}
        <div
          className="row"
          style={{ gap: 6, color: "var(--t-mid)", fontSize: 13, flexWrap: "wrap" }}
        >
          <CalendarDays size={14} style={{ flexShrink: 0, color: "var(--t-low)" }} />
          <span>{dataFormatada}</span>
        </div>

        {/* Ações */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 4 }}>
          <CreateAlertButton
            kind="ambiental"
            entityRef={infracao.id}
            entityLabel={`${nomeInfrator} — ${infracao.tipoInfracao}`}
            size="sm"
            variant="soft"
          />
          <ReportButton report={report} />
        </div>
      </div>

      {/* Detalhes do auto */}
      <div className="panel inset" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        <span
          className="eyebrow"
          style={{ color: "var(--t-low)", marginBottom: 8, display: "block" }}
        >
          Detalhes do auto
        </span>

        <DetailRow label="Número do auto" value={infracao.id} />
        {infracao.numProcesso && (
          <DetailRow label="Número do processo" value={infracao.numProcesso} />
        )}
        <DetailRow label="Tipo de infração" value={infracao.tipoInfracao} />
        {infracao.cpfCnpj && (
          <DetailRow label={isPj ? "CNPJ" : "CPF"} value={infracao.cpfCnpj} />
        )}
        {infracao.codigoIbge && (
          <DetailRow label="Código IBGE do município" value={infracao.codigoIbge} />
        )}
      </div>

      {/* Descrição */}
      {infracao.descricao !== "" && (
        <div className="panel inset" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span className="eyebrow" style={{ color: "var(--t-low)" }}>
            Descrição
          </span>
          <p
            style={{
              margin: 0,
              color: "var(--t-mid)",
              fontSize: 14,
              lineHeight: 1.65,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {infracao.descricao}
          </p>
        </div>
      )}

      {/* Fonte */}
      <div className="panel inset" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span className="eyebrow" style={{ color: "var(--t-low)" }}>
          Fonte
        </span>
        <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <FonteDots fontes={FONTE_IBAMA} size={28} />
          <span style={{ color: "var(--t-mid)", fontSize: 13 }}>
            IBAMA — Dados Abertos (autos de infração)
          </span>
        </div>
        <a
          href="https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-auto-de-infracao"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn--ghost"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            alignSelf: "flex-start",
            fontSize: 13,
          }}
        >
          <ExternalLink size={14} />
          Ver dataset no IBAMA
        </a>
      </div>
    </div>
  );
}
