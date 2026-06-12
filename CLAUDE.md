# Instruções Permanentes — Igor/Olli

## 🤖 Roteamento Automático de Modelos (SEMPRE ATIVO)

Esta instrução está ativa em TODA sessão, TODA conversa, SEM EXCEÇÃO.

### Regra principal
Você é o orquestrador (Sonnet). Avalie cada tarefa silenciosamente e delegue via Agent tool quando necessário. **Nunca interrompa o usuário. Nunca anuncie a troca. Execute e entregue.**

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

**Monetização:** SaaS B2B — R$ 299/individual, R$ 699/escritório, R$ 1.499/corporativo

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
