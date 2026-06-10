import type { ModuleId } from "./modules";

export const SOURCE_STATUSES = [
  "connected",
  "integrating",
  "open_no_api",
  "restricted_government",
  "paid_or_credentialed",
  "fragile_operational",
  "complementary_non_government",
  "deprecated",
] as const;

export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export type SourceAccessKind =
  | "open"
  | "open_with_token"
  | "public_files"
  | "restricted"
  | "paid"
  | "credentialed"
  | "unknown";

export type ReliabilityLevel = "official_stable" | "official_fragile" | "complementary" | "experimental";

export interface PublicSource {
  id: string;
  name: string;
  owner: string;
  sourceUrl: string;
  docsUrl?: string;
  status: SourceStatus;
  accessKind: SourceAccessKind;
  reliability: ReliabilityLevel;
  modules: ModuleId[];
  refreshCadence: "realtime" | "hourly" | "daily" | "weekly" | "monthly" | "manual" | "unknown";
  commercialRisk: "low" | "medium" | "high";
  notes: string;
}

