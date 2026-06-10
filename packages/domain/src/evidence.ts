export const EVIDENCE_KINDS = ["api_payload", "pdf_page", "html_page", "csv_row", "xml_node", "manual_note"] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  sourceId: string;
  sourceUrl: string;
  collectedAt: string;
  rawRecordId?: string;
  quote?: string;
  page?: number;
  path?: string;
  hash?: string;
  confidence: number;
}

export interface Claim {
  id: string;
  entityId: string;
  label: string;
  value: string | number | boolean | null;
  evidenceIds: string[];
  confidence: number;
  observedAt: string;
}

