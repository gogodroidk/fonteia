# Skills Curadas — skills.sh (Vercel Labs)

Curadoria do registro comunitário de _agent skills_ [skills.sh](https://skills.sh)
(repo `vercel-labs/skills`, CLI `npx skills find` / `npx skills add owner/repo@skill`).
As skills instalam um `SKILL.md` em `.agents/skills/` e são rastreadas em `skills-lock.json`.

**Contexto de risco:** o projeto roda Stripe em modo **LIVE** e usa uma `service_role` key do
Supabase. Critério adotado: só instalamos skills **oficiais de fornecedor** (stripe, cloudflare,
timescale/tigerdata, supabase, anthropics) que sejam **auditadas e de baixo risco** — guias de
conhecimento que não executam código autonomamente contra contas reais. Tudo o mais é
**recomendação** (instalar manualmente sob avaliação) ou **descartado**.

Cada skill foi inspecionada lendo o `SKILL.md` no GitHub (frontmatter + corpo) e cruzada com o
scanner de segurança do próprio CLI (`npx skills add` mostra Gen / Socket / Snyk). As linhas
"Med Risk" do scanner em skills oficiais decorrem apenas de o texto mencionar chaves de API /
gerar trechos de código — não há alertas Socket nem execução autônoma.

## Já instaladas antes desta curadoria

| skill | owner/repo | observação |
|---|---|---|
| `supabase` | `supabase/agent-skills` | oficial Supabase (banco principal) |
| `supabase-postgres-best-practices` | `supabase/agent-skills` | oficial Supabase (RLS, migrations) |

## Veredito — tabela de curadoria

| skill | owner/repo | o que nos dá | necessidade mapeada | confiança | comando `npx skills add` |
|---|---|---|---|---|---|
| `stripe-best-practices` | `stripe/ai` ✅ oficial | Seleção de API (Checkout vs PaymentIntents), assinaturas/billing, e **segurança**: restricted keys, manejo de webhooks, OAuth | (5) Stripe billing / webhooks | **INSTALL** | `npx skills add stripe/ai@stripe-best-practices` |
| `wrangler` | `cloudflare/skills` ✅ oficial | CLI Wrangler para Workers, **R2, Queues**, KV, D1, Vectorize, Secrets Store — sintaxe correta + avisos "nunca ecoe segredos" | (3) Cloudflare R2 + Queues + Workers | **INSTALL** | `npx skills add cloudflare/skills@wrangler` |
| `workers-best-practices` | `cloudflare/skills` ✅ oficial | Revisa/escreve código de Workers contra anti-padrões (streaming, floating promises, estado global, **bindings R2/Queues**, segredos, observabilidade) | (3) Cloudflare R2 + Queues + Workers | **INSTALL** | `npx skills add cloudflare/skills@workers-best-practices` |
| `pgvector-semantic-search` | `timescale/pg-aiguide` (author `tigerdata`, Apache-2.0) | Setup de busca vetorial com pgvector: halfvec, índices HNSW (m / ef_construction / ef_search), quantização, busca filtrada. **Só SQL**, sem shell/segredos | (4) pgvector / embeddings | **INSTALL** | `npx skills add timescale/pg-aiguide@pgvector-semantic-search` |
| `postgres-hybrid-text-search` | `timescale/pg-aiguide` (author `tigerdata`, Apache-2.0) | Busca híbrida BM25 + vetor com Reciprocal Rank Fusion (RRF), fusão client-side TS/Python, reranking opcional. **Só SQL/código**, sem execução autônoma | (4) hybrid search | **INSTALL** | `npx skills add timescale/pg-aiguide@postgres-hybrid-text-search` |

### Recomendadas (oficiais e seguras) — instalar manualmente se/quando útil

| skill | owner/repo | o que nos dá | necessidade | confiança | comando |
|---|---|---|---|---|---|
| `postgres` | `timescale/pg-aiguide` (`tigerdata`, Apache-2.0) | Guia guarda-chuva de Postgres: design de tabelas, índices, extensões (**pgvector + PostGIS**, ambas usadas aqui), migrations. Só SQL | (4) banco / busca | **INSTALL** (opcional, redundante em parte com `supabase-postgres-best-practices`) | `npx skills add timescale/pg-aiguide@postgres` |
| `upgrade-stripe` | `stripe/ai` ✅ oficial | Guia de upgrade de versão de API/SDK do Stripe (date-based versioning). Apenas consultivo | (5) Stripe | **INSTALL** (opcional, útil só em upgrade) | `npx skills add stripe/ai@upgrade-stripe` |
| `durable-objects` | `cloudflare/skills` ✅ oficial | Padrões de Durable Objects | infra Cloudflare (não no core hoje) | **INSTALL** (opcional, ainda não necessário) | `npx skills add cloudflare/skills@durable-objects` |

## PDF / extração de editais — necessidade (1): sem opção oficial limpa

Nenhuma skill oficial de _extração programática_ de PDF passou no nosso filtro conservador:

| skill | owner/repo | por que **não** instalar agora | comando (se decidir avaliar) |
|---|---|---|---|
| `pdf` | `openai/skills` ✅ oficial (OpenAI) | Extrai texto/tabelas com `pdfplumber`/`pypdf`, mas **instrui o agente a gerar e executar código Python** e instalar Poppler/pdftoppm — o scanner do CLI marcou **Gen: High Risk**. Bom candidato técnico, porém executa código; instalar só após revisão manual e sandbox | `npx skills add openai/skills@pdf` |
| `pdf-extraction` | `claude-office-skills/skills` | Feita sob medida para "extrair texto, tabelas e metadados via pdfplumber" e **executar o código gerado**, mas a **propriedade do org não é verificada** como Anthropic. Risco de execução + autoria não confirmada | `npx skills add claude-office-skills/skills@pdf-extraction` |
| `view-pdf` | `anthropics/knowledge-work-plugins` ✅ oficial (Anthropic) | Oficial, mas é um **visualizador interativo** (anotar, preencher formulário, assinar) — **não** faz extração programática de editais. Necessidade errada | `npx skills add anthropics/knowledge-work-plugins@view-pdf` |

**Recomendação para (1):** implementar a extração de editais com biblioteca direta no nosso código
(`pdfplumber`/`unpdf`/`pdf-parse` num Worker ou job), sob nosso próprio controle, em vez de depender
de uma skill que executa código gerado. Reavaliar `openai/skills@pdf` somente como referência de
padrões, com revisão manual.

## Web scraping / crawling — necessidade (2): só candidatos comunitários → CAUTION

Não há skill oficial de fornecedor para scraping polido. Os principais hits são comunitários:

| skill | owner/repo | veredito | motivo |
|---|---|---|---|
| `web-scraping` | `mindrally/skills` (~139 stars; origem `jamditis/claude-skills-journalism`) | **CAUTION / SKIP** | Comunitária; puxa Selenium/Playwright/requests e **não menciona rate limiting, robots.txt nem polidez** — exatamente o que precisamos. Não instalar |
| `crawl4ai-skill` | `lancelin111/crawl4ai-skill` | **SKIP** | Autoria comunitária desconhecida; depende do framework crawl4ai. Sem garantias de polidez |
| `just-scrape` | `jackiexiao/jackie-skills-starter` | **SKIP** | Skill de "starter" pessoal, sem reputação |
| `browserbase` | `vm0-ai/vm0-skills` | **CAUTION** | Wrapper de Browserbase/Stagehand, mas **não** é o repo oficial da Browserbase; autoria de terceiros |

**Recomendação para (2):** escrever nosso próprio crawler polido (User-Agent identificável,
`robots.txt`, _rate limiting_ por domínio, backoff) usando **Cloudflare Queues + Workers** —
coberto pelas skills oficiais `wrangler` e `workers-best-practices` já instaladas. Não adotar
skill comunitária de scraping dado o risco e a ausência de regras de polidez.

## React / TanStack Query / Zod / react-hook-form — necessidade (6): comunitárias → recomendar, não instalar

Nenhuma é de fornecedor oficial (não existe org oficial TanStack no registro). São guias de
padrão de código (baixo risco operacional), mas como o modelo já conhece bem essas libs e a
autoria é comunitária, ficam como **CAUTION / recomendação opcional**:

| skill | owner/repo | veredito | motivo |
|---|---|---|---|
| `react-hook-form-zod` | `ovachiever/droid-tings` | **CAUTION** (opcional) | Guia de padrão; só sugere `npm install` de versões fixadas. Comunitária |
| `tanstack-query` | `bobmatnyc/claude-mpm-skills` (302 installs) | **CAUTION** (opcional) | Guia puro de padrões, sem execução. Comunitária |
| `tanstack-query` | `secondsky/claude-skills` | **SKIP** | Duplicata de menor adoção |

## Turborepo / monorepo — fora do escopo core, comunitárias → SKIP

| skill | owner/repo | veredito | motivo |
|---|---|---|---|
| `turborepo-monorepo` | `giuseppe-trisciuoglio/developer-kit` (1.2K) | **SKIP** | Comunitária; o monorepo já está configurado, ganho marginal |
| `shared-monorepo-turborepo` | `agents-inc/skills` | **SKIP** | Comunitária, baixa adoção |

## Notáveis descartadas (resumo de uma linha)

- `secondsky/claude-skills@cloudflare-queues` — **SKIP**: comunitária e redundante com a oficial `cloudflare/skills` (que já cobre Queues).
- `bagelhole/...@cloudflare-r2`, `membranedev/...@cloudflare-r2` — **SKIP**: comunitárias; R2 já coberto por `wrangler` oficial.
- `nousresearch/hermes-agent@ocr-and-documents` — **SKIP**: OCR comunitário, autoria/escopo incertos para editais.
- `404kidwiz/claude-supercode-skills@pdf-skill` — **SKIP**: autoria comunitária desconhecida.
- `yonatangross/orchestkit@rag-retrieval` — **SKIP**: RAG comunitário; preferimos as skills oficiais `tigerdata` para pgvector/híbrido.
- `finsilabs/...@subscription-billing`, `eng0ai/...@stripe-subscription` — **SKIP**: billing comunitário; Stripe oficial é superior.

## Resumo executivo

**INSTALADAS nesta curadoria (5, todas oficiais e auditadas, scan Safe/Low + 0 alertas Socket):**

1. `stripe/ai@stripe-best-practices`
2. `cloudflare/skills@wrangler`
3. `cloudflare/skills@workers-best-practices`
4. `timescale/pg-aiguide@pgvector-semantic-search`
5. `timescale/pg-aiguide@postgres-hybrid-text-search`

**Recomendadas (oficiais, instalar manualmente conforme necessidade):**
`timescale/pg-aiguide@postgres`, `stripe/ai@upgrade-stripe`, `cloudflare/skills@durable-objects`.

**Necessidades sem skill segura (resolver com código próprio):**
- PDF de editais (1) → biblioteca direta sob nosso controle; `openai/skills@pdf` só como referência (executa código → High Risk).
- Scraping polido (2) → crawler próprio sobre Cloudflare Queues/Workers (skills oficiais já instaladas).

**Não instalar:** qualquer skill comunitária de scraping, billing, RAG ou PDF — risco incompatível
com Stripe LIVE + `service_role` key.
