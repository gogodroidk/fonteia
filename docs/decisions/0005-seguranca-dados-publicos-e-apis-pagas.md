# ADR 0005 — Segurança, rastreabilidade de dados públicos e controle de APIs pagas

**Data:** 2026-06  
**Status:** Aceita  
**Autores:** Igor/Olli  

---

## Contexto

O Fonte.ia opera em uma posição peculiar: coleta dados de fontes oficiais gratuitas (Receita/SLE, PNCP, IBGE, Câmara, IBAMA, CNJ, INPI/RPI) e de APIs pagas por consulta (InfoSimples: ~R$ 0,05–0,20/consulta, franquia mínima R$ 100/mês). 

Dois riscos principais precisam de decisões explícitas:
1. **Rastreabilidade**: qualquer resposta da IA deve ser referenciada a uma fonte oficial com data e hash — nunca "a IA disse".
2. **Controle de gasto**: uma API paga disparada sem cache ou sem trava pode gerar centenas de reais de custo em horas.

Adicionalmente, a auditoria de junho/2026 revelou: token Cloudflare commitado no histórico git, JWT anon hardcoded em script, PII (`cpf_hash`) exposta no d1-bridge sem autenticação, e edge functions que aceitavam qualquer `apikey` não-vazia.

---

## Decisão

### Rastreabilidade

Cada entidade ingerida gera uma linha na tabela `evidence` com:
- `source_id` — referência à tabela `sources` (ex: `receita-leiloes-sle`, `pncp-contratacoes`, `ibge-localidades`).
- `collected_at` — data da coleta (não da ingestão; preservada em re-ingestão).
- `content_hash` — SHA-256 do conteúdo (migração 0009 substituiu MD5).

A IA responde **só com base na evidência** (guardrail na `packages/ai/answer-engine.ts` com `answerWithEvidence`). Se não há evidência, a resposta diz que não há — nunca inventa.

Categorias de dado e postura de confiança:
- **Fonte oficial (grátis, aberta):** PNCP, IBGE, Câmara, Senado, IBAMA, CNJ, INPI/RPI — tratado como verdade; citado com URL e data.
- **Fonte pública aggregada (CNPJ.ws, BrasilAPI):** citada mas marcada como "dados consolidados de terceiro".
- **API paga (InfoSimples):** citada como "dados verificados via InfoSimples" com data; cache de 60 dias para evitar recobrança da mesma consulta.
- **IA (inferência):** sempre marcada como inferência, nunca como fato. Diferenciado no formato de resposta: Resumo → Encontrado (fato+fonte) → Atenção → Inferência → Próximos passos.

INPI: 29,5k marcas ingeridas gratuitamente via Revista da Propriedade Industrial (RPI). InfoSimples usada apenas para busca por CNPJ (marcas do titular) — que não está na RPI aberta.

### Proxy InfoSimples (dormente + trava de gasto)

A Edge Function `infosimples-proxy` é construída para ficar **dormente** até a chave ser configurada:
- Sem `INFOSIMPLES_TOKEN` no Edge Secret → retorna `{ configured: false }` — o front cai no comportamento sem a feature. Não lança erro, não cobra.
- Com `INFOSIMPLES_TOKEN` → opera com:
  - **Cache-first:** busca em `external_lookups` (tabela Postgres) antes de chamar a InfoSimples. TTL padrão: 60 dias (`INFOSIMPLES_CACHE_TTL_DAYS`).
  - **Trava mensal:** `external_lookup_spend_count(provider)` conta chamadas "live" do mês; se ≥ `INFOSIMPLES_MONTHLY_CAP` (default 400), retorna 429 sem chamar a API.
  - **Trava diária por usuário:** `external_lookup_user_day_count(provider, user_id)` limita a `INFOSIMPLES_DAILY_PER_USER` (default 20) chamadas/dia/usuário.
  - **Gate de plano:** só usuários `pro` ou `corporativo` disparam consulta paga (verificado via `my_plan()` RPC, token de sessão validado).

### Higiene de tokens

Regras estabelecidas após a auditoria de junho/2026:

1. **Vault (Supabase):** `portal_transparencia_token`, `datajud_api_key`, `infosimples_token` — segredos lidos em runtime pela Edge Function via RPC `get_vault_secret()` (`SECURITY DEFINER`, `search_path=''`). Nunca em arquivo de código.
2. **Edge Secrets (Supabase):** `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `INGEST_CRON_SECRET`, `ALERTS_CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`.
3. **Cloudflare Pages Build Env:** apenas `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (chave pública — segura no bundle; RLS protege os dados).
4. **CI/CD (GitHub Actions):** `CF_API_TOKEN`, `CF_ACCOUNT_ID`. Nunca em `.env`, nunca no repo.
5. **Nunca em `.env` commitado:** `.gitignore` cobre `.env*`; scripts leem de variáveis de ambiente.

### Validação de `apikey` nas Edge Functions

Após auditoria: `fonteia`, `empresas-cnpj`, `edital-pdf`, `lote-detalhe` validam `apikey` contra `PUBLISHABLE_KEY` com comparação constant-time (evita timing attacks). Sem `apikey` válida → 401.

A chave de rate-limit do Raio-X é derivada do `user_id` verificado (`getVerifiedUserId`), não do JWT bruto — evita envenenamento da chave via token forjado.

### SSRF e path traversal

URLs da API SLE (Receita Federal) validadas com regex `/^\d+$/` em cada componente antes de interpolar — impede SSRF via parâmetros de edital/lote.

---

## Alternativas consideradas

| Alternativa | Por que foi descartada |
|---|---|
| Chamar InfoSimples direto do cliente (browser) | Token ficaria no bundle — comprometimento instantâneo |
| Cache no KV do Cloudflare em vez de Postgres | KV não tem TTL por query; não permite JOIN para verificar se o cache existe por (provider, kind, key); Postgres `external_lookups` tem índice composto e expiração por `expires_at` |
| Rate limit por IP em vez de por usuário | IP é facilmente rotacionado; usuário autenticado é mais difícil de abusar |
| MD5 como hash de evidência | MD5 tem colisões conhecidas; SHA-256 é o mínimo para integridade; migração 0009 fez a troca |

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Token CF no histórico git | REVOGAR o token `cfut_Plh…` no dashboard Cloudflare → gerar novo → setar na CI. O histórico não pode ser reescrito se o repo já foi clonado externamente |
| PII (`cpf_hash`) gravada no D1 antes da auditoria | Escrita removida do código; registros históricos persistem — drop/recreate da tabela `entities` no D1 se zero-PII for requisito |
| InfoSimples dormente sem aviso visual | Front verifica `configured: false` e exibe "feature não disponível" em vez de erro; comportamento documentado |
| Trava mensal por contagem e não por valor monetário | InfoSimples tem preços variáveis por consulta; a trava em 400 calls/mês é conservadora (~R$ 80 no pior caso); ajustar `INFOSIMPLES_MONTHLY_CAP` conforme histórico real de uso |

---

## Próximos passos

- Revogar e regenerar o token Cloudflare `cfut_Plh…` (ação manual obrigatória).
- Confirmar que `INFOSIMPLES_TOKEN` NÃO está setado no Edge Secret de produção (manter dormente até decisão de ativar).
- Documentar no DR checklist (HARDENING.md) os passos de recriação dos segredos do Vault.
- Adicionar Cloudflare Turnstile no formulário de login para bloquear bots antes do rate limit IA (Onda 2 do roadmap).
