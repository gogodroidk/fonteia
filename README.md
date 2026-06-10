# Fonte.ia by Olli

Fonte.ia is a modular public-data intelligence platform for Brazil. It turns official/public sources, open APIs, public documents and government datasets into sourced, auditable, AI-assisted decisions.

Core promise:

> Dados publicos. Fonte oficial. Decisao inteligente.

## Product Context

- Master context: `docs/context/FONTEIA_MASTER_CONTEXT.md`
- Implementation plan: `docs/superpowers/plans/2026-06-10-fonteia-platform-implementation.md`
- Domain research: `docs/context/DOMAIN_RESEARCH_2026-06-10.md`

## Planned Apps

- `apps/web`: complete dashboard/cockpit.
- `apps/mobile`: mobile-first quick decisions, alerts and AI cards.
- `apps/api`: API gateway for product, public API and ingestion access.

## Planned Shared Packages

- `packages/domain`: shared entities, modules, evidence and dossier model.
- `packages/sources`: official/public source catalog and connector contracts.
- `packages/ui`: shared interface primitives.
- `packages/ai`: sourced answer engine.
- `packages/scoring`: module scoring engines.
- `packages/compliance`: LGPD, audit and retention helpers.

## Getting Started

```bash
corepack enable
corepack prepare pnpm@9.15.4 --activate
pnpm install
pnpm build
pnpm test
```

On Windows PowerShell, use `npm.cmd`/`pnpm.cmd` if script execution policy blocks `.ps1` shims.

