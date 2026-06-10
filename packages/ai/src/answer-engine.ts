import type { Claim, Evidence } from "@fonteia/domain";
import { evidenceToCitation, requireCitations, type AnswerCitation } from "./citations";
import { FONTEIA_ANSWER_GUARDRAILS } from "./prompts";

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

export function answerWithEvidence(context: AnswerContext): FonteiaAnswer {
  const claims = selectRelevantClaims(context);
  const citations = citationsForClaims(claims, context.evidence);

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

