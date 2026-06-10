import { answerWithEvidence } from "@fonteia/ai";
import type { AnswerContext } from "@fonteia/ai";
import type { Claim, Evidence } from "@fonteia/domain";
import { SAMPLE_LEILAO_LOTS } from "./leiloes";
import { jsonResponse, type ApiResponse, type RouteRequest } from "./types";

function buildSampleClaimsAndEvidence(): { claims: Claim[]; evidence: Evidence[] } {
  const claims: Claim[] = [];
  const evidence: Evidence[] = [];

  for (const lot of SAMPLE_LEILAO_LOTS) {
    const eligibilityEvidenceId = `ev-${lot.id}-eligibility`;
    const valueEvidenceId = `ev-${lot.id}-value`;

    claims.push(
      {
        id: `claim-${lot.id}-eligibility`,
        entityId: lot.id,
        label: "Elegibilidade do lote",
        value: lot.eligiblePersonTypes.includes("pf") ? "Permite pessoa fisica e pessoa juridica" : "Restrito a pessoa juridica",
        evidenceIds: [eligibilityEvidenceId],
        confidence: 0.85,
        observedAt: lot.collectedAt,
      },
      {
        id: `claim-${lot.id}-minimum-bid`,
        entityId: lot.id,
        label: "Valor minimo",
        value: `R$ ${(lot.minimumBidCents / 100).toLocaleString("pt-BR")}`,
        evidenceIds: [valueEvidenceId],
        confidence: 0.85,
        observedAt: lot.collectedAt,
      },
    );

    evidence.push(
      {
        id: eligibilityEvidenceId,
        kind: "api_payload",
        sourceId: lot.sourceId,
        sourceUrl: lot.sourceUrl,
        collectedAt: lot.collectedAt,
        quote: `permitePF: ${lot.raw.permitePF}`,
        confidence: 0.85,
      },
      {
        id: valueEvidenceId,
        kind: "api_payload",
        sourceId: lot.sourceId,
        sourceUrl: lot.sourceUrl,
        collectedAt: lot.collectedAt,
        quote: `valor: ${lot.raw.valor}`,
        confidence: 0.85,
      },
    );
  }

  return { claims, evidence };
}

export function askFonteia(request: RouteRequest): ApiResponse<ReturnType<typeof answerWithEvidence>> {
  const question = request.query.get("q") ?? request.query.get("question") ?? "";
  const entityId = request.query.get("entityId") ?? undefined;
  const moduleId = request.query.get("module") ?? undefined;
  const { claims, evidence } = buildSampleClaimsAndEvidence();
  const context: AnswerContext = {
    question,
    claims,
    evidence,
  };

  if (entityId) {
    context.entityId = entityId;
  }

  if (moduleId) {
    context.moduleId = moduleId;
  }

  return jsonResponse(answerWithEvidence(context));
}
