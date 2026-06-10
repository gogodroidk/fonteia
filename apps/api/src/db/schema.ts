export const CORE_TABLES = [
  "sources",
  "source_runs",
  "raw_records",
  "documents",
  "entities",
  "entity_links",
  "evidence",
  "claims",
  "dossiers",
  "modules",
  "entitlements",
  "usage_events",
  "alerts",
  "alert_events",
] as const;

export type CoreTable = (typeof CORE_TABLES)[number];

export const REQUIRED_EXTENSIONS = ["postgis", "vector"] as const;

export const REQUIRED_INDEXES = [
  "idx_sources_status",
  "idx_sources_modules",
  "idx_source_runs_source_started",
  "idx_raw_records_source_collected",
  "idx_raw_records_external",
  "idx_raw_records_source_run",
  "idx_raw_records_source_external_unique",
  "idx_documents_source",
  "idx_documents_raw_record",
  "idx_entities_kind_name",
  "idx_entities_cnpj",
  "idx_entities_ibge_code",
  "idx_entities_attributes",
  "idx_entities_auction_lot_receita_unique",
  "idx_entities_geometry",
  "idx_entity_links_from",
  "idx_entity_links_to",
  "idx_evidence_source_collected",
  "idx_evidence_document",
  "idx_evidence_raw_kind_unique",
  "idx_claims_entity_label",
  "idx_dossiers_subject_entity",
  "idx_entitlements_module",
  "idx_usage_events_module",
  "idx_alerts_account_status",
  "idx_alerts_module",
  "idx_alerts_entity",
  "idx_alert_events_alert_created",
  "idx_alert_events_entity",
] as const;

export const SCHEMA_CONTRACT = {
  tables: CORE_TABLES,
  extensions: REQUIRED_EXTENSIONS,
  indexes: REQUIRED_INDEXES,
  rawBeforeNormalized: ["raw_records", "evidence", "claims", "entities"],
} as const;
