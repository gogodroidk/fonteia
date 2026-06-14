import type { Claim, Evidence } from "@fonteia/domain";
import { evidenceToCitation, requireCitations, type AnswerCitation } from "./citations";
import { FONTEIA_ANSWER_GUARDRAILS } from "./prompts";
import type { AiRouter } from "./router";

export interface AnswerContext {
  question: string;
  moduleId?: string;
  entityId?: string;
  claims: Claim[];
  evidence: Evidence[];
}

export interface AnswerFact {
  label: string;
  value: string;
  evidenceIds: string[];
  confidence: number;
}

export interface FonteiaAnswer {
  status: "answered" | "insufficient_evidence";
  summary: string;
  keyFacts: AnswerFact[];
  riskOrOpportunity: string;
  nextActions: string[];
  citations: AnswerCitation[];
  guardrails: string[];
}

function stringifyClaimValue(value: Claim["value"]): string {
  if (value === null) {
    return "nao informado";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function selectRelevantClaims(context: AnswerContext): Claim[] {
  if (context.entityId) {
    return context.claims.filter((claim) => claim.entityId === context.entityId);
  }

  return context.claims;
}

function citationsForClaims(claims: Claim[], evidence: Evidence[]): AnswerCitation[] {
  const evidenceIds = new Set(claims.flatMap((claim) => claim.evidenceIds));
  return evidence.filter((item) => evidenceIds.has(item.id)).map(evidenceToCitation);
}

// Comprimento máximo da pergunta para evitar abusos e injeção de prompt longa.
const MAX_QUESTION_LENGTH = 500;

export function answerWithEvidence(context: AnswerContext): FonteiaAnswer {
  // Trunca a pergunta se exceder o limite antes de qualquer processamento.
  const safeContext: AnswerContext = context.question.length > MAX_QUESTION_LENGTH
    ? { ...context, question: context.question.slice(0, MAX_QUESTION_LENGTH) }
    : context;
  const claims = selectRelevantClaims(safeContext);
  const citations = citationsForClaims(claims, safeContext.evidence);

  if (claims.length === 0 || citations.length === 0) {
    return {
      status: "insufficient_evidence",
      summary: "Nao encontrei evidencia suficiente para responder com seguranca.",
      keyFacts: [],
      riskOrOpportunity: "A resposta ficaria especulativa sem fonte verificavel.",
      nextActions: ["Conectar mais fontes oficiais", "Tentar uma pergunta mais especifica", "Verificar a fonte original manualmente"],
      citations: [],
      guardrails: [...FONTEIA_ANSWER_GUARDRAILS],
    };
  }

  requireCitations(citations);

  const keyFacts = claims.map((claim) => ({
    label: claim.label,
    value: stringifyClaimValue(claim.value),
    evidenceIds: claim.evidenceIds,
    confidence: claim.confidence,
  }));

  const firstFact = keyFacts[0];
  const summary = firstFact
    ? `Com base nas fontes conectadas, ${firstFact.label}: ${firstFact.value}.`
    : "Resposta baseada nas evidencias conectadas.";

  return {
    status: "answered",
    summary,
    keyFacts,
    riskOrOpportunity: "Use esta resposta como apoio a decisao; confirme detalhes criticos na fonte oficial antes de agir.",
    nextActions: ["Abrir evidencias", "Salvar dossie", "Criar alerta para mudancas", "Cruzar com modulos relacionados"],
    citations,
    guardrails: [...FONTEIA_ANSWER_GUARDRAILS],
  };
}

/**
 * Resposta do Raio-X com narração por IA, agora roteada (Gemini/Claude).
 *
 * Mantém o CONTRATO de evidência do answerWithEvidence (sem evidência → recusa),
 * mas, quando há base factual, usa o roteador para produzir um texto em
 * linguagem simples ('analise-profunda' → Claude por padrão). Se a IA falhar ou
 * não estiver configurada, a chamada propaga o erro para o caller decidir
 * (ex.: 503 honesto) — não inventamos resposta.
 */
export interface NarratedAnswer extends FonteiaAnswer {
  /** Texto livre gerado pela IA a partir das evidências (markdown curto). */
  narrative: string;
  /** Modelo que produziu a narrativa (debug/telemetria). */
  model: string;
}

function factsToPromptBlock(facts: AnswerFact[]): string {
  return facts.map((fact) => `- ${fact.label}: ${fact.value}`).join("\n");
}

export async function answerWithEvidenceNarrated(
  router: AiRouter,
  context: AnswerContext,
): Promise<NarratedAnswer> {
  const base = answerWithEvidence(context);

  // Sem evidência suficiente: devolve a recusa determinística, sem chamar a IA.
  if (base.status === "insufficient_evidence") {
    return { ...base, narrative: base.summary, model: "none" };
  }

  const system = [
    "Voce e o assistente da Fonte.ia. Explique para um comprador leigo, em portugues claro, SEM jargao.",
    "Use APENAS os fatos verificados abaixo. NUNCA invente fato, valor ou prazo.",
    "Nao de aconselhamento juridico/contabil/fiscal definitivo. Nao prometa lucro. Aponte o que conferir no edital oficial.",
    "Responda em markdown curto (ate ~250 palavras).",
  ].join("\n");

  const userContent = [
    `Pergunta: ${context.question}`,
    "",
    "Fatos verificados (com evidencia):",
    factsToPromptBlock(base.keyFacts),
  ].join("\n");

  const result = await router.generate({
    task: "analise-profunda",
    system,
    messages: [{ role: "user", content: userContent }],
  });

  return { ...base, narrative: result.text, model: result.model };
}

