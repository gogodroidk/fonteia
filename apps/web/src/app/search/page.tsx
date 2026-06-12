import { useEffect, useRef, useState } from "react";
import { ExternalLink, MessageSquareText, Sparkles } from "lucide-react";
import type { FonteiaAnswer } from "@fonteia/ai";
import { EvidencePanel } from "../../components/evidence-panel";

type AskStatus = "idle" | "loading" | "success" | "error" | "unavailable";

const DEFAULT_API_URL = "http://localhost:4000";

/**
 * Resposta de demonstração usada quando a API não está disponível.
 * Mantém o produto utilizável e mostra o formato real da resposta
 * (resumo + fatos + risco + fontes) para quem ainda não conectou o backend.
 */
function buildDemoAnswer(question: string): FonteiaAnswer {
  const collectedAt = new Date().toISOString();
  return {
    status: "answered",
    summary:
      "Resposta de demonstração: encontramos 3 lotes da Receita Federal com margem estimada acima da média e prazo aberto nesta semana.",
    keyFacts: [
      {
        label: "Lotes com boa margem",
        value: "3 lotes (score ≥ 78)",
        evidenceIds: ["demo-ev-1"],
        confidence: 0.82,
      },
      {
        label: "Melhor oportunidade",
        value: "Lote 042 — entrada R$ 18.000, valor ref. R$ 47.500",
        evidenceIds: ["demo-ev-1"],
        confidence: 0.76,
      },
      {
        label: "Prazo mais próximo",
        value: "Encerra em 4 dias",
        evidenceIds: ["demo-ev-2"],
        confidence: 0.9,
      },
    ],
    riskOrOpportunity:
      "Oportunidade: margem estimada de ~60% no lote em destaque, com risco baixo de disputa pelo histórico da comarca.",
    nextActions: [
      "Abrir o lote no radar para ver o edital completo",
      "Criar um alerta de prazo para não perder a data",
    ],
    citations: [
      {
        evidenceId: "demo-ev-1",
        sourceId: "receita-leiloes-sle",
        sourceUrl: "https://venda.estaleiro.serpro.gov.br/",
        collectedAt,
        quote: "Lote 042 — veículo, lance mínimo R$ 18.000, avaliação R$ 47.500.",
        confidence: 0.82,
      },
      {
        evidenceId: "demo-ev-2",
        sourceId: "receita-leiloes-sle",
        sourceUrl: "https://venda.estaleiro.serpro.gov.br/",
        collectedAt,
        quote: "Encerramento da sessão pública previsto para esta semana.",
        confidence: 0.9,
      },
    ] as FonteiaAnswer["citations"],
    guardrails: [
      "Esta é uma resposta de demonstração com dados de amostra.",
      "Conecte a API ou o Supabase para respostas com fontes ao vivo.",
    ],
  };
}

function getApiUrl(): string {
  const configured = import.meta.env["VITE_API_URL"] as string | undefined;

  if (typeof configured === "string" && configured.trim().length > 0) {
    return configured.replace(/\/+$/, "");
  }

  if (import.meta.env.DEV) {
    return DEFAULT_API_URL;
  }

  return "";
}

async function askFonteia(question: string): Promise<FonteiaAnswer> {
  const apiUrl = getApiUrl();

  if (!apiUrl) {
    throw new Error("unavailable");
  }

  const response = await fetch(`${apiUrl}/ask?q=${encodeURIComponent(question)}`, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }

  return (await response.json()) as FonteiaAnswer;
}

interface SearchPageProps {
  initialQuestion?: string;
}

export function SearchPage({ initialQuestion }: SearchPageProps = {}) {
  const [question, setQuestion] = useState(
    initialQuestion && initialQuestion.trim().length > 0
      ? initialQuestion
      : "Essa empresa tem risco em licitacoes, marcas, processos ou transparencia?",
  );
  const [status, setStatus] = useState<AskStatus>("idle");
  const [answer, setAnswer] = useState<FonteiaAnswer | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoRanRef = useRef(false);

  async function handleSubmit(overrideQuestion?: string) {
    const q = (overrideQuestion ?? question).trim();
    if (!q) return;

    if (abortRef.current) {
      abortRef.current.abort();
    }

    abortRef.current = new AbortController();
    setStatus("loading");
    setAnswer(null);
    setErrorMessage(null);

    try {
      const result = await askFonteia(q);
      setAnswer(result);
      setStatus("success");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (message === "unavailable" || message.includes("fetch") || message.includes("Failed to fetch")) {
        // Sem backend ao vivo: entrega uma resposta de amostra em vez de travar.
        setAnswer(buildDemoAnswer(q));
        setStatus("success");
      } else {
        setStatus("error");
        setErrorMessage(message);
      }
    }
  }

  // Quando a pergunta chega do dashboard, dispara a análise automaticamente.
  useEffect(() => {
    if (initialQuestion && initialQuestion.trim().length > 0 && !autoRanRef.current) {
      autoRanRef.current = true;
      void handleSubmit(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  const evidenceItems =
    answer?.citations.map((citation) => ({
      id: citation.evidenceId,
      sourceId: citation.sourceId,
      sourceUrl: citation.sourceUrl,
      kind: "api_payload" as const,
      collectedAt: citation.collectedAt,
      rawRecordId: citation.evidenceId,
      quote: citation.quote ?? "",
      confidence: citation.confidence,
    })) ?? [];

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
          <textarea
            value={question}
            onChange={(e) => {
              setQuestion(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                void handleSubmit();
              }
            }}
          />
        </label>

        <div className="search-submit-row">
          <button
            className="primary-button"
            disabled={status === "loading" || !question.trim()}
            onClick={() => void handleSubmit()}
            type="button"
          >
            {status === "loading" ? (
              <>
                <span className="spinner" aria-hidden="true" />
                Analisando...
              </>
            ) : (
              "Analisar"
            )}
          </button>
          <small>Ctrl+Enter para enviar</small>
        </div>

        {status === "unavailable" ? (
          <div className="ask-feedback ask-feedback-error">
            API indisponivel — tente mais tarde.
          </div>
        ) : null}

        {status === "error" ? (
          <div className="ask-feedback ask-feedback-error">
            Erro ao obter resposta{errorMessage ? `: ${errorMessage}` : "."}
          </div>
        ) : null}

        {status === "success" && answer ? (
          <article className="answer-card answer-card-result">
            <div className="answer-icon">
              <Sparkles aria-hidden="true" size={20} />
            </div>
            <div className="answer-body">
              <div className="answer-status-chip answer-status-chip-answered">
                {answer.status === "answered" ? "Respondido com evidencia" : "Evidencia insuficiente"}
              </div>

              <h3>{answer.summary}</h3>

              {answer.keyFacts.length > 0 ? (
                <dl className="answer-facts">
                  {answer.keyFacts.map((fact, i) => (
                    <div key={i} className="answer-fact">
                      <dt>{fact.label}</dt>
                      <dd>
                        {fact.value}
                        <span className="answer-fact-confidence">{Math.round(fact.confidence * 100)}%</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {answer.riskOrOpportunity ? (
                <p className="answer-risk">{answer.riskOrOpportunity}</p>
              ) : null}

              {answer.citations.length > 0 ? (
                <div className="answer-citations">
                  <span className="section-label">Fontes</span>
                  <ul>
                    {answer.citations.map((citation) => (
                      <li key={citation.evidenceId}>
                        <a href={citation.sourceUrl} target="_blank" rel="noreferrer">
                          {citation.sourceId}
                          <ExternalLink aria-hidden="true" size={12} />
                        </a>
                        {citation.quote ? <span> — {citation.quote}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {answer.guardrails.length > 0 ? (
                <p className="answer-guardrails">{answer.guardrails.join(" ")}</p>
              ) : null}
            </div>
          </article>
        ) : null}

        {status === "idle" ? (
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
            </div>
          </article>
        ) : null}
      </div>

      <EvidencePanel
        evidence={evidenceItems.length > 0 ? evidenceItems : []}
        title={evidenceItems.length > 0 ? "Fontes da resposta" : "Trilha de fonte"}
      />
    </section>
  );
}
