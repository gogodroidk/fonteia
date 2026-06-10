CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rls_auto_enable'
      AND p.pronargs = 0
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

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
CREATE INDEX IF NOT EXISTS idx_raw_records_source_run ON raw_records(source_run_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_records_source_external_unique
  ON raw_records(source_id, external_id)
  WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_raw_record ON documents(raw_record_id);
CREATE INDEX IF NOT EXISTS idx_entities_kind_name ON entities(kind, normalized_name);
CREATE INDEX IF NOT EXISTS idx_entities_cnpj ON entities(cnpj);
CREATE INDEX IF NOT EXISTS idx_entities_ibge_code ON entities(ibge_code);
CREATE INDEX IF NOT EXISTS idx_entities_attributes ON entities USING GIN(attributes);
CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_auction_lot_receita_unique
  ON entities((external_ids->>'receitaLotId'))
  WHERE kind = 'auction_lot' AND external_ids ? 'receitaLotId';
CREATE INDEX IF NOT EXISTS idx_entities_geometry ON entities USING GIST(geometry);
CREATE INDEX IF NOT EXISTS idx_entity_links_from ON entity_links(from_entity_id, relation);
CREATE INDEX IF NOT EXISTS idx_entity_links_to ON entity_links(to_entity_id, relation);
CREATE INDEX IF NOT EXISTS idx_evidence_source_collected ON evidence(source_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_document ON evidence(document_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_raw_kind_unique
  ON evidence(raw_record_id, kind)
  WHERE raw_record_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_claims_entity_label ON claims(entity_id, label);
CREATE INDEX IF NOT EXISTS idx_dossiers_subject_entity ON dossiers(subject_entity_id);
CREATE INDEX IF NOT EXISTS idx_entitlements_module ON entitlements(module_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_module ON usage_events(module_id);
CREATE INDEX IF NOT EXISTS idx_alerts_account_status ON alerts(account_id, status);
CREATE INDEX IF NOT EXISTS idx_alerts_module ON alerts(module_id);
CREATE INDEX IF NOT EXISTS idx_alerts_entity ON alerts(entity_id);
CREATE INDEX IF NOT EXISTS idx_alert_events_alert_created ON alert_events(alert_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_events_entity ON alert_events(entity_id);

ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON sources TO anon, authenticated;
GRANT SELECT ON modules TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

DROP POLICY IF EXISTS "Public source catalog is readable" ON sources;
CREATE POLICY "Public source catalog is readable"
  ON sources
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public module catalog is readable" ON modules;
CREATE POLICY "Public module catalog is readable"
  ON modules
  FOR SELECT
  TO anon, authenticated
  USING (true);

INSERT INTO modules (id, label, route, status, target_persona, promise)
VALUES
  ('leiloes', 'Leiloes', '/leiloes', 'active', 'Revendedores, lojistas e investidores de oportunidade', 'Encontrar lotes com margem, risco claro e evidencia oficial.'),
  ('licitacoes', 'Licitacoes', '/licitacoes', 'locked', 'Empresas que vendem para governo e consultorias B2G', 'Descobrir editais, precos, concorrentes e oportunidades publicas.'),
  ('empresas', 'Empresas', '/empresas', 'locked', 'Comercial, compliance, bancos, seguradoras e ERPs', 'Montar dossies CNPJ com sancoes, contratos, socios e evidencias.'),
  ('juridico', 'Juridico', '/juridico', 'locked', 'Advogados, escritorios, compliance e credito', 'Monitorar processos, DOU e riscos juridicos com fonte rastreavel.'),
  ('inpi', 'INPI', '/inpi', 'locked', 'Empreendedores, agencias, startups e advogados de PI', 'Avaliar marcas, classes, conflitos e prazos com dados do INPI.'),
  ('ambiental', 'Ambiental', '/ambiental', 'locked', 'Agro, bancos, seguradoras, ESG e compradores de commodities', 'Avaliar embargo, desmatamento, fogo, agua e risco territorial.'),
  ('politica', 'Politica', '/politica', 'locked', 'Cidadaos, jornalistas, pesquisadores e assessorias politicas', 'Cruzar votos, gastos, eleicoes, emendas, contratos e agendas.'),
  ('municipios', 'Municipios', '/municipios', 'locked', 'Consultorias, fornecedores publicos, bancos e jornalistas locais', 'Criar raio-x fiscal, social, politico e economico de municipios.'),
  ('api', 'API', '/api', 'locked', 'Desenvolvedores, ERPs, fintechs, govtechs e consultorias', 'Consumir dados publicos normalizados, com historico e webhooks.')
ON CONFLICT (id) DO UPDATE
SET label = EXCLUDED.label,
    route = EXCLUDED.route,
    status = EXCLUDED.status,
    target_persona = EXCLUDED.target_persona,
    promise = EXCLUDED.promise;

INSERT INTO sources (id, name, owner, source_url, docs_url, status, access_kind, reliability, modules, refresh_cadence, commercial_risk, notes)
VALUES
  ('receita-leiloes-sle', 'Receita Federal - Sistema de Leilao Eletronico', 'Receita Federal do Brasil', 'https://www25.receita.fazenda.gov.br/sle-sociedade/portal/editais-disponiveis', 'https://www.gov.br/receitafederal/pt-br/assuntos/leilao', 'fragile_operational', 'open', 'official_fragile', ARRAY['leiloes'], 'daily', 'medium', 'Portal publico oficial. Nao ha API publica documentada; tratar endpoints operacionais como frageis e usar cache/fallback.'),
  ('pncp-consulta', 'Portal Nacional de Contratacoes Publicas - API de Consulta', 'Governo Federal', 'https://pncp.gov.br/api/consulta/swagger-ui/index.html', 'https://www.gov.br/pncp/pt-br/acesso-a-informacao/dados-abertos', 'connected', 'open', 'official_stable', ARRAY['licitacoes','empresas','municipios'], 'daily', 'low', 'API oficial para consultas de contratacoes, atas, contratos e planos de contratacao.'),
  ('compras-gov-dados-abertos', 'Compras.gov.br - Dados Abertos', 'Ministerio da Gestao e da Inovacao em Servicos Publicos', 'https://dadosabertos.compras.gov.br/', 'https://www.gov.br/compras/pt-br/acesso-a-informacao/manuais/manual-dados-abertos/manual-api-compras.pdf', 'connected', 'open', 'official_stable', ARRAY['licitacoes','empresas','municipios'], 'daily', 'low', 'Dados de compras federais, fornecedores, itens, precos praticados e contratos.'),
  ('portal-transparencia-api', 'Portal da Transparencia - API de Dados', 'Controladoria-Geral da Uniao', 'https://portaldatransparencia.gov.br/api-de-dados', 'https://api.portaldatransparencia.gov.br/', 'integrating', 'open_with_token', 'official_stable', ARRAY['empresas','politica','municipios','licitacoes'], 'daily', 'low', 'Exige token por cadastro. Fonte forte para despesas, contratos, sancoes, beneficios e servidores.'),
  ('camara-dados-abertos', 'Camara dos Deputados - Dados Abertos', 'Camara dos Deputados', 'https://dadosabertos.camara.leg.br/', 'https://dadosabertos.camara.leg.br/swagger/api.html', 'integrating', 'open', 'official_stable', ARRAY['politica','juridico'], 'daily', 'low', 'Deputados, proposicoes, votacoes, comissoes, eventos e despesas parlamentares.'),
  ('senado-dados-abertos', 'Senado Federal - Dados Abertos', 'Senado Federal', 'https://legis.senado.leg.br/dadosabertos/api-docs/swagger-ui/index.html', 'https://www12.senado.leg.br/dados-abertos', 'integrating', 'open', 'official_stable', ARRAY['politica','juridico'], 'daily', 'low', 'Materias, tramitacao, autores, comissoes e normas do Senado/Congresso.'),
  ('tse-dados-abertos', 'TSE - Dados Abertos Eleitorais', 'Tribunal Superior Eleitoral', 'https://dadosabertos.tse.jus.br/', 'https://www.tse.jus.br/eleicoes/estatisticas/repositorio-de-dados-eleitorais-1', 'open_no_api', 'public_files', 'official_stable', ARRAY['politica','municipios'], 'manual', 'low', 'Dados eleitorais e repositorios oficiais. Muitos conjuntos sao arquivos, nao API transacional.'),
  ('cnj-datajud', 'CNJ DataJud - API Publica', 'Conselho Nacional de Justica', 'https://www.cnj.jus.br/sistemas/datajud/api-publica/', 'https://www.cnj.jus.br/sistemas/datajud/api-publica/', 'integrating', 'open', 'official_stable', ARRAY['juridico','empresas'], 'daily', 'medium', 'Metadados de processos judiciais. Requer cuidado com LGPD, escopo e expectativas de completude.'),
  ('inpi-dados-abertos', 'INPI - Dados Abertos', 'Instituto Nacional da Propriedade Industrial', 'https://www.gov.br/inpi/pt-br/acesso-a-informacao/dados-abertos', 'https://www.gov.br/inpi/pt-br/projetos-estrategicos/portal-de-servicos', 'integrating', 'public_files', 'official_fragile', ARRAY['inpi','empresas'], 'manual', 'medium', 'Dados abertos de marcas, patentes e outros servicos. Nova plataforma promete APIs JSON/XML ST.96.'),
  ('ibama-dados-abertos', 'IBAMA - Dados Abertos', 'Instituto Brasileiro do Meio Ambiente e dos Recursos Naturais Renovaveis', 'https://dadosabertos.ibama.gov.br/', 'https://dadosabertos.ibama.gov.br/', 'integrating', 'public_files', 'official_stable', ARRAY['ambiental','empresas'], 'monthly', 'low', 'Bases ambientais, incluindo embargos e autos. Formatos variam por conjunto.')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    owner = EXCLUDED.owner,
    source_url = EXCLUDED.source_url,
    docs_url = EXCLUDED.docs_url,
    status = EXCLUDED.status,
    access_kind = EXCLUDED.access_kind,
    reliability = EXCLUDED.reliability,
    modules = EXCLUDED.modules,
    refresh_cadence = EXCLUDED.refresh_cadence,
    commercial_risk = EXCLUDED.commercial_risk,
    notes = EXCLUDED.notes,
    updated_at = now();
