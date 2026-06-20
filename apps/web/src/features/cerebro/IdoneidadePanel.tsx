/**
 * IdoneidadePanel.tsx — Painel de compliance/idoneidade no Cérebro.
 *
 * Exibe o resultado das 7 consultas de compliance via InfoSimples para uma empresa
 * selecionada no grafo de conhecimento. Renderizado fora do canvas, abaixo do grafo,
 * no mesmo estilo do UBOPanel.
 *
 * Todos os estilos são inline (sem novas classes globais no design system).
 * Mobile-first, acessível (aria-live, aria-label, role="region").
 */

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Info,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  X,
  XCircle,
} from "lucide-react";
import {
  computarSelo,
  type IdoneidadeCardState,
  type IdoneidadeSelo,
} from "./idoneidade";

// ─── Kinds de sanção (highlight vermelho nos itens quando irregular) ──────────

const SANCAO_KINDS = new Set<string>([
  "transparencia-ceis",
  "transparencia-cnep",
  "tcu-inidoneo",
  "mte-trabalho-escravo",
]);

// ─── Helpers de status ────────────────────────────────────────────────────────

type CertidaoStatus = "regular" | "irregular" | "atencao" | "indisponivel";

function statusColor(status: CertidaoStatus): string {
  switch (status) {
    case "regular":
      return "var(--ok)";
    case "irregular":
      return "var(--danger)";
    case "atencao":
      return "var(--warn)";
    default:
      return "var(--t-low)";
  }
}

function statusBgColor(status: CertidaoStatus): string {
  switch (status) {
    case "regular":
      return "color-mix(in srgb,var(--ok) 10%,var(--surface))";
    case "irregular":
      return "color-mix(in srgb,var(--danger) 8%,var(--surface))";
    case "atencao":
      return "color-mix(in srgb,var(--warn) 8%,var(--surface))";
    default:
      return "var(--surface-2)";
  }
}

function statusBorderColor(status: CertidaoStatus): string {
  switch (status) {
    case "regular":
      return "color-mix(in srgb,var(--ok) 25%,transparent)";
    case "irregular":
      return "color-mix(in srgb,var(--danger) 28%,transparent)";
    case "atencao":
      return "color-mix(in srgb,var(--warn) 28%,transparent)";
    default:
      return "var(--border)";
  }
}

function statusLabel(status: CertidaoStatus): string {
  switch (status) {
    case "regular":
      return "Regular";
    case "irregular":
      return "Irregular";
    case "atencao":
      return "Atenção";
    case "indisponivel":
      return "Indisponível";
  }
}

function seloColor(selo: IdoneidadeSelo): string {
  switch (selo) {
    case "irregular":
      return "#EF4444";
    case "atencao":
      return "#F59E0B";
    case "regular":
      return "#10B981";
    default:
      return "#94A3B8";
  }
}

function seloLabel(selo: IdoneidadeSelo): string {
  switch (selo) {
    case "irregular":
      return "Irregular";
    case "atencao":
      return "Atenção";
    case "regular":
      return "Regular";
    default:
      return "Indisponível";
  }
}

// ─── Card individual ──────────────────────────────────────────────────────────

function IdoneidadeCard({ card }: { card: IdoneidadeCardState }) {
  const [open, setOpen] = useState(false);
  const { kind, label, result } = card;

  // Estado: dormant — InfoSimples não configurado
  if (result.state === "dormant") {
    return (
      <div
        style={{
          padding: "12px 16px",
          background: "var(--surface-2)",
          borderRadius: "var(--r-md)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 9,
          opacity: 0.65,
        }}
        role="status"
        aria-label={`${label}: consulta premium indisponível`}
      >
        <Info size={13} aria-hidden="true" style={{ color: "var(--t-low)", flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, color: "var(--t-low)" }}>
          {label} — consulta premium indisponível
        </span>
      </div>
    );
  }

  // Estado: login necessário
  if (result.state === "login") {
    return (
      <div
        style={{
          padding: "12px 16px",
          background: "var(--surface-2)",
          borderRadius: "var(--r-md)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
        role="status"
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Lock size={13} aria-hidden="true" style={{ color: "var(--t-low)", flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: "var(--t-mid)" }}>{label}</span>
        </div>
        <a href="/auth/login" className="btn btn--ghost btn--sm" style={{ fontSize: 11.5 }}>
          Entrar para consultar
        </a>
      </div>
    );
  }

  // Estado: plano insuficiente
  if (result.state === "plan") {
    return (
      <div
        style={{
          padding: "12px 16px",
          background: "var(--surface-2)",
          borderRadius: "var(--r-md)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
        role="status"
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Lock size={13} aria-hidden="true" style={{ color: "var(--brand-ink)", flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: "var(--t-mid)" }}>{label}</span>
        </div>
        <span style={{ fontSize: 11.5, color: "var(--t-low)", fontStyle: "italic" }}>
          Recurso do plano pago
        </span>
      </div>
    );
  }

  // Estado: vazio ou erro isolado
  if (result.state === "empty" || result.state === "error") {
    return (
      <div
        style={{
          padding: "12px 16px",
          background: "var(--surface-2)",
          borderRadius: "var(--r-md)",
          border: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 9,
          flexWrap: "wrap",
        }}
        role="status"
        aria-label={`${label}: indisponível`}
      >
        <AlertTriangle size={13} aria-hidden="true" style={{ color: "var(--warn)", flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, color: "var(--t-mid)" }}>{label}</span>
        <span style={{ fontSize: 11.5, color: "var(--t-low)", fontStyle: "italic", flex: 1 }}>
          {result.message}
        </span>
      </div>
    );
  }

  // Estado: ok — dados disponíveis
  const { data } = result;
  const status = data.status as CertidaoStatus;
  const { titulo, resumo, itens, validade, numeroCertidao, fonteUrl } = data;
  const color = statusColor(status);
  const isSancao = SANCAO_KINDS.has(kind);
  const hasItens = itens.length > 0;

  const StatusIcon =
    status === "regular"
      ? CheckCircle2
      : status === "irregular"
        ? XCircle
        : status === "atencao"
          ? ShieldAlert
          : Info;

  const cardId = `idoneidade-card-${kind}`;
  const itensId = `idoneidade-itens-${kind}`;

  return (
    <div
      style={{
        borderRadius: "var(--r-md)",
        border: `1px solid ${statusBorderColor(status)}`,
        background: statusBgColor(status),
        overflow: "hidden",
      }}
      role="region"
      aria-labelledby={cardId}
    >
      {/* Cabeçalho do card */}
      <div style={{ padding: "12px 16px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              id={cardId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 3,
                flexWrap: "wrap",
              }}
            >
              <StatusIcon size={13} aria-hidden="true" style={{ color, flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--t-hi)", lineHeight: 1.3 }}>
                {titulo !== "" ? titulo : label}
              </span>
            </div>

            {titulo !== "" && titulo !== label && (
              <div style={{ fontSize: 11, color: "var(--t-low)", marginBottom: 3, letterSpacing: ".02em" }}>
                {label}
              </div>
            )}

            {resumo !== "" && (
              <p style={{ margin: 0, fontSize: 12, color: "var(--t-mid)", lineHeight: 1.5 }}>
                {resumo}
              </p>
            )}
          </div>

          {/* Selo de status */}
          <div
            style={{
              padding: "2px 8px",
              borderRadius: "var(--r-pill)",
              background: color,
              color: "#fff",
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: ".04em",
              textTransform: "uppercase",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
            aria-label={`Status: ${statusLabel(status)}`}
          >
            {statusLabel(status)}
          </div>
        </div>

        {/* Metadados: validade / número */}
        {(validade !== undefined || numeroCertidao !== undefined) && (
          <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
            {numeroCertidao !== undefined && (
              <span style={{ fontSize: 11.5, color: "var(--t-low)" }}>
                N° <strong style={{ color: "var(--t-mid)", fontWeight: 600 }}>{numeroCertidao}</strong>
              </span>
            )}
            {validade !== undefined && (
              <span style={{ fontSize: 11.5, color: "var(--t-low)" }}>
                Válida até <strong style={{ color: "var(--t-mid)", fontWeight: 600 }}>{validade}</strong>
              </span>
            )}
          </div>
        )}

        {/* Ações: expandir itens + fonte oficial */}
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {hasItens && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls={itensId}
              style={{ fontSize: 11.5 }}
            >
              {open ? (
                <ChevronDown size={12} aria-hidden="true" />
              ) : (
                <ChevronRight size={12} aria-hidden="true" />
              )}
              {open
                ? "Ocultar detalhes"
                : `Ver ${itens.length} detalhe${itens.length !== 1 ? "s" : ""}`}
            </button>
          )}
          {fonteUrl !== undefined && (
            <a
              href={fonteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn--ghost btn--sm"
              aria-label={`Ver fonte oficial de ${titulo !== "" ? titulo : label}`}
              style={{ fontSize: 11.5 }}
            >
              <ExternalLink size={11} aria-hidden="true" />
              Fonte oficial
            </a>
          )}
        </div>
      </div>

      {/* Itens expandíveis */}
      {open && hasItens && (
        <div
          id={itensId}
          style={{
            padding: "10px 16px 12px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
          role="list"
          aria-label={`Detalhes de ${titulo !== "" ? titulo : label}`}
        >
          {itens.map((item, idx) => (
            <div
              key={`${item.rotulo}-${idx}`}
              role="listitem"
              style={{
                display: "flex",
                gap: 10,
                fontSize: 12,
                lineHeight: 1.45,
                padding: "4px 0",
                borderTop: idx > 0 ? "1px solid var(--border)" : undefined,
                ...(isSancao && status !== "regular"
                  ? {
                      background: "color-mix(in srgb,var(--danger) 5%,transparent)",
                      borderRadius: "var(--r-sm)",
                      padding: "5px 7px",
                    }
                  : {}),
              }}
            >
              <span
                style={{
                  fontWeight: 700,
                  color:
                    isSancao && status !== "regular"
                      ? "var(--danger)"
                      : "var(--t-low)",
                  fontSize: 10.5,
                  letterSpacing: ".04em",
                  textTransform: "uppercase",
                  minWidth: 110,
                  flexShrink: 0,
                  paddingTop: 1,
                }}
              >
                {item.rotulo}
              </span>
              <span
                style={{
                  color: "var(--t-hi)",
                  wordBreak: "break-word",
                  fontWeight: isSancao && status !== "regular" ? 600 : 400,
                }}
              >
                {item.valor !== "" ? item.valor : "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Rodapé de rastreabilidade */}
      <div
        style={{
          padding: "6px 16px",
          borderTop: "1px solid var(--border)",
          fontSize: 10.5,
          color: "var(--t-low)",
          background: "var(--surface-2)",
        }}
      >
        Consultado via InfoSimples
        {fonteUrl !== undefined && (
          <>
            {" · "}
            <a
              href={fonteUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--brand-ink)", textDecoration: "none", wordBreak: "break-all" }}
            >
              {fonteUrl}
            </a>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Semáforo (header do painel) ─────────────────────────────────────────────

function SeloHeader({ cards }: { cards: IdoneidadeCardState[] }) {
  const selo = computarSelo(cards);
  const color = seloColor(selo);
  const label = seloLabel(selo);

  const okCards = cards.filter((c) => c.result.state === "ok");
  const regulares = okCards.filter(
    (c) => c.result.state === "ok" && c.result.data.status === "regular",
  ).length;
  const irregulares = okCards.filter(
    (c) => c.result.state === "ok" && c.result.data.status === "irregular",
  ).length;
  const atencao = okCards.filter(
    (c) => c.result.state === "ok" && c.result.data.status === "atencao",
  ).length;

  const SeloIcon =
    selo === "regular"
      ? ShieldCheck
      : selo === "irregular"
        ? ShieldOff
        : selo === "atencao"
          ? ShieldAlert
          : Info;

  const parts: string[] = [];
  if (regulares > 0) parts.push(`${regulares} regular${regulares !== 1 ? "es" : ""}`);
  if (atencao > 0) parts.push(`${atencao} pendência${atencao !== 1 ? "s" : ""}`);
  if (irregulares > 0) parts.push(`${irregulares} irregular${irregulares !== 1 ? "es" : ""}`);
  const unavailable = cards.length - okCards.length;
  if (unavailable > 0) parts.push(`${unavailable} indisponível${unavailable !== 1 ? "is" : ""}`);
  const summary = parts.join(", ");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 16px",
        borderRadius: "var(--r-lg)",
        border: `1px solid ${color}44`,
        background:
          selo === "irregular"
            ? "color-mix(in srgb,var(--danger) 8%,var(--surface))"
            : selo === "atencao"
              ? "color-mix(in srgb,var(--warn) 8%,var(--surface))"
              : selo === "regular"
                ? "color-mix(in srgb,var(--ok) 10%,var(--surface))"
                : "var(--surface-2)",
        flexWrap: "wrap",
      }}
      aria-label={`Semáforo de idoneidade: ${label}`}
    >
      <div
        aria-hidden="true"
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <SeloIcon size={20} style={{ color: "#fff" }} aria-hidden="true" />
      </div>

      <div style={{ flex: 1, minWidth: 140 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 800,
            color,
            letterSpacing: "-.02em",
            lineHeight: 1.2,
            marginBottom: 2,
          }}
        >
          {label}
        </div>
        {summary !== "" && (
          <div style={{ fontSize: 12, color: "var(--t-mid)", lineHeight: 1.4 }}>
            {summary}
          </div>
        )}
      </div>

      {/* Pílulas de contagem */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {regulares > 0 && (
          <span
            style={{
              padding: "2px 8px",
              borderRadius: "var(--r-pill)",
              background: "color-mix(in srgb,var(--ok) 15%,transparent)",
              color: "var(--ok)",
              fontSize: 11,
              fontWeight: 700,
              border: "1px solid color-mix(in srgb,var(--ok) 30%,transparent)",
            }}
          >
            {regulares} regular{regulares !== 1 ? "es" : ""}
          </span>
        )}
        {atencao > 0 && (
          <span
            style={{
              padding: "2px 8px",
              borderRadius: "var(--r-pill)",
              background: "color-mix(in srgb,var(--warn) 15%,transparent)",
              color: "var(--warn)",
              fontSize: 11,
              fontWeight: 700,
              border: "1px solid color-mix(in srgb,var(--warn) 30%,transparent)",
            }}
          >
            {atencao} pendência{atencao !== 1 ? "s" : ""}
          </span>
        )}
        {irregulares > 0 && (
          <span
            style={{
              padding: "2px 8px",
              borderRadius: "var(--r-pill)",
              background: "color-mix(in srgb,var(--danger) 15%,transparent)",
              color: "var(--danger)",
              fontSize: 11,
              fontWeight: 700,
              border: "1px solid color-mix(in srgb,var(--danger) 30%,transparent)",
            }}
          >
            {irregulares} irregular{irregulares !== 1 ? "es" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Props do painel ─────────────────────────────────────────────────────────

export interface IdoneidadePanelProps {
  cnpj: string;
  empresaNome: string;
  cards: IdoneidadeCardState[];
  loading: boolean;
  onClose: () => void;
}

// ─── Componente principal ─────────────────────────────────────────────────────

/**
 * IdoneidadePanel — Painel de compliance/idoneidade para o Cérebro.
 *
 * Exibido abaixo do grafo ao clicar "Verificar idoneidade" no painel de detalhes.
 * Mostra o semáforo consolidado + 7 cards individuais (um por kind de compliance).
 */
export function IdoneidadePanel({
  cnpj,
  empresaNome,
  cards,
  loading,
  onClose,
}: IdoneidadePanelProps) {
  const hasData = !loading && cards.length > 0;

  return (
    <div
      className="panel"
      role="region"
      aria-label="Idoneidade e compliance da empresa"
      style={{ padding: "16px 20px" }}
    >
      {/* Cabeçalho */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <ShieldAlert size={16} style={{ color: "var(--brand-ink)", flexShrink: 0 }} aria-hidden="true" />
            <span style={{ fontWeight: 800, fontSize: 15, color: "var(--t-hi)" }}>
              Idoneidade / Compliance
            </span>
          </div>
          <p className="small muted" style={{ margin: 0 }}>
            Verificação automática de sanções, inidoneidade, dívida ativa e débitos
            trabalhistas para{" "}
            <strong style={{ color: "var(--t-hi)" }}>{empresaNome !== "" ? empresaNome : cnpj}</strong>
            {cnpj !== "" && empresaNome !== "" && (
              <> ({cnpj})</>
            )}
            .
          </p>
        </div>
        <button
          className="btn btn--icon btn--ghost btn--sm"
          type="button"
          onClick={onClose}
          aria-label="Fechar painel de idoneidade"
          style={{ flexShrink: 0, marginTop: 2 }}
        >
          <X size={15} aria-hidden="true" />
        </button>
      </div>

      {/* Estado de carregamento */}
      {loading && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "20px 0",
            color: "var(--t-mid)",
          }}
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 size={20} className="spin" aria-hidden="true" />
          <span className="small">
            Consultando 7 bases de compliance em paralelo… (pode levar alguns segundos)
          </span>
        </div>
      )}

      {/* Dados carregados */}
      {hasData && (
        <div
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
          aria-live="polite"
        >
          {/* Semáforo consolidado */}
          <SeloHeader cards={cards} />

          {/* Cards individuais por kind */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: 8 }}
            role="list"
            aria-label="Resultados por órgão"
          >
            {cards.map((card) => (
              <div key={card.kind} role="listitem">
                <IdoneidadeCard card={card} />
              </div>
            ))}
          </div>

          {/* Aviso de rastreabilidade / disclaimer */}
          <div
            style={{
              fontSize: 11,
              color: "var(--t-low)",
              lineHeight: 1.5,
              padding: "8px 12px",
              background: "var(--surface-2)",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--border)",
            }}
          >
            Esta consulta usa o cache de 60 dias do proxy InfoSimples. Verifique sempre
            na fonte oficial antes de tomar decisões.
          </div>
        </div>
      )}

      {/* Estado: carregado mas sem cards (erro total) */}
      {!loading && cards.length === 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "14px 0",
            color: "var(--t-mid)",
          }}
          role="status"
        >
          <AlertTriangle size={15} aria-hidden="true" style={{ color: "var(--warn)", flexShrink: 0 }} />
          <span className="small">
            Não foi possível obter os dados de compliance. Tente novamente mais tarde.
          </span>
        </div>
      )}
    </div>
  );
}

export default IdoneidadePanel;
