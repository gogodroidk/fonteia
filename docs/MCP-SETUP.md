# MCP & Ferramentas — Setup do Fonte.ia

Pesquisa de campo + curadoria do que vale plugar no Claude para este projeto.
Princípio: **mais ferramenta ≠ melhor**. Excesso de MCP incha contexto, deixa o agente
mais lento e aumenta a superfície de ataque (tool poisoning — ver doc 06). Curar, não acumular.

## 1. Já conectado nesta máquina (via connectors/plugins do app — NÃO reinstalar)

| Ferramenta | Cobre |
|---|---|
| **Supabase MCP** | tabelas, SQL, migrations, edge functions, advisors, logs |
| **Cloudflare MCP** | D1, KV, R2, Workers, docs |
| **Playwright MCP** | testes E2E / UI |
| **Context7 MCP** | docs atualizadas de libs |
| **Bright Data** (plugin) | scraping/SERP/structured — substitui Firecrawl/Apify com folga |
| **Semrush MCP** | SEO/keywords/concorrência (casa com o footprint `publico/`+`guias/`) |
| **Chrome / computer-use / Desktop Commander** | automação de browser e desktop |
| **Gmail · Slack · Drive · Calendar** | comunicação/arquivos |
| **Hostinger DNS/Domains/Reach** | domínio `fontebrasil.online` + e-mail marketing |

## 2. Adicionados (escopo de USUÁRIO — `~/.claude.json`, valem em todos os projetos)

Registrados via `claude mcp add -s user`. Estado em 2026-06-29:

| Server | Status | O que falta p/ funcionar |
|---|---|---|
| **resend** | ✓ conectado | definir env `RESEND_API_KEY` (mesma dos Edge Secrets) p/ enviar de verdade |
| **stripe** | ! needs auth | rodar `/mcp` → **Authenticate** (OAuth no navegador) |
| **sentry** | ! needs auth | rodar `/mcp` → **Authenticate** (só útil após instrumentar o app) |
| **github** | × failed | definir env `GITHUB_PAT` (fine-grained, repo `fonteia`) e reabrir o Claude |

### Passos finais (o que só você pode fazer)
1. **Variáveis de ambiente** (PowerShell; persistente):
   ```
   setx GITHUB_PAT "github_pat_xxx"
   setx RESEND_API_KEY "re_xxx"
   ```
   - PAT do GitHub: github.com/settings/personal-access-tokens → **Fine-grained** → repo `gogodroidk/fonteia` → permissões Contents + Pull requests + Issues (read/write).
2. **Fechar e reabrir o Claude por inteiro** (o app lê as env no boot — não basta nova sessão).
3. **OAuth:** rodar `/mcp` → `stripe` → Authenticate (abre o navegador); idem `sentry` quando for usar.

### Comandos usados (referência / reprodução)
```
claude mcp add -s user --transport http stripe https://mcp.stripe.com
claude mcp add -s user --transport http sentry https://mcp.sentry.dev/mcp
claude mcp add -s user --transport http github https://api.githubcopilot.com/mcp/ --header "Authorization: Bearer ${GITHUB_PAT}"
claude mcp add -s user resend -e "RESEND_API_KEY=${RESEND_API_KEY}" -- cmd /c npx -y resend-mcp
```

## 3. Pular — e por quê

| Item (doc 06) | Veredito |
|---|---|
| **Firecrawl / Apify / Browserbase MCP** | Redundante: Bright Data + Chrome + Playwright + computer-use já cobrem scraping e browser. |
| **Docling / Marker / Unstructured** | **Não são MCP** — libs Python de backend. O backend é **Deno edge functions**; não rodam no pipeline vivo. Já existe `edital-pdf` + `ingest-receita-pdfs`. Se quiser, é serviço offline separado. |
| **LlamaIndex / LangGraph** | **Não são MCP** — frameworks Python de RAG/agentes. O RAG já roda em pgvector 768d (Gemini) dentro da `fonteia`. Não encaixa no Deno. |
| **pgvector** | Já em uso (embeddings 768d). Nada a fazer. |

## 4. Regras de segurança (doc 06, valendo)
- Sem segredo no config (OAuth ou `${ENV}`). Tokens via variável de ambiente, nunca literais.
- Token com permissão mínima (GitHub PAT fine-grained só no repo necessário).
- Supabase MCP em leitura por padrão; nada de escrita em produção sem confirmação humana.
- Pin de versão quando usar npx em pipeline; cuidado com MCP de terceiros não auditado.
