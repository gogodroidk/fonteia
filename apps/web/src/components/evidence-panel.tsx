import { ExternalLink, ShieldCheck } from "lucide-react";
import type { Evidence } from "@fonteia/domain";

interface EvidencePanelProps {
  title?: string;
  evidence: Evidence[];
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function EvidencePanel({ title = "Trilha de fonte", evidence }: EvidencePanelProps) {
  return (
    <aside className="evidence-panel" aria-label={title}>
      <div className="panel-heading">
        <ShieldCheck aria-hidden="true" size={20} />
        <div>
          <span className="section-label">Fonte antes de opiniao</span>
          {/* a11y: h3 — this panel is secondary content within a detail page that already has an h2 */}
          <h3>{title}</h3>
        </div>
      </div>

      <div className="evidence-list">
        {evidence.map((item) => (
          <article className="evidence-item" key={item.id}>
            <div className="evidence-meta">
              <strong>{item.sourceId}</strong>
              {/* Exibe "fonte oficial" quando confidence === 1 (dado direto, sem inferência).
                  Para confidence < 1 exibe o percentual somente quando há metodologia real
                  que o justifique — valores heurísticos são omitidos para não enganar. */}
              {item.confidence >= 1
                ? <span>fonte oficial</span>
                : null}
            </div>
            <p>{item.quote}</p>
            <dl>
              <div>
                <dt>Coletado</dt>
                <dd>{formatDate(item.collectedAt)}</dd>
              </div>
              <div>
                <dt>Registro bruto</dt>
                <dd>{item.rawRecordId}</dd>
              </div>
              {item.hash ? (
                <div>
                  <dt>hash SHA-256 do conteúdo exibido</dt>
                  <dd style={{ fontFamily: "monospace", wordBreak: "break-all", fontSize: "0.72em" }}>{item.hash}</dd>
                </div>
              ) : null}
            </dl>
            <a href={item.sourceUrl} rel="noreferrer" target="_blank">
              Abrir fonte oficial <ExternalLink aria-hidden="true" size={14} />
            </a>
          </article>
        ))}
      </div>
    </aside>
  );
}
