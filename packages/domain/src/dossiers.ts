import type { Evidence } from "./evidence";

export interface DossierSection {
  id: string;
  title: string;
  summary: string;
  evidenceIds: string[];
  riskLevel?: "low" | "medium" | "high" | "unknown";
}

export interface Dossier {
  id: string;
  title: string;
  subjectEntityId: string;
  createdAt: string;
  updatedAt: string;
  sections: DossierSection[];
  evidence: Evidence[];
}

