import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Search, TrendingUp } from "lucide-react";
import { PRODUCT_MODULES } from "@fonteia/domain";
import type { ReceitaLeilaoLot } from "@fonteia/sources";
import { SOURCE_CATALOG } from "@fonteia/sources";
import { DemoDataBanner } from "../components/demo-data-banner";
import { EvidencePanel } from "../components/evidence-panel";
import { ModuleCard } from "../components/module-card";
import { ScoreRing } from "../components/score-ring";
import { SourceHealthSummary } from "../components/source-health-summary";
import { SourceStatusBadge } from "../components/source-status-badge";
import { loadLeiloesLots, SAMPLE_LEILAO_LOTS, type LeiloesDataSource } from "../data/fonteia-client";
import { mapReceitaLotToOpportunity } from "../data/leiloes";

const dataSourceLabel: Record<LeiloesDataSource, string> = {
  api: "API Fonte.ia",
  supabase: "Supabase publico",
  sample: "Amostra local",
};

interface DashboardPageProps {
  onSelectLot?: (lot: ReceitaLeilaoLot) => void;
  onAsk?: (question: string) => void;
}

function daysUntil(value: string): number {
  const deadline = new Date(value).getTime();

  if (Number.isNaN(deadline)) return 999;

  return Math.ceil((deadline - Date.now()) / 86_400_000);
}

function formatCurrencyFromCents(valueInCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(valueInCents / 100);
}

export function DashboardPage({ onSelectLot, onAsk }: DashboardPageProps) {
  const [question, setQuestion] = useState(
    "Quais lotes da Receita parecem ter melhor margem esta semana?",
  );
  const [rawLots, setRawLots] = useState<ReceitaLeilaoLot[]>(SAMPLE_LEILAO_LOTS);
  const [dataSource, setDataSource] = useState<LeiloesDataSource>("sample");
  const [dataMessage, setDataMessage] = useState("Carregando dados vivos...");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | undefined>();
  const [isDemo, setIsDemo] = useState(true);
  const [isLoadingLiveData, setIsLoadingLiveData] = useState(true);
  const [term, setTerm] = useState("");
  const [riskFilter, setRiskFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("all");
  const connectedSources = SOURCE_CATALOG.filter((source) => source.status === "connected").length;
  const officialSources = SOURCE_CATALOG.filter((source) => source.reliability.startsWith("official")).length;
  const receitaSource = SOURCE_CATALOG.find((source) => source.id === "receita-leiloes-sle");

  useEffect(() => {
    let isMounted = true;

    void loadLeiloesLots().then((result) => {
      if (!isMounted) {
        return;
      }

      setRawLots(result.lots);
      setDataSource(result.source);
      setDataMessage(result.message);
      setLastSyncedAt(result.lastSyncedAt);
      setIsDemo(result.isDemo);
      setIsLoadingLiveData(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const opportunities = useMemo(() => rawLots.map(mapReceitaLotToOpportunity), [rawLots]);

  const filteredLots = useMemo(() => {
    return rawLots.filter((lot) => {
      const text = `${lot.edital} ${lot.displayNumber} ${lot.city} ${lot.agency}`.toLowerCase();
      const matchesTerm = term.trim().length === 0 || text.includes(term.trim().toLowerCase());
      const mapped = mapReceitaLotToOpportunity(lot);
      const matchesRisk = riskFilter === "all" || mapped.risk === riskFilter;
      const matchesPerson = personFilter === "all" || lot.eligiblePersonTypes.includes(personFilter as "pf" | "pj");

      return matchesTerm && matchesRisk && matchesPerson;
    });
  }, [personFilter, rawLots, riskFilter, term]);

  const filteredOpportunities = useMemo(
    () => filteredLots.map(mapReceitaLotToOpportunity),
    [filteredLots],
  );

  const selectedOpportunity = filteredOpportunities[0] ?? opportunities[0];
  const liveMetric = isDemo ? "demo" : String(rawLots.length);
  const soonCount = rawLots.filter((lot) => daysUntil(lot.proposalDeadline) <= 3).length;
  const pfCount = rawLots.filter((lot) => lot.eligiblePersonTypes.includes("pf")).length;
  const avgTicket = rawLots.length > 0
    ? formatCurrencyFromCents(Math.round(rawLots.reduce((sum, lot) => sum + lot.minimumBidCents, 0) / rawLots.length))
    : "R$ 0";

  return (
    <div className="dashboard-grid">
      {isDemo ? (
        <DemoDataBanner
          message="O cockpit esta usando amostras locais. Use para validar a experiencia, nao para tomar decisao real de leilao."
        />
      ) : null}

      <section className="command-center">
        <div className="ask-box">
          <Search aria-hidden="true" size={22} />
          <input
            aria-label="Pergunte ao Fonte.ia"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && question.trim()) {
                onAsk?.(question);
              }
            }}
            placeholder="Pergunte qualquer coisa sobre os dados públicos..."
          />
          <button type="button" onClick={() => onAsk?.(question)} disabled={!question.trim()}>
            Analisar
          </button>
        </div>

        <div className="metric-strip">
          <div>
            <span className="section-label">Lotes monitorados</span>
            <strong>{liveMetric}</strong>
            <small>{dataSourceLabel[dataSource]}</small>
          </div>
          <div>
            <span className="section-label">Prazos em 72h</span>
            <strong>{soonCount}</strong>
            <small>exigem decisao rapida</small>
          </div>
          <div>
            <span className="section-label">Pessoa fisica</span>
            <strong>{pfCount}</strong>
            <small>lotes abertos para PF</small>
          </div>
          <div>
            <span className="section-label">Ticket medio</span>
            <strong>{avgTicket}</strong>
            <small>lance minimo medio</small>
          </div>
        </div>
      </section>

      <section className="opportunity-board">
        <div className="section-header">
          <div>
            <span className="section-label">Radar de oportunidades</span>
            <h2>Melhores lotes para investigar hoje</h2>
          </div>
          <button className="ghost-button" type="button" onClick={() => onAsk?.("Quais lotes merecem prioridade hoje?") }>
            Priorizar <ArrowRight aria-hidden="true" size={16} />
          </button>
        </div>

        <div className={`data-source-banner data-source-${dataSource}`}>
          <span>{isLoadingLiveData ? "Sincronizando" : dataSourceLabel[dataSource]}</span>
          <p>{dataMessage}</p>
        </div>

        <div className="leiloes-filter-row">
          <input
            aria-label="Filtrar por edital, cidade ou orgao"
            placeholder="Buscar edital, cidade ou orgao"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
          <select aria-label="Filtrar risco" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
            <option value="all">Todos os riscos</option>
            <option value="baixo">Risco baixo</option>
            <option value="medio">Risco medio</option>
            <option value="alto">Risco alto</option>
          </select>
          <select aria-label="Filtrar pessoa" value={personFilter} onChange={(event) => setPersonFilter(event.target.value)}>
            <option value="all">PF e PJ</option>
            <option value="pf">Permite PF</option>
            <option value="pj">Permite PJ</option>
          </select>
        </div>

        <div className="opportunity-list">
          {filteredOpportunities.map((lot) => {
            const rawLot = filteredLots.find((item) => item.id === lot.id);

            return (
              <article
                className={`opportunity-row${onSelectLot ? " opportunity-row-clickable" : ""}`}
                key={lot.id}
                onClick={() => {
                  if (onSelectLot && rawLot) {
                    onSelectLot(rawLot);
                  }
                }}
                role={onSelectLot && rawLot ? "button" : undefined}
                tabIndex={onSelectLot && rawLot ? 0 : undefined}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && onSelectLot && rawLot) {
                    onSelectLot(rawLot);
                  }
                }}
              >
                <ScoreRing score={lot.opportunityScore} />
                <div className="opportunity-main">
                  <h3>{lot.title}</h3>
                  <p>
                    {lot.city} - {lot.eligibility} - prazo {lot.deadline}
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
            );
          })}
        </div>
      </section>

      {selectedOpportunity ? (
        <EvidencePanel evidence={selectedOpportunity.evidence} title="Evidencia do lote em foco" />
      ) : null}

      <SourceHealthSummary
        source={receitaSource}
        label={dataSourceLabel[dataSource]}
        message={dataMessage}
        lastSyncedAt={lastSyncedAt}
      />

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
        <small>{officialSources} fontes oficiais/publicas catalogadas e {connectedSources} conectadas agora.</small>
      </section>
    </div>
  );
}
