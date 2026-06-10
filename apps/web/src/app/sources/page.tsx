import { SOURCE_CATALOG } from "@fonteia/sources";
import { SourceStatusBadge } from "../../components/source-status-badge";

export function SourcesPage() {
  return (
    <section className="page-panel">
      <div className="section-header">
        <div>
          <span className="section-label">Catalogo de fontes</span>
          <h2>Fonte oficial, status e risco comercial</h2>
        </div>
      </div>
      <div className="source-table" role="table" aria-label="Catalogo de fontes publicas">
        <div className="source-table-row header" role="row">
          <span>Fonte</span>
          <span>Status</span>
          <span>Modulos</span>
          <span>Risco</span>
        </div>
        {SOURCE_CATALOG.map((source) => (
          <div className="source-table-row" key={source.id} role="row">
            <span>
              <strong>{source.name}</strong>
              <small>{source.owner}</small>
            </span>
            <span>
              <SourceStatusBadge status={source.status} />
            </span>
            <span>{source.modules.join(", ")}</span>
            <span>{source.commercialRisk}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
