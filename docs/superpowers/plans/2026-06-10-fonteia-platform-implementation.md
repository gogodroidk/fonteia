# Fonte.ia Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Fonte.ia by Olli as a modular mobile-first and web-complete SaaS that turns Brazilian public data into sourced, auditable, AI-assisted decisions across leiloes, licitacoes, empresas, juridico, INPI, ambiental, politica, municipios, and API products.

**Architecture:** Build one shared data and intelligence platform, then expose it through multiple locked/unlocked modules. Every module uses the same source catalog, ingestion layer, entity graph, evidence store, search, AI answer engine, alert engine, billing, and permissions.

**Tech Stack:** Next.js, React, Expo/React Native, TypeScript, Node/NestJS or Python/FastAPI, Postgres, PostGIS, pgvector, OpenSearch, Redis, object storage, queue workers, LLM API, Stripe/Mercado Pago, Sentry, OpenTelemetry.

---

## Product Shape

Fonte.ia is not a set of unrelated apps. It is one platform with many revenue surfaces:

- Leiloes: best lots, margin score, risk and edital reader.
- Licitacoes: public opportunities, edital analysis, price intelligence.
- Empresas: CNPJ dossier, sanctions, contracts, public payments, INPI, lawsuits.
- Juridico: DataJud, DOU, legal monitoring, process summaries.
- INPI: brand availability, similar marks, Nice classes, monitoring.
- Ambiental: embargos, deforestation, fire, water, conservation units, maps.
- Politica: politicians, elections, votes, expenses, agendas, amendments.
- Municipios: fiscal, social, transfers, contracts, works, suppliers.
- API: normalized endpoints, webhooks, evidence and history.

## Recommended Monorepo Structure

```text
apps/
  web/                         Next.js web cockpit
  mobile/                      Expo mobile app
  api/                         Public/private API gateway
packages/
  config/                      Shared eslint, tsconfig, env schema
  ui/                          Shared design system
  domain/                      Shared entity types and business rules
  sources/                     Source catalog and connector contracts
  ai/                          Prompt templates, RAG, answer formatting
  scoring/                     Scoring engines by module
  compliance/                  LGPD, audit, retention helpers
services/
  ingest/                      Workers for APIs, files, PDFs, pages
  search-indexer/              OpenSearch indexing workers
  alerting/                    Monitors, notification rules, webhooks
  billing/                     Plan, module entitlement, usage metering
infra/
  docker/                      Local services
  migrations/                  Database migrations
  observability/               Logs, traces, dashboards
docs/
  context/                     Product context and decisions
  sources/                     Source catalog docs
  architecture/                Technical architecture notes
  superpowers/plans/           Implementation plans
```

## Core Data Model

Start with these tables:

- `sources`: public sources, API docs, access status, owner, reliability.
- `source_runs`: each ingestion run with status, timestamps, errors.
- `raw_records`: immutable raw payloads, file refs, hashes, collected_at.
- `documents`: PDFs, HTML pages, XML, CSV metadata and extracted text.
- `entities`: normalized people, companies, politicians, municipalities, lots, processes, marks, contracts, properties.
- `entity_links`: graph edges between entities with source evidence.
- `evidence`: exact proof for a claim, including source URL, line/page/payload path.
- `claims`: normalized facts extracted from raw records with confidence.
- `dossiers`: saved reports assembled from entities, claims and evidence.
- `alerts`: user-defined monitors.
- `alert_events`: triggered alerts with evidence.
- `modules`: available modules and status.
- `entitlements`: user/account access to modules.
- `usage_events`: API calls, AI answers, exports, reports and overages.

## Source Status Taxonomy

Each source must have one status:

- `connected`: working connector exists.
- `integrating`: planned or in progress.
- `open_no_api`: public files/pages but no stable API.
- `restricted_government`: Conecta/gov-to-gov or similar.
- `paid_or_credentialed`: usable with contract, token or certificate.
- `fragile_operational`: endpoint exists but is undocumented or unstable.
- `complementary_non_government`: useful non-official source such as MapBiomas.
- `deprecated`: no longer viable.

## MVP Scope

The first paid MVP should be Fonte.ia Leiloes with visible locked modules.

Included:

- landing/auth;
- module dashboard with locked cards;
- source catalog page;
- Receita leilao radar;
- edital/lote detail;
- lot opportunity score;
- AI edital summary;
- alert reminders;
- saved lists;
- basic billing;
- evidence display.

Excluded:

- automated bidding;
- gov.br/e-CAC login;
- full API product;
- full juridico/process search;
- all environmental geospatial processing;
- complex enterprise team management.

## Task 1: Repository Bootstrap

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.env.example`
- Create: `README.md`
- Create: `apps/web/package.json`
- Create: `apps/api/package.json`
- Create: `apps/mobile/package.json`
- Create: `packages/domain/package.json`
- Create: `packages/sources/package.json`

- [x] Step 1: Initialize a pnpm/turborepo monorepo with web, mobile, api and shared packages.
- [x] Step 2: Add root scripts: `dev`, `build`, `test`, `lint`, `typecheck`, `format`.
- [x] Step 3: Add `.env.example` with database, storage, search, Redis, AI, billing and source-token placeholders.
- [x] Step 4: Run `pnpm install`.
- [x] Step 5: Run `pnpm build` and confirm all empty apps/packages build or no-op cleanly.
- [x] Step 6: Commit with `chore: bootstrap fonteia monorepo`.

## Task 2: Shared Domain Model

**Files:**

- Create: `packages/domain/src/entities.ts`
- Create: `packages/domain/src/sources.ts`
- Create: `packages/domain/src/modules.ts`
- Create: `packages/domain/src/evidence.ts`
- Create: `packages/domain/src/dossiers.ts`
- Create: `packages/domain/src/index.ts`
- Test: `packages/domain/src/domain.test.ts`

- [x] Step 1: Define TypeScript enums for module ids: `leiloes`, `licitacoes`, `empresas`, `juridico`, `inpi`, `ambiental`, `politica`, `municipios`, `api`.
- [x] Step 2: Define `SourceStatus`, `SourceAccessKind`, `ReliabilityLevel`, `EntityKind`, `EvidenceKind`.
- [x] Step 3: Define entity interfaces for company, person, politician, municipality, auction lot, bidding opportunity, legal process, trademark, environmental area and public contract.
- [x] Step 4: Define evidence shape with `sourceId`, `sourceUrl`, `collectedAt`, `rawRecordId`, `quote`, `page`, `hash`, `confidence`.
- [x] Step 5: Write tests that validate each module has a label, route, icon name, locked state and target persona.
- [x] Step 6: Run domain tests.
- [x] Step 7: Commit with `chore: bootstrap fonteia monorepo`.

## Task 3: Database And Migrations

**Files:**

- Create: `infra/migrations/0001_core_schema.sql`
- Create: `apps/api/src/db/client.ts`
- Create: `apps/api/src/db/schema.ts`
- Test: `apps/api/src/db/schema.test.ts`

- [x] Step 1: Create Postgres schema for `sources`, `source_runs`, `raw_records`, `documents`, `entities`, `entity_links`, `evidence`, `claims`, `dossiers`, `modules`, `entitlements`, `usage_events`, `alerts`, `alert_events`.
- [x] Step 2: Enable PostGIS and pgvector extensions.
- [x] Step 3: Add indexes for entity kind/name, CNPJ, municipality code, source status, collected_at, and geospatial geometry.
- [x] Step 4: Add a migration runner script.
- [x] Step 5: Add a schema smoke test that inserts one source, one raw record, one entity and one evidence record.
- [x] Step 6: Run migration on Supabase project `pwiuiihsyazghdsrpshg`; local runner remains available when a local `DATABASE_URL` is configured.
- [x] Step 7: Commit with `feat(data): add core schema and source catalog`.

## Task 4: Source Catalog

**Files:**

- Create: `packages/sources/src/catalog.ts`
- Create: `packages/sources/src/registry.ts`
- Create: `docs/sources/source-catalog.md`
- Test: `packages/sources/src/catalog.test.ts`

- [x] Step 1: Register initial sources: Receita Leiloes, PNCP, Compras.gov.br, Portal da Transparencia, Camara, Senado, TSE, DataJud, INPI, IBAMA, INPE TerraBrasilis, MapBiomas, ANA, Siconfi, Transferegov, BNDES, DOU/INLABS.
- [x] Step 2: For each source include owner, official URL, docs URL, access kind, status, refresh cadence, module coverage and commercial risk.
- [x] Step 3: Add tests requiring every source to have status, source URL, owner and at least one module.
- [x] Step 4: Generate `docs/sources/source-catalog.md` from catalog data.
- [x] Step 5: Commit with `feat(data): add core schema and source catalog`.

## Task 5: API Gateway Skeleton

**Files:**

- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/routes/health.ts`
- Create: `apps/api/src/routes/modules.ts`
- Create: `apps/api/src/routes/sources.ts`
- Create: `apps/api/src/routes/search.ts`
- Create: `apps/api/src/routes/dossiers.ts`
- Test: `apps/api/src/routes/*.test.ts`

- [x] Step 1: Add HTTP server with health endpoint.
- [x] Step 2: Add `/modules` returning module cards and locked/unlocked state.
- [x] Step 3: Add `/sources` returning source catalog with status filters.
- [x] Step 4: Add `/search` placeholder that searches only seeded sample entities.
- [x] Step 5: Add `/dossiers/:entityId` placeholder assembled from sample claims and evidence.
- [x] Step 6: Add route tests for health, modules, sources and sample dossier.
- [x] Step 7: Commit with `feat(api): add gateway skeleton`.

## Task 6: Web Product Shell

**Files:**

- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/modules/page.tsx`
- Create: `apps/web/src/app/sources/page.tsx`
- Create: `apps/web/src/app/search/page.tsx`
- Create: `apps/web/src/components/module-card.tsx`
- Create: `apps/web/src/components/source-status-badge.tsx`
- Create: `apps/web/src/components/evidence-panel.tsx`
- Test: `apps/web/src/app/page.test.tsx`

- [x] Step 1: Build a clean dashboard-first home, not a marketing-only page.
- [x] Step 2: Show module cards: Leiloes active, all other modules visible and locked.
- [x] Step 3: Add source catalog page with status filters.
- [x] Step 4: Add universal search page with a question input and structured answer card placeholder.
- [x] Step 5: Add evidence panel component used by all answers.
- [x] Step 6: Test module cards and source status badges.
- [x] Step 7: Connect the dashboard to live Leiloes data with fallback order `API -> Supabase REST -> local samples`.
- [x] Step 8: Validate desktop and mobile rendering against real Supabase lots.
- [x] Step 9: Commit with `feat(web): add fonteia dashboard shell`.

## Task 7: Mobile Product Shell

**Files:**

- Create: `apps/mobile/app.json`
- Create: `apps/mobile/src/App.tsx`
- Create: `apps/mobile/src/screens/HomeScreen.tsx`
- Create: `apps/mobile/src/screens/AskScreen.tsx`
- Create: `apps/mobile/src/screens/ModulesScreen.tsx`
- Create: `apps/mobile/src/screens/AlertsScreen.tsx`
- Create: `apps/mobile/src/components/AnswerCard.tsx`
- Create: `apps/mobile/src/components/ModuleTile.tsx`

- [x] Step 1: Build mobile home with module tiles, recent dossiers and alert preview.
- [x] Step 2: Build ask screen with text and voice-ready UI, returning card-based answers.
- [x] Step 3: Build modules screen showing active and locked modules.
- [x] Step 4: Build alerts screen with example deadline and monitoring alerts.
- [x] Step 5: Keep the mobile app focused on quick decisions and push-style usage.
- [x] Step 6: Commit with `feat(mobile): add mobile-first app shell`.

## Task 8: Leiloes Connector MVP

**Files:**

- Create: `packages/sources/src/connectors/receita-leiloes.ts`
- Create: `services/ingest/src/jobs/ingest-receita-leiloes.ts`
- Create: `packages/scoring/src/leiloes.ts`
- Create: `apps/api/src/routes/leiloes.ts`
- Test: `packages/sources/src/connectors/receita-leiloes.test.ts`
- Test: `packages/scoring/src/leiloes.test.ts`

- [x] Step 1: Implement connector for public Receita leilao data using official public pages/endpoints where available.
- [x] Step 2: Mark undocumented endpoints as `fragile_operational` and cache responses.
- [x] Step 3: Store raw payloads before normalization in `raw_records`, normalize lots into `entities`, and write evidence rows tied to raw records.
- [x] Step 4: Normalize edital, lot number, city, UF, minimum bid, proposal deadline, session date, PF/PJ eligibility, image URL and source link.
- [x] Step 5: Add score function using margin potential, liquidity, logistics distance, restrictions, deadline urgency and edital risk.
- [x] Step 6: Expose `/leiloes/lotes`, `/leiloes/lotes/:id`, `/leiloes/lotes/:id/score`.
- [x] Step 7: Commit with `feat(leiloes): add receita connector and scoring`.

## Task 9: AI Answer Engine

**Files:**

- Create: `packages/ai/src/answer-engine.ts`
- Create: `packages/ai/src/prompts.ts`
- Create: `packages/ai/src/citations.ts`
- Create: `apps/api/src/routes/ask.ts`
- Test: `packages/ai/src/answer-engine.test.ts`

- [x] Step 1: Define answer format: summary, key facts, risk/opportunity, next actions, evidence.
- [x] Step 2: Require every factual answer to include evidence references.
- [x] Step 3: Add guardrails: no legal advice, no official-government impersonation, no automated bidding.
- [x] Step 4: Implement retrieval from entities, claims and evidence.
- [x] Step 5: Add `/ask` endpoint that accepts question and optional module/entity context.
- [x] Step 6: Test that unsupported claims are rejected or marked as unknown.
- [x] Step 7: Commit with `feat(ai): add sourced answer engine`.

## Task 10: Alerts And Cross-Sell

**Files:**

- Create: `services/alerting/src/rules.ts`
- Create: `services/alerting/src/dispatcher.ts`
- Create: `apps/api/src/routes/alerts.ts`
- Create: `apps/web/src/app/alerts/page.tsx`
- Test: `services/alerting/src/rules.test.ts`

- [x] Step 1: Add alert types: deadline, source update, entity change, new match, risk increase.
- [x] Step 2: Add Leiloes alerts for proposal deadline, session, payment and withdrawal.
- [x] Step 3: Add locked cross-sell suggestions: "Analyze this seller as company", "Check related sanctions", "Monitor municipality", "Search DOU".
- [x] Step 4: Add notification preferences.
- [x] Step 5: Commit with `feat(alerts): add monitoring and cross-sell hooks`.

Note: backend alerting and API route are implemented. The web alerts page is intentionally deferred until the web dashboard visual direction is designed and approved.

## Task 11: Billing And Module Entitlements

**Files:**

- Create: `services/billing/src/plans.ts`
- Create: `services/billing/src/entitlements.ts`
- Create: `apps/api/src/routes/billing.ts`
- Create: `apps/web/src/app/billing/page.tsx`
- Test: `services/billing/src/entitlements.test.ts`

- [x] Step 1: Define plans: Free, Individual, Pro, Business, Enterprise, API.
- [x] Step 2: Map each plan to modules, query quotas, AI quotas, exports and alerts.
- [x] Step 3: Add entitlement checks to module routes.
- [x] Step 4: Keep locked modules visible with upgrade CTA.
- [x] Step 5: Add usage metering for AI answers, reports, API calls and exports.
- [x] Step 6: Commit with `feat(billing): add module entitlements`.

## Task 12: Next Modules After MVP

Implement each module as a vertical slice using the same pattern: source connector, raw storage, normalizer, entity links, score, API route, web dashboard, mobile quick view, alerts, evidence.

Priority order:

- [ ] Empresas: Receita CNPJ, sanctions, public contracts.
- [ ] Licitacoes: PNCP, Compras.gov.br, DOU.
- [ ] Politica: TSE, Camara, Senado, Portal da Transparencia, e-Agendas.
- [ ] INPI: open data, beta services platform, brand similarity.
- [ ] Ambiental: IBAMA, INPE, MapBiomas, ANA, ICMBio.
- [ ] Juridico: DataJud, DOU, LexML, optional private APIs.
- [ ] Municipios: IBGE, Siconfi, Transferegov, OpenDataSUS, INEP.
- [ ] API: developer portal, keys, docs, usage billing.

## Verification Checklist

- [ ] Every source has status and source URL.
- [ ] Every answer has evidence or says it cannot verify.
- [x] Locked modules are visible but not misleading.
- [x] Mobile supports quick decisions without requiring desktop.
- [x] Web supports deep dashboard analysis.
- [x] Raw records are stored before normalized claims.
- [ ] LGPD risks are reviewed before exposing personal data.
- [ ] Receita leilao MVP does not automate e-CAC or bidding.
- [ ] Undocumented endpoints are marked fragile and cached.
- [ ] User can export dossie with source list and collection dates.

## Execution Strategy

Use subagent-driven development once implementation begins:

- Worker 1: monorepo/bootstrap and shared domain.
- Worker 2: API/database/source catalog.
- Worker 3: web dashboard shell.
- Worker 4: mobile app shell.
- Worker 5: Leiloes connector and scoring.
- Worker 6: AI/evidence answer engine.
- Worker 7: billing/entitlements and alerts.

Review and merge one vertical slice at a time. Do not start all modules in parallel until the source/entity/evidence model is stable.

## First Build Milestone

Milestone name: Fonte.ia Leiloes Alpha

Definition:

- user can open web dashboard;
- see all modules;
- access Leiloes;
- browse lots;
- open lot detail;
- see opportunity score;
- ask a question about the lot/editais;
- see official evidence;
- save lot;
- create deadline alert;
- see locked cross-sell modules.

This milestone proves the core loop: public source -> normalized entity -> score -> AI explanation -> evidence -> alert -> upgrade path.
