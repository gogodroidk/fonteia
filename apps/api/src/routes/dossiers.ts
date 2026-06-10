import type { Dossier } from "@fonteia/domain";
import { jsonResponse, notFound, type ApiResponse } from "./types";

const SAMPLE_DOSSIERS: Dossier[] = [
  {
    id: "sample-auction-lot-001",
    title: "Dossie de lote - exemplo",
    subjectEntityId: "sample-auction-lot-001",
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    sections: [
      {
        id: "summary",
        title: "Resumo",
        summary: "Lote exemplo para validar o fluxo fonte -> entidade -> evidencia -> dossie.",
        evidenceIds: ["sample-evidence-001"],
        riskLevel: "unknown",
      },
    ],
    evidence: [
      {
        id: "sample-evidence-001",
        kind: "html_page",
        sourceId: "receita-leiloes-sle",
        sourceUrl: "https://www25.receita.fazenda.gov.br/sle-sociedade/portal/editais-disponiveis",
        collectedAt: "2026-06-10T00:00:00.000Z",
        quote: "Exemplo de evidencia oficial para o prototipo.",
        confidence: 0.5,
      },
    ],
  },
];

export function getDossier(entityId: string): ApiResponse<Dossier | { error: string; path: string }> {
  const dossier = SAMPLE_DOSSIERS.find((item) => item.subjectEntityId === entityId || item.id === entityId);

  if (!dossier) {
    return notFound(`/dossiers/${entityId}`);
  }

  return jsonResponse(dossier);
}

