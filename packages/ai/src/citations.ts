import type { Evidence } from "@fonteia/domain";

export interface AnswerCitation {
  evidenceId: string;
  sourceId: string;
  sourceUrl: string;
  collectedAt: string;
  quote?: string;
  confidence: number;
}

export function evidenceToCitation(evidence: Evidence): AnswerCitation {
  const citation: AnswerCitation = {
    evidenceId: evidence.id,
    sourceId: evidence.sourceId,
    sourceUrl: evidence.sourceUrl,
    collectedAt: evidence.collectedAt,
    confidence: evidence.confidence,
  };

  if (evidence.quote) {
    citation.quote = evidence.quote;
  }

  return citation;
}

export function requireCitations(citations: AnswerCitation[]): void {
  if (citations.length === 0) {
    throw new Error("Fonte.ia factual answers require at least one evidence citation");
  }
}

