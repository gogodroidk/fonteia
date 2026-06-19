# ADR 0001 — Stack: Vite + React + Cloudflare Pages + Supabase Edge

**Data:** 2026-06  
**Status:** Aceita  
**Autores:** Igor/Olli  

---

## Contexto

O Fonte.ia precisava de uma stack que suportasse: SPA com design system próprio (não queremos shadcn/ui nem a rigidez de um framework opinionado), deploy global de edge rápido, custo zero no tier inicial, e integração natural com Supabase (banco + auth + edge functions em Deno).

A alternativa óbvia do mercado — Next.js na Vercel — foi considerada e descartada.

---

## Decisão

**Frontend:** React 19 + Vite 7 com design system próprio (`styles.css` + tokens CSS). Sem Next.js, sem shadcn/ui, sem Radix. SPA com History API (roteamento nativo, sem TanStack Router por enquanto).

**Deploy:** Cloudflare Pages (assets estáticos do `apps/web/dist`) + Cloudflare Worker `fonteia` como gateway SPA. Configuração em `wrangler.jsonc`: `assets.not_found_handling: single-page-application`.

**Backend de IA e ingestores:** Supabase Edge Functions (Deno). Não Cloudflare Workers para o backend — o runtime Deno do Supabase tem acesso nativo ao `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` e ao Vault, simplificando a lógica de segredos.

**Banco:** Supabase Postgres (leilões + pgvector + auth + RLS). Cloudflare D1 para dados bulk (ver ADR 0002).

---

## Alternativas consideradas

| Alternativa | Por que foi descartada |
|---|---|
| Next.js + Vercel | App Router opiniado, custo de Vercel em escala, dificulta design system livre; SSR desnecessário para SaaS autenticado; lock-in de provider |
| Remix + Cloudflare Pages | Peso do framework sem benefício real; hidratação full-stack desnecessária para o perfil de produto |
| SvelteKit | Menor ecossistema de componentes e menor familiaridade da equipe |
| Cloudflare Workers (backend) | Sem acesso nativo ao Vault do Supabase; duplicaria lógica de auth; D1 já cobre o papel de storage edge |
| Next.js + Supabase SSR | Complexidade extra de cookies de sessão + Server Components para uma SPA de dados que não precisa de SEO nas rotas autenticadas |

---

## Motivo da escolha

1. **Cloudflare Pages é gratuito no tier inicial** — sem custo de hosting até escala real.
2. **Vite 7 + React 19 sem framework** dá controle total sobre o bundle e o design system (o visual Fonte.ia não cabe em shadcn).
3. **Supabase Edge Functions (Deno)** têm acesso direto ao Vault para segredos de APIs pagas (InfoSimples, Portal da Transparência, DataJud) sem nenhum middleware extra.
4. **Turborepo** orquestra o monorepo: `pnpm --filter @fonteia/web... build` builda só o site (os serviços de backend têm erros de tipo propositais e ficam de fora).
5. **PWA** via `vite-plugin-pwa` — instalável no celular sem app store, comportamento offline, notch/safe-area.

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Design system próprio exige manutenção | Tokens CSS em `styles.css`; escopo limitado ao necessário; não competimos com shadcn em componentes genéricos |
| SPA sem SSR prejudica SEO das páginas públicas | Prerender estático (`scripts/prerender.mjs`) para landing, legal e páginas de SEO; rotas autenticadas não precisam de SEO |
| Worker `fonteia` como gateway único | `not_found_handling: single-page-application` cobre todas as rotas; fallback limpo |
| Build só do site (`pnpm --filter @fonteia/web...`) — os pacotes de serviço têm erros de tipo | Documentado; `build:all` separado para quem precisar; CI só valida o site |

---

## Próximos passos

- Migrar roteamento de History API manual para TanStack Router (drop-in planejado, não bloqueia o produto atual).
- Adicionar TanStack Query para cache de dados autenticados (reduz re-fetches no cockpit).
- Confirmar `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` nas Build Env do Cloudflare Pages (hoje têm fallback hardcoded que funciona mas não é o ideal).
