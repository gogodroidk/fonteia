import type { Dossier } from "@fonteia/domain";
import { SOURCE_CATALOG } from "@fonteia/sources";
import { jsonResponse, notFound, type ApiResponse } from "./types";

export interface DossierExport {
  exportedAt: string;
  dossier: Dossier;
  sources: Array<{
    id: string;
    name: string;
    owner: string;
    sourceUrl: string;
    status: string;
    reliability: string;
  }>;
  evidenceSummary: Array<{
    evidenceId: string;
    sourceId: string;
    sourceUrl: string;
    collectedAt: string;
    quote: string;
    confidence: number;
  }>;
}

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

export function exportDossier(entityId: string): ApiResponse<DossierExport | { error: string; path: string }> {
  const dossier = SAMPLE_DOSSIERS.find((item) => item.subjectEntityId === entityId || item.id === entityId);

  if (!dossier) {
    return notFound(`/dossiers/${entityId}/export`);
  }

  const usedSourceIds = new Set(dossier.evidence.map((ev) => ev.sourceId));
  const sources = SOURCE_CATALOG
    .filter((source) => usedSourceIds.has(source.id))
    .map((source) => ({
      id: source.id,
      name: source.name,
      owner: source.owner,
      sourceUrl: source.sourceUrl,
      status: source.status,
      reliability: source.reliability,
    }));

  const evidenceSummary = dossier.evidence.map((ev) => ({
    evidenceId: ev.id ?? `ev-${ev.sourceId}-${ev.collectedAt}`,
    sourceId: ev.sourceId,
    sourceUrl: ev.sourceUrl,
    collectedAt: ev.collectedAt,
    quote: ev.quote ?? "",
    confidence: ev.confidence,
  }));

  const payload: DossierExport = {
    exportedAt: new Date().toISOString(),
    dossier,
    sources,
    evidenceSummary,
  };

  return jsonResponse(payload);
}

