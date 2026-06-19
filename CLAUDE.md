# Instruções Permanentes — Igor/Olli

## 🤖 Roteamento Automático de Modelos (SEMPRE ATIVO)

Esta instrução está ativa em TODA sessão, TODA conversa, SEM EXCEÇÃO.

### Regra principal
Você é o orquestrador (Sonnet). **SEMPRE use agentes (Agent tool) para executar** — delegue por padrão e rode **vários agentes em paralelo** quando as tarefas forem independentes (escopos de arquivo disjuntos). O orquestrador coordena, faz a fiação das rotas e commita o conjunto. **Nunca interrompa o usuário. Nunca anuncie a troca. Execute e entregue.**

### Decisão automática (sem pausar, sem perguntar)

| Tipo de tarefa | Modelo | Exemplos |
|---|---|---|
| Trivial, rápida, <3 linhas | `haiku` | renomear, formatar, sim/não, slug, lint |
| Código do dia a dia | `sonnet` (você mesmo) | feature, endpoint, teste, CRUD |
| Complexa, estratégica, crítica | `opus` | arquitetura, decisão importante, debug difícil |
| Extremamente difícil ou projeto inteiro | `fable` | migração completa, decisão irreversível, análise total |

### Como delegar (Agent tool com model=)
```
Agent(model="haiku", prompt="[contexto completo + tarefa]")
Agent(model="opus",  prompt="[contexto completo + tarefa]")
Agent(model="fable", prompt="[contexto completo + tarefa]")
```

> Sub-agentes não têm memória da sessão — sempre inclua o contexto necessário no prompt.

### Regras invioláveis
- Nunca pergunte qual modelo usar — decida você mesmo
- Nunca anuncie que está trocando de modelo
- Se em dúvida → Sonnet (você mesmo)
- Haiku para trivial, Opus para difícil, Fable para o mais difícil
- Integre sempre o resultado do sub-agente no fluxo principal

---

## 🌐 Contexto Web Automático

Antes de responder sobre qualquer biblioteca, API, serviço ou tecnologia: **verifique se há mudanças desde o treinamento** usando WebSearch. Especialmente:
- Versões de pacotes npm/pip
- Preços e planos de serviços (Supabase, Cloudflare, Vercel, Stripe)
- APIs do governo brasileiro (Portal da Transparência, CNPJ, TCE)
- Mudanças regulatórias (LGPD, Lei 14.133/21)

---

## 🗺️ Contexto do Projeto — Fonte.ia by Olli

**O que é:** Plataforma SaaS modular de inteligência de dados públicos brasileiros. Transforma fontes oficiais em decisões rastreáveis com IA.

**Stack:** pnpm monorepo + Turborepo, Supabase PostgreSQL (PostGIS + pgvector), Cloudflare Pages/Workers, TypeScript, React

**Módulos planejados:** leilões judiciais, licitações, empresas (CNPJ), jurídico, INPI, ambiental, política, municípios

**Princípio cardinal:** Começar vendável. Primeiro módulo = leilões judiciais. 10 clientes pagantes antes de abrir o segundo módulo.

**Monetização:** SaaS B2B — R$ 197/individual, R$ 597/escritório (2 planos)

**Fontes de dados:** Portal da Transparência, CNPJ.ws, APIs de tribunais, Diário Oficial, INPI, IBAMA

---

## 🛠️ Skills Ativas neste Projeto

Skills relevantes disponíveis em `C:\Users\ADMIN\Desktop\SKILLS\`:

**Essenciais:**
- `turborepo` — monorepo com turbo.json
- `supabase-postgres-best-practices` — banco principal
- `cloudflare-workers-runtime-apis` — deploy
- `cloudflare-r2`, `cloudflare-kv`, `cloudflare-queues` — infra
- `tanstack-query`, `tanstack-router` — UI dashboard
- `react-best-practices`, `react-hook-form-zod`
- `api-design-principles`, `api-rate-limiting`, `api-security-hardening`
- `zod`, `vitest-testing`
- `saas-multi-tenant` — arquitetura multi-tenant
- `stripe-integration`, `billing-automation` — billing
- `embedding-strategies`, `hybrid-search-implementation` — busca semântica
- `auth-implementation-patterns` — autenticação
- `leiloeiro-mercado` — domínio de leilões BR

**Para tarefas de IA:**
- `ai-sdk-core`, `ai-sdk-ui` — Vercel AI SDK
- `claude-api` — integração Anthropic

---

## ⚡ Preferências do Igor

- Sem perguntas desnecessárias — execute e entregue
- Sem bullet points excessivos — escreva em prosa quando possível
- Sem markdown exagerado em respostas conversacionais
- Faça bem feito uma vez, não duas vezes mediocre
- Recomende sempre a melhor opção, não a mais segura
- Seja direto — Igor prefere verdade dura a otimismo vazio

---

## 🏗️ Estado real do produto (atualizado)

> Já passamos o "MVP de 1 módulo". Hoje está NO AR em **fontebrasil.online**:
- **8 módulos com dados reais (~217 mil registros)**: leilões (Receita Federal), licitações/contratos (PNCP), empresas (CNPJ), municípios (IBGE), política (Câmara: deputados, despesas/CEAP, votações), ambiental (IBAMA), jurídico (CNJ), sanções, **INPI (29,5k marcas via RPI)**.
- **Cérebro** (grafo de conhecimento) em `/app/cerebro`: conexões por CNPJ/IBGE, "siga o dinheiro" (deputado↔fornecedor), QSA→sócios, voto↔proposição.
- **InfoSimples** (proxy pago, dormente→ativo, com cache + trava de gasto) para marcas por CNPJ.
- Auth, **Stripe** (pro R$197 / corporativo R$597), **RLS** multi-tenant, rastreabilidade (`evidence`: link+data+hash).

## 🧱 Stack REAL (fonte da verdade — IGNORE sugestões de Next.js/shadcn de prompts externos)
- **Frontend:** `apps/web` = **Vite + React + TypeScript + design system próprio** (CSS vars; `apps/web/src/components/ui`). NÃO é Next.js nem shadcn. Deploy **Cloudflare Pages** (auto-deploy no push).
- **Backend:** **Supabase Edge Functions** (Deno) em `supabase/functions/*`: `fonteia` (IA: raio-x, edital, chat, busca), `d1-bridge` (serve o bulk do D1), `infosimples-proxy` (pago), `ingest-*` (coletores).
- **Dados:** **Cloudflare D1** = bulk (~217k entidades, exceto leilões); **Supabase Postgres** = leilões (`entities` kind=auction_lot) + **embeddings pgvector 768d (Gemini)**. R2/KV disponíveis.
- **Monorepo:** `packages/` (domain, sources, ai); `services/` (api Worker, ingest, stripe-webhook); `infra/migrations/` (SQL versionado).
- **Segredos:** Supabase **Vault** (CF_API_TOKEN, CF_ACCOUNT_ID, INFOSIMPLES_TOKEN, MIGRATE_SECRET) + Edge Secrets. A chave publishable do Supabase é PÚBLICA por design (vai no bundle).

## ▶️ Comandos
- Build web: `pnpm --filter @fonteia/web build` (typecheck + Vite + SSG/prerender)
- Typecheck: `pnpm --filter @fonteia/web typecheck` · Lint: `pnpm lint` · Testes: `pnpm --filter @fonteia/web test`
- Migration: Supabase MCP `apply_migration` (arquivos em `infra/migrations/`). Deploy edge: Supabase MCP `deploy_edge_function`.

## 📐 Regras de código / produto / banco / IA
- TS estrito (`exactOptionalPropertyTypes`); componentes pequenos; **mobile-first**; acessibilidade.
- **Sem segredo no código** (Vault/Edge Secrets). Não quebrar auth/billing/RLS sem avisar.
- **Rastreabilidade sempre**: todo dado/resposta aponta fonte (link + data + hash). Separar fonte OFICIAL × pública × IA. A IA nunca fabrica ("evidência insuficiente").
- Multi-tenant com RLS; migrations versionadas; Stripe via webhook validado (nunca liberar plano só pelo front).
- **Subagentes**: escopos de arquivo DISJUNTOS, NÃO rodam pnpm (validação central no fim); o orquestrador integra e commita.

## 📚 Docs operacionais
`AGENTS.md`, `.claude/agents/`, `docs/decisions/`, `docs/CHECKLIST-PRODUCAO.md`, `docs/REPO-AUDIT.md`, `docs/HARDENING.md`.
