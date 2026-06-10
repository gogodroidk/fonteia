import { MessageSquareText, Sparkles } from "lucide-react";
import { AUCTION_OPPORTUNITIES } from "../../data/leiloes";
import { EvidencePanel } from "../../components/evidence-panel";

export function SearchPage() {
  const answer = AUCTION_OPPORTUNITIES[0]!;

  return (
    <section className="search-layout">
      <div className="page-panel">
        <div className="section-header">
          <div>
            <span className="section-label">Busca universal</span>
            <h2>Pergunte, veja a prova, decida o proximo passo</h2>
          </div>
        </div>
        <label className="question-box">
          <MessageSquareText aria-hidden="true" size={20} />
          <textarea defaultValue="Essa empresa tem risco em licitacoes, marcas, processos ou transparencia?" />
        </label>
        <article className="answer-card">
          <div className="answer-icon">
            <Sparkles aria-hidden="true" size={20} />
          </div>
          <div>
            <h3>Resposta estruturada com evidencia</h3>
            <p>
              O motor responde apenas quando existe fonte rastreavel. Se a evidencia ainda nao existe, a resposta
              volta como insuficiente e sugere qual fonte integrar.
            </p>
            <button className="primary-button" type="button">
              Gerar resposta
            </button>
          </div>
        </article>
      </div>
      <EvidencePanel evidence={answer.evidence} />
    </section>
  );
}
