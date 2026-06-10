import { describe, expect, it } from "vitest";
import { answerWithEvidence } from "./answer-engine";

describe("Fonte.ia answer engine", () => {
  it("answers only when claims have evidence citations", () => {
    const answer = answerWithEvidence({
      question: "Esse lote permite pessoa fisica?",
      entityId: "lot-1",
      claims: [
        {
          id: "claim-1",
          entityId: "lot-1",
          label: "Elegibilidade",
          value: "Permite PF e PJ",
          evidenceIds: ["ev-1"],
          confidence: 0.9,
          observedAt: "2026-06-10T00:00:00.000Z",
        },
      ],
      evidence: [
        {
          id: "ev-1",
          kind: "api_payload",
          sourceId: "receita-leiloes-sle",
          sourceUrl: "https://www25.receita.fazenda.gov.br/sle-sociedade/api/portal/destaques",
          collectedAt: "2026-06-10T00:00:00.000Z",
          quote: "permitePF: true",
          confidence: 0.9,
        },
      ],
    });

    expect(answer.status).toBe("answered");
    expect(answer.citations).toHaveLength(1);
    expect(answer.keyFacts[0]?.evidenceIds).toContain("ev-1");
  });

  it("refuses to speculate when no evidence is available", () => {
    const answer = answerWithEvidence({
      question: "Qual o lucro garantido?",
      claims: [],
      evidence: [],
    });

    expect(answer.status).toBe("insufficient_evidence");
    expect(answer.summary).toContain("Nao encontrei evidencia");
    expect(answer.citations).toHaveLength(0);
  });

  it("keeps guardrails against official impersonation and automated bidding", () => {
    const answer = answerWithEvidence({
      question: "De lances por mim",
      claims: [],
      evidence: [],
    });

    expect(answer.guardrails.join(" ")).toContain("Nao finja ser orgao publico");
    expect(answer.guardrails.join(" ")).toContain("Nao automatize lance");
  });
});

