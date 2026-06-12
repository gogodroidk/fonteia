# Contexto — Fonte.ia (cole isto no início de um chat novo)

## O que é
**Fonte.ia by Olli** — SaaS de inteligência de dados públicos brasileiros. Transforma fontes oficiais (Receita Federal, PNCP, CNPJ, tribunais) em decisões rastreáveis com IA. **Primeiro módulo: leilões judiciais.** Público-alvo: pessoas **leigas** que querem praticidade (compradores e revendedores de leilão, advogados). Monetização B2B: R$ 299 individual, R$ 699 escritório, R$ 1.499 corporativo.

## Como o produto funciona (arquitetura de IA — RAG)
Coleta dados oficiais → estrutura no Postgres com evidência (fonte + data + hash) → pgvector para busca semântica → o Claude responde **só com base na evidência** (nunca inventa). Modelo barato (Haiku) para 90% das respostas, Sonnet para o complexo.

## Stack e infraestrutura
- Monorepo pnpm + Turborepo, **React 19 + Vite** (frontend), TypeScript.
- **Supabase** (Postgres + pgvector + Auth). Projeto ref: `pwiuiihsyazghdsrpshg` (org OLLI).
- **Cloudflare Workers** hospeda o site (assets estáticos). Worker: `fonteia`.
- Domínio oficial: **fontebrasil.online** (também existe fonte.sbs). DNS na Cloudflare.
- Repositório GitHub: **fonteia**, branch `work/fonteia-alpha`.
- **Deploy automático:** editar → commit/push (GitHub Desktop) → Cloudflare rebuilda e publica sozinho.

## Estado atual (junho/2026) — JÁ FUNCIONA
- Frontend completo e **no ar**: landing/vendas, login, onboarding (3 passos), cockpit, busca, conta, cookies/LGPD, páginas legais (privacidade/cookies/termos), PWA instalável, FAQ.
- **Login real** via Supabase: e-mail/senha + **Google funcionando**.
- **Banco montado**: schema completo + RLS (segurança) + **5 leilões reais** (kind=auction_lot) que o site já lê e mostra.
- Conectores ligados no chat: **Hostinger** (domains/dns/reach), **Supabase**, **Cloudflare**, **Stripe**.

## O que falta (roadmap, em ordem)
1. **Coleta automática dos leilões** — hoje só 5 de amostra. Construir ingestão (Supabase Edge Functions + cron) puxando da Receita.
2. **IA ligada de verdade** — precisa de chave da **Anthropic** + motor no servidor (Edge Function). *(Igor pediu deixar por último.)*
3. **Alertas** — usuário salva critério e é avisado. Precisa de e-mail (Resend).
4. **Pagamento real** — Stripe Payment Links (conector já ligado).
5. **Login Google com marca própria** (opcional/vaidade) — domínio de auth tipo `auth.fontebrasil.online` (recurso pago).
6. **Visual/design bonito** — capricho no final. (Igor NÃO gostou do visual atual; deixar pro fim.)
7. **Bônus: extrator de CNPJ dos PDFs da Receita** — ferramenta de captação de clientes (cold e-mail B2B legal sob legítimo interesse; focar PJ, evitar PF).

## Gotchas importantes (ler antes de mexer no build)
- **Build Cloudflare:** comando `pnpm --filter @fonteia/web... build`, output `apps/web/dist`. Só builda o SITE — os serviços de backend (ingest, api) têm erros de tipo e ficam de fora de propósito.
- **wrangler.jsonc** usa `assets` + `not_found_handling: single-page-application` (SPA). Não usar `_redirects` com regra (causa loop).
- **supabase-client.ts** tem as chaves do projeto como fallback (a publishable key é pública por design; RLS protege os dados). Sem chaves → cai em "modo demonstração".
- **Não dá para buildar/verificar no sandbox** de forma confiável (node_modules é de Windows). O build real roda no Cloudflare via push.
- **Supabase → Authentication → URL Configuration:** Site URL e Redirect URLs apontam pro site no ar (senão o login Google volta pra localhost).
- No Google Cloud, o "Authorized redirect URI" é `https://pwiuiihsyazghdsrpshg.supabase.co/auth/v1/callback` — **é assim mesmo, não trocar pelo domínio do site.**

## Documentos de apoio na pasta
- `PLANO_MESTRE_FRONTEND.md` — fases do frontend.
- `PLANO_MACRO_NEGOCIO_INFRA_IA.md` — custos, infra (Supabase/Cloudflare/Hostinger), captação, finanças.
- `CLAUDE.md` — instruções permanentes e preferências.

## Preferências do Igor (dono)
Direto, sem enrolação, **verdade dura** em vez de otimismo vazio. É **leigo em código** — precisa de passo a passo claro (ex.: usa GitHub Desktop pra push). Cuida do gasto de **tokens**. Quer **executar e entregar**, sem perguntas desnecessárias. Recomendar sempre a melhor opção, não a mais segura.
