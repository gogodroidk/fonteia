# ADR 0003 — Auth, RLS, Billing e Segredos: Supabase + Stripe + Cloudflare

**Data:** 2026-06  
**Status:** Aceita  
**Autores:** Igor/Olli  

---

## Contexto

O Fonte.ia é um SaaS B2B multi-tenant com planos pagos. Precisa de: autenticação robusta (e-mail/senha + Google OAuth), isolamento de dados por usuário (RLS), billing em Reais via Stripe, e gestão segura de segredos de APIs pagas (InfoSimples, Portal da Transparência, DataJud) sem expô-los no bundle do cliente ou no repositório.

---

## Decisão

### Autenticação

**Supabase Auth** com e-mail/senha e Google OAuth. Redirect URI canônico: `https://pwiuiihsyazghdsrpshg.supabase.co/auth/v1/callback` (é o do Supabase, não o do domínio do site — obrigatório para o flow OAuth funcionar). Trigger `on_auth_user_created` (AFTER INSERT ON auth.users) popula automaticamente `profiles` com `role=user`.

### RLS e multi-tenancy

Todas as tabelas de usuário têm RLS ativo. Event trigger `ensure_rls` (`ON ddl_command_end`) habilita automaticamente RLS em todo `CREATE TABLE public.*` — protege contra esquecimento em novas tabelas.

Funções-chave:
- `is_admin(uid)` — consulta `profiles.role`, usada em policies e em `admin_entities_by_kind()`.
- `my_plan()` — retorna o plano ativo do usuário logado (join `subscriptions` + `coupon_redemptions`).
- `my_trial()` — data de expiração do trial.

Planos canônicos: `free | pro | corporativo`. Pro = R$ 197/mês. Corporativo = R$ 597/mês.

### Billing

**Stripe** via dois Cloudflare Workers:
- `services/stripe-webhook`: recebe eventos do Stripe (checkout.session.completed, invoice.payment_failed, customer.subscription.*), grava em `subscriptions`, não rebaixa plano ativo de forma regressiva, responde 503 em falha transitória (Stripe re-tenta). `event.id` pronto para deduplicação.
- `stripe-portal` (Edge Function Supabase): gerencia o portal de autoatendimento do cliente.

Cupons: tabela `coupon_redemptions` com `max_redemptions` e `expires_at` (migration 0008). `redeem_coupon(p_code)` usa `FOR UPDATE` para evitar race condition.

### Segredos por camada

| Variável | Onde fica | Regra |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Cloudflare Pages Build Env | Vai no bundle; pública por design; RLS protege |
| `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` | Supabase Edge Secrets | Lida pelo runtime Deno, nunca pelo cliente |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Cloudflare Worker Secrets | Lida pelo Worker de webhook |
| `PORTAL_TRANSPARENCIA_TOKEN`, `DATAJUD_API_KEY`, `INFOSIMPLES_TOKEN` | **Supabase Vault** via `get_vault_secret()` | Lida em tempo de execução SQL/Deno; nunca no bundle |
| `CF_API_TOKEN`, `CF_ACCOUNT_ID` | GitHub Actions Secrets / CI | Apenas em deploy; nunca no repo |

`get_vault_secret(p_name)` é uma função SECURITY DEFINER com `search_path=''` que acessa o schema `vault` de forma isolada.

---

## Alternativas consideradas

| Alternativa | Por que foi descartada |
|---|---|
| Auth própria (JWT manual) | Complexidade desnecessária; Supabase Auth já tem e-mail, OAuth, verificação, recuperação de senha |
| Auth0 / Clerk | Custo adicional; não integra nativamente com Postgres RLS |
| Billing manual (PIX + banco) | Sem automação de upgrade/downgrade/cancellamento; risco operacional alto |
| Segredos em variáveis de ambiente do build | `VITE_*` vai para o bundle do cliente — impossível para chaves privadas |
| HashiCorp Vault / AWS Secrets Manager | Dependência externa desnecessária; Supabase Vault cobre o caso de uso |

---

## Motivo da escolha

1. **Supabase Auth + RLS** é uma pilha coesa: o token de sessão JWT é verificado nativamente pelas policies de RLS sem middleware extra.
2. **Stripe** é o único provedor de pagamentos com suporte real a Pix + cartão no Brasil sem custo fixo mensal.
3. **Supabase Vault** para tokens de APIs pagas (InfoSimples ~R$ 0,05-0,20/consulta) isola o segredo do código e do bundle sem infra adicional. A função `get_vault_secret` já tem `search_path=''` para evitar search_path injection.
4. **Cloudflare Worker para webhook** mantém o secret do Stripe fora das Edge Functions Supabase (separação de responsabilidade: Stripe → Worker → Supabase service role).

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Token CF commitado no histórico git (`scripts/deploy.ps1`) | Revogado e regenerado (auditoria junho/2026); novo token lido de env |
| JWT anon hardcoded em script de backfill | Removido; lê de `SUPABASE_ANON_KEY` env |
| `subscriptions` vinculadas por e-mail em vez de `user_id` | Follow-up pendente: migrar para `user_id` no webhook e no stripe-portal (ver AUDITORIA_CORRECOES_2026-06.md) |
| Edge functions aceitavam qualquer `apikey` não-vazia | Corrigido: validação constant-time contra `PUBLISHABLE_KEY` |

---

## Próximos passos

- Vincular `subscriptions` por `user_id` (não e-mail) no webhook e no stripe-portal.
- Adicionar `event.id` ao storage para deduplicação de webhooks (atualmente pronto no código mas sem tabela de dedup).
- Configurar `pg_cron` para `prune_ai_rate_limits()` (pendente: não está em nenhuma migration).
- Aplicar migrations 0007–0009 no Supabase de produção se ainda não aplicadas.
