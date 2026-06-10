import { ArrowRight, Search, TrendingUp } from "lucide-react";
import { PRODUCT_MODULES } from "@fonteia/domain";
import { SOURCE_CATALOG } from "@fonteia/sources";
import { EvidencePanel } from "../components/evidence-panel";
import { ModuleCard } from "../components/module-card";
import { SourceStatusBadge } from "../components/source-status-badge";
import { AUCTION_OPPORTUNITIES } from "../data/leiloes";

const selectedOpportunity = AUCTION_OPPORTUNITIES[0]!;

export function DashboardPage() {
  const connectedSources = SOURCE_CATALOG.filter((source) => source.status === "connected").length;
  const officialSources = SOURCE_CATALOG.filter((source) => source.reliability.startsWith("official")).length;

  return (
    <div className="dashboard-grid">
      <section className="command-center">
        <div className="ask-box">
          <Search aria-hidden="true" size={22} />
          <input
            aria-label="Pergunte ao Fonte.ia"
            defaultValue="Quais lotes da Receita parecem ter melhor margem esta semana?"
          />
          <button type="button">Analisar</button>
        </div>

        <div className="metric-strip">
          <div>
            <span className="section-label">Fontes catalogadas</span>
            <strong>{SOURCE_CATALOG.length}</strong>
            <small>{officialSources} oficiais ou publicas</small>
          </div>
          <div>
            <span className="section-label">Conectadas agora</span>
            <strong>{connectedSources}</strong>
            <small>PNCP, Compras e bases operacionais</small>
          </div>
          <div>
            <span className="section-label">Modulo monetizavel</span>
            <strong>Leiloes</strong>
            <small>radar, score, edital e alertas</small>
          </div>
        </div>
      </section>

      <section className="opportunity-board">
        <div className="section-header">
          <div>
            <span className="section-label">Radar de oportunidades</span>
            <h2>Melhores lotes para investigar hoje</h2>
          </div>
          <button className="ghost-button" type="button">
            Ver todos <ArrowRight aria-hidden="true" size={16} />
          </button>
        </div>

        <div className="opportunity-list">
          {AUCTION_OPPORTUNITIES.map((lot) => (
            <article className="opportunity-row" key={lot.id}>
              <div className="score-ring" aria-label={`Score ${lot.opportunityScore}`}>
                {lot.opportunityScore}
              </div>
              <div className="opportunity-main">
                <h3>{lot.title}</h3>
                <p>
                  {lot.city} · {lot.eligibility} · prazo {lot.deadline}
                </p>
                <div className="row-tags">
                  <span>{lot.sourceLabel}</span>
                  <span>risco {lot.risk}</span>
                  <span>{lot.nextAction}</span>
                </div>
              </div>
              <div className="value-stack">
                <small>entrada</small>
                <strong>{lot.entryValue}</strong>
                <span>valor ref. {lot.estimatedValue}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <EvidencePanel evidence={selectedOpportunity.evidence} title="Evidencia do lote em foco" />

      <section className="module-rail">
        <div className="section-header">
          <div>
            <span className="section-label">Cascata comercial</span>
            <h2>O que o cliente descobre depois do primeiro ganho</h2>
          </div>
        </div>
        <div className="module-grid">
          {PRODUCT_MODULES.slice(0, 6).map((module) => (
            <ModuleCard key={module.id} module={module} selected={module.id === "leiloes"} />
          ))}
        </div>
      </section>

      <section className="source-health">
        <div>
          <TrendingUp aria-hidden="true" size={20} />
          <strong>Saude das fontes</strong>
        </div>
        <div className="source-pills">
          {SOURCE_CATALOG.slice(0, 6).map((source) => (
            <span className="source-pill" key={source.id}>
              {source.name}
              <SourceStatusBadge status={source.status} />
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
