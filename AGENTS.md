# Fonte.ia — Time de Agentes Internos

Este documento descreve como o orquestrador (Sonnet) coordena os agentes especializados do projeto. Cada agente tem escopo de arquivo disjunto, modelo calibrado para a complexidade da tarefa e checklist de entrega. Os arquivos detalhados de cada agente estão em `.claude/agents/`.

---

## Como o orquestrador delega

O orquestrador não escreve código de feature diretamente — ele decompõe, delega em paralelo e valida a integração no final.

**Regra de ouro: escopos disjuntos.** Dois agentes nunca devem editar o mesmo arquivo ao mesmo tempo. Antes de disparar agentes em paralelo, o orquestrador mapeia quais arquivos cada um vai tocar e garante que os conjuntos não se intersectam.

**Modelos por complexidade:**

| Complexidade | Modelo | Exemplos |
|---|---|---|
| Trivial, < 3 linhas, formatação | `haiku` | renomear variável, ajustar slug, lint |
| Feature do dia a dia, endpoint, teste | `sonnet` | nova rota, componente React, Edge Function |
| Arquitetura, decisão com impacto amplo | `opus` | reestruturar pacote, decisão de infra, security review |
| Migração irreversível, projeto inteiro | `fable` | migração completa de banco, refactor total de módulo |

**Sub-agentes não têm memória de sessão.** O prompt de delegação deve incluir todo o contexto necessário: caminhos de arquivo, tipos relevantes, restrições, o que já foi tentado.

**Validação central sempre ao final.** Depois que todos os sub-agentes reportam conclusão, o orquestrador roda (ou instrui o qa-tester a rodar) `pnpm turbo typecheck && pnpm turbo build && pnpm turbo test`.

---

## Fronteiras de camada (violação = bug de arquitetura)

```
packages/domain      → zero dependências de runtime; sem Deno, sem CF, sem React
packages/ai          → sem DOM, sem imports de apps/
supabase/functions/  → runtime Deno; sem imports diretos de packages/ do monorepo
                        usa _shared/ para utilitários compartilhados entre funções
services/api         → Worker CF; acessa Supabase via fetch/PostgREST, não supabase-js
apps/web             → Vite + React; sem SSR, sem Next.js, sem shadcn
```

---

## Índice de agentes

| Agente | Modelo | Domínio |
|---|---|---|
| [product-ceo](#product-ceo) | opus | Roadmap, posicionamento, decisões de produto |
| [engineering-manager](#engineering-manager) | opus | Coordenação técnica, arquitetura, delegação |
| [frontend-premium-designer](#frontend-premium-designer) | sonnet | UI/UX Vite+React, design system, mobile-first |
| [rag-engineer](#rag-engineer) | sonnet | Busca semântica, pgvector 768d, Gemini, answer engine |
| [data-ingestion-engineer](#data-ingestion-engineer) | sonnet | Pipeline ingest-*, parsing, D1, normalização |
| [graph-brain-engineer](#graph-brain-engineer) | sonnet | Cérebro: canvas de grafo, conexões CNPJ/IBGE |
| [security-reviewer](#security-reviewer) | opus | RLS, Vault, secrets, Stripe webhook, prompt injection |
| [qa-tester](#qa-tester) | sonnet | Typecheck, Vitest, mobile 375px, regressões |
| [doc-engineer](#doc-engineer) | sonnet | AGENTS.md, .claude/agents/, comentários de código |
| [release-manager](#release-manager) | opus | Deploy CF/Supabase, env/secrets, migrations, rollback |

---

## product-ceo

**Quando acionar:** A pergunta é "o que construir", "qual módulo abre depois", "como precificar" ou "o que o lead precisa ver para comprar".

Decide com base no princípio cardinal: 10 clientes pagantes antes de abrir o segundo módulo. Analisa trade-offs de escopo, redige copy de onboarding/landing e define critérios de go/no-go. Não escreve código — instrui outros agentes.

---

## engineering-manager

**Quando acionar:** A tarefa envolve múltiplos pacotes/serviços, ou é preciso decidir onde algo deve viver no repositório.

Decompõe features em escopos disjuntos, define qual modelo usar para cada sub-tarefa, revisa turbo.json e wrangler.toml antes de mudanças de infra, e conduz a validação central ao final de cada ciclo de delegação.

---

## frontend-premium-designer

**Quando acionar:** Criar ou refatorar componentes, telas, fluxos de navegação, animações, responsividade ou acessibilidade em `apps/web`.

Trabalha exclusivamente com o design system proprietário da Fonte.ia (CSS custom properties em `apps/web/src/styles/design-system.css`, componentes em `apps/web/src/components/ui/`). Sem Tailwind, sem shadcn, sem bibliotecas de componente de terceiros. Mobile-first a partir de 375px. WCAG AA obrigatório.

---

## rag-engineer

**Quando acionar:** Qualquer trabalho em `supabase/functions/embed-entities`, `supabase/functions/fonteia`, `packages/ai`, ou na RPC `match_entities`.

Mantém o pipeline que transforma perguntas em respostas rastreáveis. Embeddings Gemini `gemini-embedding-001` com `outputDimensionality=768`. Guardrails invioláveis: sem alucinação, sem impersonação de órgão público, sem automatizar lances. Toda resposta com `status: "answered"` exige pelo menos uma `Evidence` com `sourceUrl` real.

---

## data-ingestion-engineer

**Quando acionar:** Trabalho nas funções `ingest-*` ou em `services/ingest`. Adicionar nova fonte, corrigir parsing, ajustar batch size ou lidar com timeout de Edge Function.

Mantém ~16 pipelines de ingestão de fontes públicas brasileiras (PNCP, CNJ, TCE-SP, Câmara, Senado, IBAMA, Receita, INPI, BrasilAPI, Portal da Transparência). Toda ingestão é idempotente (upsert por chave natural), tolerante a falha parcial (retorna cursor para retomada) e nunca hardcoda secrets.

---

## graph-brain-engineer

**Quando acionar:** Trabalho em `apps/web/src/features/cerebro/` ou `apps/web/src/app/cerebro/`.

Constrói e mantém o canvas de grafo interativo (estilo Obsidian) que conecta entidades por CNPJ, IBGE, nome, partido ou proposição. Motor de força proprietário em `force-graph.ts` — sem biblioteca externa de grafo. Degrada graciosamente quando um kind ainda não tem dados no D1.

---

## security-reviewer

**Quando acionar:** Qualquer PR que toque auth, billing, Edge Functions de autenticação, migrations com RLS, ou lógica de pagamento. Acionar ANTES do merge, não depois.

Audita: autenticação nas Edge Functions (`hasValidApiKey` vs `getVerifiedUserId`), RLS + políticas no Postgres, segredos nunca no código (Vault/Edge Secrets/Wrangler), validação de assinatura no webhook Stripe, prompt injection em conteúdo de PDF/edital, isolamento de tenant. Não escreve código — aponta e instrui.

---

## qa-tester

**Quando acionar:** Antes de qualquer merge ou após mudanças que toquem múltiplos pacotes.

Roda o pipeline completo: `pnpm turbo typecheck` → `pnpm turbo build` → `pnpm turbo test` → validação de contratos de API → checklist manual de mobile (375px). Adiciona testes faltantes. Nunca altera lógica de negócio para fazer teste passar.

---

## doc-engineer

**Quando acionar:** Documentação desatualizada, novo agente a documentar, Edge Function sem cabeçalho de comentário padrão, ou README de serviço desatualizado.

Produz documentação baseada na stack real do projeto. Mantém `AGENTS.md` e `.claude/agents/*.md`. Segue o padrão de comentário de cabeçalho das Edge Functions (ver `supabase/functions/fonteia/index.ts` como referência). Não toca em `CLAUDE.md`, código de produção ou migrations.

---

## release-manager

**Quando acionar:** Antes de qualquer push para produção, ou quando uma mudança envolve secrets, migrations SQL ou configuração de infraestrutura.

Garante: checklist de release completo (typecheck + build + test + security review + secrets configurados + migrations aplicadas), deploy correto de Edge Functions (`supabase functions deploy`) e Workers (`wrangler deploy`), e plano de rollback documentado antes de aplicar qualquer mudança destrutiva.

---

## Fluxo típico de uma feature

```
Igor pede feature X
  └─ orquestrador analisa escopos
       ├─ engineering-manager (opus): decompõe em sub-tarefas com escopos disjuntos
       ├─ [agentes em paralelo — escopos disjuntos]:
       │    ├─ frontend-premium-designer (sonnet): UI
       │    ├─ rag-engineer (sonnet): lógica de busca
       │    └─ data-ingestion-engineer (sonnet): nova fonte
       ├─ security-reviewer (opus): revisa se há superfície de ataque nova
       ├─ qa-tester (sonnet): typecheck + build + test + mobile
       └─ release-manager (opus): checklist + deploy + rollback
```
