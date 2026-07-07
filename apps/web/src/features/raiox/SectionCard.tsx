/**
 * SectionCard.tsx — uma seção do Raio-X 360° (Sanções, Contratos, Licitações, ...).
 *
 * Cada seção mostra: título + total + até 20 itens (cards compactos) + link
 * "fonte oficial" + data de coleta. Três estados visuais DISTINTOS além do "ok":
 *   - vazio                 → "Nada consta — consultado em {data}"
 *   - evidencia_insuficiente → "Fonte não cobre este dado"
 *   - erro (seção ausente)   → mensagem de erro discreta, não quebra a página
 *
 * Gate visual: no plano free, o servidor já manda no máximo 3 itens mesmo que
 * `total` seja maior — aqui só detectamos essa diferença (`total > items.length`)
 * para mostrar o banner de upgrade. Nunca cortamos itens no cliente.
 */

import { ExternalLink, CircleOff, FileQuestion, AlertCircle, Lock } from "lucide-react";
import { forwardRef } from "react";
import type { DossieSection, DossieSectionItem } from "./types";
import { formatCollectedAt, pick, formatBRL, formatDatePt, sumMoneyField } from "./format";

/** Renderiza um item de seção de forma genérica: rótulo principal + sublabel + data/valor. */
function ItemCard({ item }: { item: DossieSectionItem }) {
  const title =
    pick(item, "orgao", "marca", "deputadoNome", "tipoInfracao", "objeto", "titulo", "descricao") ||
    "Registro";
  const sub = pick(item, "objeto", "tipoSancao", "situacao", "modalidade", "orgaoSancionador");
  const valor = formatBRL(
    item["valorGlobal"] ?? item["valorMulta"] ?? item["valorRepasse"] ?? item["valorTotal"] ?? item["valorLiquido"],
  );
  const data = formatDatePt(
    item["dataAssinatura"] ?? item["dataAbertura"] ?? item["data"] ?? item["dataInicio"] ?? item["dataDocumento"],
  );

  return (
    <li
      className="inset"
      style={{
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: "var(--t-hi)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {title}
      </span>
      {sub !== "" && sub !== title && (
        <span
          className="tiny muted"
          style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {sub}
        </span>
      )}
      {(valor !== "" || data !== "") && (
        <span className="tiny" style={{ color: "var(--t-mid)", fontWeight: 600 }}>
          {[valor, data].filter(Boolean).join(" · ")}
        </span>
      )}
    </li>
  );
}

function EvidenceFooter({ section }: { section: DossieSection }) {
  const collected = formatCollectedAt(section.evidence?.collected_at);
  if (!section.evidence?.url && collected === "") return null;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        marginTop: 10,
        paddingTop: 10,
        borderTop: "1px solid var(--border)",
      }}
    >
      {section.evidence?.url && (
        <a
          href={section.evidence.url}
          target="_blank"
          rel="noreferrer noopener"
          className="tiny"
          style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--brand-ink)", fontWeight: 700 }}
        >
          Fonte oficial <ExternalLink size={12} aria-hidden="true" />
        </a>
      )}
      {collected !== "" && (
        <span className="tiny muted">Consultado em {collected}</span>
      )}
    </div>
  );
}

export interface SectionCardProps {
  id: string;
  title: string;
  section: DossieSection | undefined;
  /** Quando true (plano free), mostra o banner "ver tudo com o plano Pro". */
  gated: boolean;
  onUpgrade: () => void;
}

export const SectionCard = forwardRef<HTMLElement, SectionCardProps>(function SectionCard(
  { id, title, section, gated, onUpgrade },
  ref,
) {
  const headingId = `${id}-heading`;

  // Seção ausente no payload (falha parcial do backend para este módulo).
  if (!section) {
    return (
      <section
        ref={ref}
        id={id}
        tabIndex={-1}
        aria-labelledby={headingId}
        className="panel"
        style={{ padding: 20, scrollMarginTop: 78, outline: "none" }}
      >
        <h2 id={headingId} className="h2" style={{ fontSize: 16, marginBottom: 10 }}>
          {title}
        </h2>
        <div
          role="status"
          style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--t-mid)", fontSize: 13 }}
        >
          <AlertCircle size={16} style={{ color: "var(--warn)", flexShrink: 0 }} aria-hidden="true" />
          Esta seção não pôde ser carregada agora. Os demais dados do Raio-X continuam válidos.
        </div>
      </section>
    );
  }

  const contratosTotal =
    id === "contratos" ? sumMoneyField(section.items, "valorGlobal") : 0;

  return (
    <section
      ref={ref}
      id={id}
      tabIndex={-1}
      aria-labelledby={headingId}
      className="panel"
      style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, scrollMarginTop: 78, outline: "none" }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8, justifyContent: "space-between" }}>
        <h2 id={headingId} className="h2" style={{ fontSize: 16 }}>
          {title}
          <span className="tiny muted" style={{ marginLeft: 8, fontWeight: 600 }}>
            {section.total}
          </span>
        </h2>
        {contratosTotal > 0 && (
          <span className="badge badge--info" style={{ fontSize: 12 }}>
            Soma: {formatBRL(contratosTotal)}
          </span>
        )}
      </div>

      {section.status === "vazio" && (
        <div
          role="status"
          style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--t-mid)", fontSize: 13, padding: "6px 0" }}
        >
          <CircleOff size={16} style={{ color: "var(--t-low)", flexShrink: 0 }} aria-hidden="true" />
          Nada consta — consultado em {formatCollectedAt(section.evidence?.collected_at) || "data não informada"}.
        </div>
      )}

      {section.status === "evidencia_insuficiente" && (
        <div
          role="status"
          style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--t-mid)", fontSize: 13, padding: "6px 0" }}
        >
          <FileQuestion size={16} style={{ color: "var(--warn)", flexShrink: 0 }} aria-hidden="true" />
          Fonte não cobre este dado.
        </div>
      )}

      {section.status === "ok" && section.items.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(220px, 100%), 1fr))",
            gap: 8,
          }}
        >
          {section.items.slice(0, 20).map((item, i) => (
            <ItemCard key={i} item={item} />
          ))}
        </ul>
      )}

      {section.status === "ok" && section.items.length === 0 && (
        <div
          role="status"
          style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--t-mid)", fontSize: 13, padding: "6px 0" }}
        >
          <CircleOff size={16} style={{ color: "var(--t-low)", flexShrink: 0 }} aria-hidden="true" />
          Nada consta — consultado em {formatCollectedAt(section.evidence?.collected_at) || "data não informada"}.
        </div>
      )}

      {gated && section.total > section.items.length && (
        <div
          className="inset"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "10px 14px",
            borderColor: "color-mix(in srgb,var(--accent) 35%,var(--border))",
            background: "color-mix(in srgb,var(--accent) 8%,var(--surface))",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--t-mid)" }}>
            <Lock size={14} style={{ color: "var(--accent-ink)", flexShrink: 0 }} aria-hidden="true" />
            Mostrando {section.items.length} de {section.total} registros.
          </span>
          <button type="button" className="btn btn--accent btn--sm" onClick={onUpgrade}>
            Ver tudo com o plano Pro — R$197/mês
          </button>
        </div>
      )}

      <EvidenceFooter section={section} />
    </section>
  );
});
