import type { ModuleId } from "@fonteia/domain";

export type MobileRoute = "home" | "ask" | "modules" | "alerts";
export type MobilePriority = "info" | "warning" | "critical";

export interface MobileAction {
  id: string;
  label: string;
  route: MobileRoute;
  moduleId?: ModuleId;
}

export interface MobileEvidencePreview {
  sourceLabel: string;
  collectedAt: string;
  confidence: number;
}

export interface MobileAnswerCardModel {
  id: string;
  title: string;
  summary: string;
  moduleId: ModuleId;
  priority: MobilePriority;
  facts: string[];
  nextAction: string;
  evidence: MobileEvidencePreview;
  actions: MobileAction[];
}

export interface MobileModuleTileModel {
  id: ModuleId;
  label: string;
  statusLabel: "liberado" | "travado";
  promise: string;
  targetPersona: string;
  primaryAction: MobileAction;
}

export interface MobileAlertPreview {
  id: string;
  title: string;
  summary: string;
  moduleId: ModuleId;
  priority: MobilePriority;
  dueLabel?: string;
  action: MobileAction;
}

export interface MobileScreenModel {
  id: MobileRoute;
  title: string;
  eyebrow: string;
  primaryAction?: MobileAction;
}
