import { describe, expect, it } from "vitest";
import type { Claim, Evidence } from "@fonteia/domain";
import { answerWithEvidence, answerWithEvidenceNarrated, type AnswerContext } from "./answer-engine";
import { UNTRUSTED_CONTENT_OPEN } from "./prompts";
import type { AiGenerateRequest, AiGenerateResult } from "./types";

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

  it("reranqueia claims por confianca: o fato mais forte lidera o resumo", () => {
    const evidence: Evidence[] = [
      {
        id: "ev-weak",
        kind: "api_payload",
        sourceId: "s",
        sourceUrl: "https://x.gov.br/weak",
        collectedAt: "2026-06-10T00:00:00.000Z",
        confidence: 0.4,
      },
      {
        id: "ev-strong",
        kind: "api_payload",
        sourceId: "s",
        sourceUrl: "https://x.gov.br/strong",
        collectedAt: "2026-06-10T00:00:00.000Z",
        confidence: 0.95,
      },
    ];
    const claims: Claim[] = [
      {
        id: "claim-weak",
        entityId: "e1",
        label: "Detalhe secundario",
        value: "menos relevante",
        evidenceIds: ["ev-weak"],
        confidence: 0.4,
        observedAt: "2026-06-10T00:00:00.000Z",
      },
      {
        id: "claim-strong",
        entityId: "e1",
        label: "Fato principal",
        value: "mais relevante",
        evidenceIds: ["ev-strong"],
        confidence: 0.95,
        observedAt: "2026-06-10T00:00:00.000Z",
      },
    ];
    const answer = answerWithEvidence({ question: "p", entityId: "e1", claims, evidence });
    expect(answer.keyFacts[0]?.label).toBe("Fato principal");
    expect(answer.summary).toContain("Fato principal");
  });
});

describe("answerWithEvidenceNarrated — cruzamento (ligar os pontos)", () => {
  const baseContext: AnswerContext = {
    question: "O que se sabe sobre essa empresa?",
    entityId: "e1",
    claims: [
      {
        id: "c1",
        entityId: "e1",
        label: "Situacao cadastral",
        value: "ATIVA",
        evidenceIds: ["ev1"],
        confidence: 0.9,
        observedAt: "2026-06-10T00:00:00.000Z",
      },
    ],
    evidence: [
      {
        id: "ev1",
        kind: "api_payload",
        sourceId: "brasilapi",
        sourceUrl: "https://brasilapi.com.br/cnpj/1",
        collectedAt: "2026-06-10T00:00:00.000Z",
        confidence: 0.9,
      },
    ],
  };

  // Roteador falso: captura o request e devolve um texto fixo (sem rede).
  function fakeRouter(capture: { req?: AiGenerateRequest }) {
    return {
      generate: async (req: AiGenerateRequest): Promise<AiGenerateResult> => {
        capture.req = req;
        return { text: "narrativa de teste", provider: "gemini", model: "fake" };
      },
    } as unknown as Parameters<typeof answerWithEvidenceNarrated>[0];
  }

  it("injeta o bloco de cruzamento envolto em delimitador anti-injecao", async () => {
    const capture: { req?: AiGenerateRequest } = {};
    const out = await answerWithEvidenceNarrated(fakeRouter(capture), {
      ...baseContext,
      crossReferenceBlock: "Cruzamento por CNPJ 00.0/0001-40: 3 contratos · 1 sancao",
    });
    expect(out.narrative).toBe("narrativa de teste");
    const userMsg = capture.req?.messages.map((m) => m.content).join("\n") ?? "";
    expect(userMsg).toContain(UNTRUSTED_CONTENT_OPEN);
    expect(userMsg).toContain("3 contratos");
    // O system deve ensinar a ligar os pontos quando ha cruzamento.
    expect(capture.req?.system ?? "").toContain("LIGAR OS PONTOS");
    expect(capture.req?.system ?? "").toContain("**Conexoes**");
  });

  it("sem cruzamento: nao adiciona delimitador nem secao de conexoes", async () => {
    const capture: { req?: AiGenerateRequest } = {};
    await answerWithEvidenceNarrated(fakeRouter(capture), baseContext);
    const userMsg = capture.req?.messages.map((m) => m.content).join("\n") ?? "";
    expect(userMsg).not.toContain(UNTRUSTED_CONTENT_OPEN);
    expect(capture.req?.system ?? "").not.toContain("**Conexoes**");
  });

  it("sem evidencia: recusa deterministica, nao chama o roteador", async () => {
    const capture: { req?: AiGenerateRequest } = {};
    const out = await answerWithEvidenceNarrated(fakeRouter(capture), {
      question: "p",
      claims: [],
      evidence: [],
      crossReferenceBlock: "qualquer coisa",
    });
    expect(out.status).toBe("insufficient_evidence");
    expect(capture.req).toBeUndefined(); // roteador nao foi chamado
  });
});

