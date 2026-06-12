# Plano Mestre — Fonte.ia Frontend Completo e Funcional

> Objetivo único: um app **inteiro funcional**, do login à venda, no padrão iPhone / Android / PC, pensado para o **usuário leigo**. Nada de tela que "não funciona". Cada botão faz algo real.

Data: 11/06/2026 · Dono: Igor/Olli · Status: **aprovado — em execução**

### Decisões aprovadas (11/06/2026)
- **Roteamento**: URLs reais. Fase 0 entregue via **History API nativa** (zero dependência, verificável). Upgrade para **TanStack Router** fica como drop-in quando houver `pnpm install` disponível.
- **Pagamento**: **Stripe** (cartão + Pix) na Fase 6.
- **Ordem**: seguir o plano 0 → 7 na sequência.

---

## 1. Princípios inegociáveis

1. **Leigo-first.** Quem usa não entende de IA nem de dados públicos. Linguagem simples, um caminho óbvio por tela, zero jargão sem explicação.
2. **Tudo funciona ou não entra.** Botão sem ação é bug. Módulo não-pronto aparece como "em breve" com cadeado — nunca como botão morto.
3. **Mobile-first real.** Desenhado primeiro para o celular (iPhone/Android), depois cresce para o PC. Instalável como app (PWA), com áreas seguras (notch), gestos e navegação inferior.
4. **Funciona do zero.** Abriu, usou. O modo demonstração (já implementado) garante que nada quebra sem backend.
5. **Confiança visível.** Cookies, privacidade e termos no padrão LGPD/ANPD. Evidência rastreável em cada resposta.
6. **Faça bem uma vez.** Sem retrabalho. Componentes reutilizáveis, design system único.

---

## 2. Onde estamos (base real do código)

**Já existe e funciona** (monorepo pnpm + Turborepo, React 19 + Vite, Cloudflare Pages):
- Landing, login (Google + e-mail), cockpit/dashboard, busca, detalhe do lote, fontes, módulos, planos.
- Design system verde próprio em `styles.css` (mobile-first, com sidebar, bottom-nav e topbar).
- Camada de dados com fallback API → Supabase → amostra.

**Consertado na sessão anterior:**
- Crash do Supabase com env vazio → **modo demonstração** (login/busca funcionam sem backend).
- Botões mortos ligados (Analisar, Ver todos, Produtos, Alertas, Dossiê, CTAs de planos).
- Busca offline devolve resposta de amostra em vez de erro.

**O que falta para "app inteiro funcional"** (escopo deste plano):
- Roteamento por URL real (hoje é estado em memória — não tem voltar do navegador, nem link compartilhável).
- Página de vendas completa (preço, prova social, FAQ, comparativo de planos).
- Onboarding do leigo (primeiro acesso guiado).
- Conta/perfil/configurações.
- Cookies (LGPD), Política de Privacidade, Termos.
- PWA instalável (iPhone/Android/PC) + ícones + offline.
- Recuperação de senha, verificação de e-mail, estados de erro/vazio amigáveis.
- Checkout real (Stripe) nos planos.
- Acessibilidade e testes.

---

## 3. Arquitetura-alvo do frontend

| Camada | Decisão | Por quê |
|---|---|---|
| Roteamento | **TanStack Router** (URLs reais: `/app`, `/buscar`, `/lote/:id`, `/planos`, `/conta`) | "Voltar" do navegador, deep-link, compartilhar tela — padrão de todo web app sério |
| Dados/cache | **TanStack Query** | Loading/erro/refetch padronizados, cache, menos código |
| Formulários | **React Hook Form + Zod** | Validação amigável e segura (login, conta, checkout) |
| Estado leve | Context atual (auth) + hooks | Já existe, mantém |
| Estilo | `styles.css` (design system atual) + tokens | Não reinventar; estender |
| PWA | **vite-plugin-pwa** + manifest + service worker | Instalável e funciona offline |
| Pagamento | **Stripe Checkout** (+ Pix via Stripe BR) | Padrão SaaS, menos PCI, suporta Brasil |

> Migração de roteamento é a única mudança estrutural. É o que falta para o app "se comportar como os outros". Feita de forma incremental, sem quebrar o que já existe.

---

## 4. Mapa de telas (todas funcionais)

**Públicas (sem login):**
1. **Landing / Página de vendas** — herói, problema→solução, módulos, preços com toggle mensal/anual, prova social, FAQ, CTA duplo (Testar grátis / Falar com vendas). Responsiva.
2. **Login / Cadastro** — Google + e-mail, **recuperar senha**, **reenviar verificação**, modo demo. (base feita)
3. **Política de Cookies, Privacidade e Termos** — páginas dedicadas, linkadas no rodapé.

**Privadas (logado):**
4. **Onboarding (1º acesso)** — wizard de 3 passos: "o que você quer encontrar?", canal de alerta, tour rápido.
5. **Cockpit / Dashboard** — radar de oportunidades, métricas, pergunta rápida. (feito, polir)
6. **Buscar / Perguntar** — pergunta → resposta com evidência. (feito, polir)
7. **Detalhe do lote** — score, edital, criar alerta, exportar dossiê. (feito)
8. **Fontes** — catálogo com status. (feito)
9. **Módulos** — mapa do produto, travados como "em breve". (feito)
10. **Planos / Billing** — comparativo + **checkout Stripe real**.
11. **Conta** — perfil, plano atual, alertas salvos, **gerenciar consentimento de cookies**, sair, excluir conta (LGPD).

**Transversais:** estados de loading (skeleton), vazio (ilustração + próximo passo), erro (mensagem humana + tentar de novo), toasts de sucesso.

---

## 5. Conformidade e confiança (LGPD / ANPD)

Com base no Guia Orientativo da ANPD sobre cookies (consentimento livre, informado, inequívoco e **granular**):

- **Banner de cookies**: aparece no 1º acesso. Botões "Aceitar tudo", "Recusar tudo", "Gerenciar". **Nenhum cookie não-essencial antes do aceite.** Nada pré-marcado.
- **Categorias**: Necessários (sempre on, travado) · Funcionais · Analíticos · Publicidade. Opt-in por categoria.
- **Registro do consentimento** (data, escolha) — salvo localmente e, com backend, no Supabase.
- **Gerenciar a qualquer momento** em Conta → Cookies.
- **Páginas**: Política de Privacidade, Política de Cookies, Termos de Uso — em português, linguagem clara.
- **Direitos do titular**: canal para solicitar dados / exclusão (resposta em até 15 dias).

---

## 6. iPhone / Android / PC (PWA)

- **Manifest + ícones** (192/512/maskable/apple-touch), tema verde, `display: standalone`.
- **Service worker** (vite-plugin-pwa): cache do shell, funciona offline, prompt "Adicionar à tela inicial".
- **Safe areas** (`env(safe-area-inset-*)`) para o notch do iPhone.
- **Toque**: alvos ≥ 44px, bottom-nav no celular (já existe), gestos de fechar modal.
- **Responsivo**: breakpoints já definidos (480/768/1024/1280) — auditar cada tela nos 3 formatos.
- **Meta tags** iOS (`apple-mobile-web-app-capable`, status bar).

---

## 7. Mapa de Skills → tarefa

| Tarefa | Skill(s) |
|---|---|
| Monorepo/turbo, scripts de build | `turborepo` |
| Auth, sessão, recuperação de senha | `auth-implementation-patterns`, `supabase-postgres-best-practices` |
| UI/dashboard (router, query) | `tanstack-router`, `tanstack-query`, `react-best-practices` |
| Formulários (login, conta, checkout) | `react-hook-form-zod`, `zod` |
| Checkout e cobrança | `stripe-integration`, `billing-automation` |
| Multi-tenant (escritórios/corporativo) | `saas-multi-tenant` |
| Busca semântica (respostas com evidência) | `embedding-strategies`, `hybrid-search-implementation` |
| API (rotas, segurança, limites) | `api-design-principles`, `api-security-hardening`, `api-rate-limiting` |
| Testes | `vitest-testing` |
| Deploy/infra | `cloudflare-workers-runtime-apis`, `cloudflare-r2`, `cloudflare-kv`, `cloudflare-queues` |
| Integração IA | `ai-sdk-core`, `ai-sdk-ui`, `claude-api` |
| Domínio de leilões | `leiloeiro-mercado` |
| Documentos/entregáveis | `docx`, `pdf`, `pptx`, `xlsx` (quando precisar) |

---

## 8. Roteamento de modelos e agentes (economia de tokens)

Seguindo suas regras permanentes — decidido automaticamente, sem perguntar:

| Tipo de trabalho | Modelo | Exemplos neste projeto |
|---|---|---|
| Trivial (renomear, ícone, slug, copy curta) | **haiku** | textos de botão, ajustes de CSS pontuais, ícones do PWA |
| Tela/feature do dia a dia | **sonnet** | construir página de Conta, banner de cookies, formulários |
| Estratégico/complexo | **opus** | migração para TanStack Router, checkout Stripe, arquitetura de consentimento |
| Projeto inteiro/irreversível | **fable** | só se uma fase virar migração total |

**Agentes (sob demanda, em paralelo quando possível):**
- 1 agente **opus** para a migração de roteamento (isolada, alto risco).
- 1 agente **sonnet** para telas novas (Conta, Cookies, páginas legais).
- 1 agente **haiku** para assets/copy/PWA icons.
- 1 agente de **verificação** ao fim de cada fase (build + checagem das telas).

> Regra de ouro de tokens: agentes recebem contexto completo no prompt (eles não lembram da sessão) e devolvem só o resultado integrável. Planejamento e decisões = orquestrador (sem gastar agente).

---

## 9. Execução por fases (cada fase é entregável e testável)

**Fase 0 — Fundação de roteamento** *(opus)*
TanStack Router com URLs reais, mantendo todas as telas atuais. Voltar/avançar do navegador, deep-link. Critério: navegar por URL e pelo botão voltar sem quebrar.

**Fase 1 — Conformidade e confiança** *(sonnet + haiku)*
Banner de cookies LGPD (granular), páginas de Privacidade/Cookies/Termos, rodapé legal. Critério: nenhum cookie não-essencial antes do aceite; gerenciar funciona.

**Fase 2 — Página de vendas completa** *(sonnet)*
Landing com preços (toggle mensal/anual), prova social, FAQ, comparativo, CTAs. Critério: converte visitante → cadastro; responsiva nos 3 formatos.

**Fase 3 — Conta + Auth completo** *(sonnet)*
Página de Conta (perfil, plano, alertas, cookies, sair, excluir conta), recuperar senha, verificação de e-mail. Critério: fluxo de senha esquecida ponta a ponta.

**Fase 4 — Onboarding do leigo** *(sonnet)*
Wizard de 1º acesso (3 passos) + tour. Critério: novo usuário chega ao "primeiro valor" em < 2 min.

**Fase 5 — PWA (iPhone/Android/PC)** *(haiku + sonnet)*
Manifest, ícones, service worker, safe areas, instalável, offline shell. Critério: instala no celular e no PC; abre offline.

**Fase 6 — Checkout real** *(opus)*
Stripe Checkout (cartão + Pix), webhook, liberar plano. Critério: pagamento de teste libera o módulo.

**Fase 7 — Polimento + acessibilidade + testes** *(sonnet + verificação)*
Skeletons, estados vazios/erro, contraste, navegação por teclado, leitor de tela, Vitest nos fluxos críticos, auditoria responsiva. Critério: Lighthouse PWA/Acessibilidade ≥ 90; build verde.

> Ordem recomendada: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7. Fases 1 e 2 podem rodar em paralelo (agentes separados).

---

## 10. Definition of Done (vale para cada tela)

- [ ] Funciona no iPhone, Android e PC (testado nos 3).
- [ ] Todo botão/link tem ação real; nada morto.
- [ ] Estados de loading, vazio e erro tratados com linguagem de leigo.
- [ ] Funciona em modo demonstração (sem backend) e com backend.
- [ ] Acessível (foco visível, teclado, rótulos ARIA, contraste).
- [ ] Sem erro de TypeScript; build passa; teste do fluxo crítico passa.

---

## 11. Verificação (como provo que funciona)

- `pnpm install && pnpm --filter @fonteia/web build` verde (rodado no seu PC, pois o sandbox tem node_modules de Windows).
- `pnpm --filter @fonteia/web test` (Vitest) nos fluxos: login, busca, cookies, checkout.
- Auditoria manual de cada tela nos 3 formatos + Lighthouse.
- Agente de verificação ao fim de cada fase relata o que abriu, clicou e confirmou.

---

## 12. Riscos e decisões em aberto (preciso do seu aval)

1. **Roteamento**: migrar para TanStack Router (recomendo) muda a estrutura do app. Ganho: URLs reais, voltar do navegador, deep-link. É a mudança que falta para o padrão dos outros apps.
2. **Pagamento**: Stripe Checkout (cartão + Pix). Alternativa: Mercado Pago (já citado no `.env`). Recomendo Stripe pela skill pronta e menos PCI.
3. **Backend real vs. demo**: o frontend fica 100% funcional em modo demo agora; ligar Supabase/Stripe de verdade exige suas chaves.

---

### Resumo de uma linha
8 fases, cada uma entregável, do roteamento real ao checkout, com cookies LGPD e PWA instalável — modelos roteados (haiku→fable) e agentes em paralelo para gastar o mínimo de tokens. Aprovado, começo pela Fase 0.
