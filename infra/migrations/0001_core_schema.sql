CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner TEXT NOT NULL,
  source_url TEXT NOT NULL,
  docs_url TEXT,
  status TEXT NOT NULL,
  access_kind TEXT NOT NULL,
  reliability TEXT NOT NULL,
  modules TEXT[] NOT NULL DEFAULT '{}',
  refresh_cadence TEXT NOT NULL DEFAULT 'unknown',
  commercial_risk TEXT NOT NULL DEFAULT 'medium',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT NOT NULL REFERENCES sources(id),
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  records_seen INTEGER NOT NULL DEFAULT 0,
  records_inserted INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS raw_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT NOT NULL REFERENCES sources(id),
  source_run_id UUID REFERENCES source_runs(id),
  source_url TEXT NOT NULL,
  external_id TEXT,
  payload JSONB NOT NULL,
  content_hash TEXT NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id TEXT NOT NULL REFERENCES sources(id),
  raw_record_id UUID REFERENCES raw_records(id),
  url TEXT NOT NULL,
  title TEXT,
  mime_type TEXT,
  storage_key TEXT,
  extracted_text TEXT,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  cnpj TEXT,
  cpf_hash TEXT,
  ibge_code TEXT,
  external_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  geometry GEOMETRY,
  embedding VECTOR(1536),
  source_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entity_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entity_id UUID NOT NULL REFERENCES entities(id),
  to_entity_id UUID NOT NULL REFERENCES entities(id),
  relation TEXT NOT NULL,
  evidence_ids UUID[] NOT NULL DEFAULT '{}',
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES sources(id),
  source_url TEXT NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL,
  raw_record_id UUID REFERENCES raw_records(id),
  document_id UUID REFERENCES documents(id),
  quote TEXT,
  page INTEGER,
  path TEXT,
  content_hash TEXT,
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id),
  label TEXT NOT NULL,
  value JSONB,
  evidence_ids UUID[] NOT NULL DEFAULT '{}',
  confidence NUMERIC(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dossiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_entity_id UUID REFERENCES entities(id),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence_ids UUID[] NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS modules (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  route TEXT NOT NULL,
  status TEXT NOT NULL,
  target_persona TEXT NOT NULL,
  promise TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  module_id TEXT NOT NULL REFERENCES modules(id),
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  user_id TEXT,
  module_id TEXT REFERENCES modules(id),
  event_type TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id TEXT NOT NULL,
  user_id TEXT,
  module_id TEXT NOT NULL REFERENCES modules(id),
  entity_id UUID REFERENCES entities(id),
  alert_type TEXT NOT NULL,
  query JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID NOT NULL REFERENCES alerts(id),
  entity_id UUID REFERENCES entities(id),
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  evidence_ids UUID[] NOT NULL DEFAULT '{}',
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sources_status ON sources(status);
CREATE INDEX IF NOT EXISTS idx_sources_modules ON sources USING GIN(modules);
CREATE INDEX IF NOT EXISTS idx_source_runs_source_started ON source_runs(source_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_records_source_collected ON raw_records(source_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_records_external ON raw_records(source_id, external_id);
CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_entities_kind_name ON entities(kind, normalized_name);
CREATE INDEX IF NOT EXISTS idx_entities_cnpj ON entities(cnpj);
CREATE INDEX IF NOT EXISTS idx_entities_ibge_code ON entities(ibge_code);
CREATE INDEX IF NOT EXISTS idx_entities_attributes ON entities USING GIN(attributes);
CREATE INDEX IF NOT EXISTS idx_entities_geometry ON entities USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_entity_links_from ON entity_links(from_entity_id, relation);
CREATE INDEX IF NOT EXISTS idx_entity_links_to ON entity_links(to_entity_id, relation);
CREATE INDEX IF NOT EXISTS idx_evidence_source_collected ON evidence(source_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_claims_entity_label ON claims(entity_id, label);
CREATE INDEX IF NOT EXISTS idx_alerts_account_status ON alerts(account_id, status);
CREATE INDEX IF NOT EXISTS idx_alert_events_alert_created ON alert_events(alert_id, created_at DESC);

