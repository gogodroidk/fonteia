# PERFEIÇÃO PUNCHLIST — Fonte.ia `apps/web`
**Auditoria:** 2026-06-19 | **Auditor:** QA/UX agent (read-only) | **Stack:** Vite + React + TS + custom CSS design-system

---

## Top 20 Priorizado

| # | Arquivo / Símbolo | Problema | Sev | Esforço | Fix em 1 linha |
|---|---|---|---|---|---|
| 1 | `vite.config` (ausente) | **Bundle único de 577 KB** (~163 KB gzip) — tudo no `index.js`: react-dom, @supabase/supabase-js, App shell, todas as lazy pages | 🔴 | M | Criar `vite.config.ts` com `build.rollupOptions.output.manualChunks` (ver seção Velocidade) |
| 2 | `src/styles.css` L92 + `src/styles/design-system.css` L9 | **Conflito de CSS tokens críticos:** `styles.css` define `--r-sm:6px`/`--r-md:10px`/`--r-xl:24px` e importado ANTES de `design-system.css` que redefine `--r-sm:8px`/`--r-md:12px`/`--r-xl:22px`. Design-system vence mas `styles.css` usa `--r-md=10px` no layout esperando esse valor. Componentes `.alert-modal` e `.module-card` ficam com radius incorreto | 🔴 | S | Remover a seção `--r-*` duplicada de `styles.css` ou alinhar os valores entre os dois arquivos |
| 3 | `src/styles.css` L92 | **Conflito de fonte:** `styles.css` define `font-family: "Inter"` no `:root` mas Figtree é a fonte real do produto (importada em `main.tsx` via `@fontsource-variable/figtree` e usada em `--font`). Componentes legados em `styles.css` (`.landing`, `.login-page`, `.sidebar`) herdavam Inter | 🔴 | S | Remover a linha `font-family: "Inter"...` do `:root` em `styles.css`; o `body { font-family: var(--font) }` de `design-system.css` já cobre |
| 4 | `src/styles.css` L210-211 + `src/styles/design-system.css` L210-297 | **`.skeleton` declarado duas vezes** em arquivos distintos com animações diferentes (`shimmer` vs `skeleton-sweep`). O segundo bloco vence mas o primeiro fica no bundle aumentando o CSS (72 KB) desnecessariamente | 🔴 | S | Remover `.skeleton` e `.skeleton::after` das linhas 210-212 de `src/styles.css` |
| 5 | `src/app/page.tsx` L603-724 | **6 requests paralelos no mount, sem cache de módulo.** `Promise.allSettled([listLicitacoes, listMunicipios, listDeputados, listInfracoes, listProposicoes, listOrgaos])` dispara todas as chamadas toda vez que o dashboard monta — com navegação frequente entre Painel e outros módulos, isso refaz os fetches. O `d1-cache` existe (`cachedFetch`) mas nenhum módulo o usa como wrapper do `listX()` | 🔴 | M | Enrolar cada `listX()` em `cachedFetch(key, 5 * 60_000, listX)` dentro da feature API |
| 6 | `src/App.tsx` L689-784 | **ErrorBoundary sem reset:** o `ErrorBoundary` captura o erro mas só mostra botão `window.location.reload()`. Após a recarga, se o usuário navegar de volta ao mesmo componente e ele falhar novamente (ex.: chunk de uma feature), o estado `hasError:true` não é resetado na navegação (sem `key` prop ou `resetKeys`). O usuário fica preso | 🔴 | S | Passar `key={route}` no `<ErrorBoundary>` para forçar remontagem a cada rota, ou adicionar um `resetKeys` prop |
| 7 | `src/app/page.tsx` L1302, L1415 | **2 hardcodes de cor `#1D5FE0`** no JSX (badge RFB duplicado na section de módulos e no title de destaque), quebrando o tema dark onde a cor não inverte com `--brand-ink` | 🟡 | S | Substituir `color: "#1D5FE0"` e `background: "color-mix(in srgb, #1D5FE0 12%..."` por `color: "var(--brand-ink)"` e o token correspondente |
| 8 | `src/app/page.tsx` L1697-1713 + L1872-1889 | **`<th>` sem `scope`:** os cabeçalhos da tabela de lotes não têm `scope="col"`. Screen readers não conseguem associar colunas. Duplicado nas versões skeleton e real | 🟡 | S | Adicionar `scope="col"` em cada `<th>` das tabelas |
| 9 | `src/app/page.tsx` L285-330 `QuickActionCard` | **`aria-label` duplica o título mas o `description` some para screen readers.** `aria-label={action.title}` oculta o texto de descrição interno do AT tree | 🟡 | S | Usar `aria-label={action.title + ", " + action.description}` ou remover o `aria-label` e deixar o texto visível fazer o trabalho |
| 10 | `src/components/ui/CountUp.tsx` | **Animação de contagem não é silenciosa para AT.** O `<span>` atualiza seu conteúdo com `requestAnimationFrame` a ~60fps, causando dezenas de atualizações de DOM que screen readers anunciam. Sem `aria-live` controlado | 🟡 | S | Adicionar `aria-live="polite" aria-atomic="true"` e usar um debounce para só anunciar o valor final |
| 11 | `src/app/page.tsx` L1557-1572 | **`role="button"` em `<div>` no `closing-soon-row`** sem ser um `<button>`. O tabIndex e onKeyDown estão corretos mas o elemento deveria ser `<button type="button">` para semântica nativa e para herdar focus styling e `active` state | 🟡 | S | Converter `<div className="closing-soon-row" role="button">` para `<button type="button" className="closing-soon-row">` |
| 12 | `src/app/page.tsx` L913-1189 | **CSS-in-JS bloqueante num `<style>` tag dentro do render.** O bloco `<style>{...}</style>` de 276 linhas é emitido em toda re-render do componente (React injeta/remove se o DOM diferir). Causa flash of unstyled content e aumenta work de layout | 🟡 | M | Mover as classes `.dashboard-page`, `.kpi-strip`, etc. para `styles.css` ou um arquivo CSS importado estaticamente |
| 13 | `src/App.tsx` L938-1079 | **Mesmo problema: `<style>` de 140+ linhas no App shell** recriado em cada render do AppShell | 🟡 | M | Mover para CSS estático (idem acima) |
| 14 | `src/app/page.tsx` L1648-1685 | **Filter inputs sem `<label>` associada (acessibilidade de formulário).** Os 4 controles têm `aria-label` OK, mas os filtros não têm `id`+`htmlFor`. Em zoom 200% mobile, o input de busca não tem label visível | 🟡 | S | Adicionar `<label htmlFor="filter-busca" className="sr-only">Filtrar lotes</label>` para cada filtro + `id` correspondente |
| 15 | `src/App.tsx` L377 | **`checkoutOk` lê `window.location.search` diretamente no `useState` initializer.** É SSG-safe pois tem `typeof window !== "undefined"`, mas o query param `?checkout=sucesso` não é removido da URL depois de exibir o banner — o usuário que copiar e compartilhar a URL mostrará o banner de pagamento para outra pessoa | 🟡 | S | Após exibir o banner, chamar `window.history.replaceState(null, "", window.location.pathname)` |
| 16 | `src/features/leiloes/leiloes-api.ts` L148 | **`getLeilaoLotById` faz `listLeilaoLots()` completo como fallback** — se a API de detalhe falhar, carrega TODOS os lotes só para encontrar um por ID. Em mobile lento, pode baixar 1 MB de JSON desnecessariamente | 🟡 | M | Separar o fallback para buscar do Supabase com filtro `?id=eq.{lotId}` em vez de listar tudo |
| 17 | `src/app/page.tsx` L736 | **`scoredLots[0]!`** — o operador non-null é seguro aqui (checado por `scoredLots.length === 0` na linha 733), mas com `noUncheckedIndexedAccess:true` o compilador ainda exige o `!`. Dependência implícita de ordem dos checks. Se alguém reordenar o `useMemo`, a guarda some | 🟢 | S | Renomear com destructuring explícito: `const [firstEntry] = scoredLots; const featuredEntry = scoredLots.reduce(..., firstEntry)` |
| 18 | `src/App.tsx` L150 `isApplePlatform()` (IntelligenceOmnibox.tsx L148) | **`navigator.platform` está deprecated** (removido no Chrome 113+ em alguns builds). A função usa `navigator.platform \|\| navigator.userAgent` como fallback, mas a checagem de `/Mac\|iPhone\|iPad\|iPod/` contra `userAgent` pode falhar em alguns headless browsers | 🟢 | S | Usar apenas `navigator.userAgent` (já está no fallback) e checar `Mac\|iPhone\|iPad\|iPod` no UA string diretamente |
| 19 | `src/app/page.tsx` | **KPI "Acompanhando" sempre começa em 0** no SSR/primeiro render, depois anima para o tamanho real. O `getWatchlistSize()` é chamado apenas em `useEffect` (correto para SSR) mas causa um flash numérico 0→N visível | 🟢 | S | Usar o initializer diretamente: `useState(() => getWatchlistSize())` — getWatchlistSize já é SSR-safe com `typeof window !== "undefined"` |
| 20 | `src/App.tsx` L95-234 | **33 lazy imports** todos sem `/* @vite-rollup-ignore */` ou agrupamento estratégico de chunks. Gera 98 arquivos JS no dist, aumentando o número de requests HTTP/2 e a pressure de conexão | 🟢 | M | Agrupar páginas relacionadas em 4-6 chunks (público, features-core, features-secundárias, tools) via `manualChunks` |

---

## 1. Zero-Erro — Crashes e Estados Não Tratados

### 1.1 ErrorBoundary sem reset por rota
**Arquivo:** `src/App.tsx` L53-89 (`ErrorBoundary`)

A única `ErrorBoundary` do app abrange toda a zona autenticada (`<Suspense>` L690). Quando um chunk falha ao carregar (ex.: `CerebroPage`), `hasError:true` fica persistido na instância. Navegar para outra rota não remonta o componente porque o `route` muda mas o `ErrorBoundary` não recebe nenhum sinal de reset. O botão "Recarregar página" funciona mas é UX ruim — o usuário perde o contexto.

**Fix:** `<ErrorBoundary key={route}>` força remontagem entre rotas.

### 1.2 `getLeilaoLotById` fallback dispara `listLeilaoLots()` inteiro
**Arquivo:** `src/features/leiloes/leiloes-api.ts` L148

Se a API de detalhe `/leiloes/lotes/{id}` retornar 404, o código faz `listLeilaoLots(fetcher)` — que inclui paginação completa do Supabase (até 10.000 linhas × 10 páginas). Em dispositivos lentos isso é um timeout silencioso transformado em busca exaustiva.

**Fix:** No fallback Supabase, buscar por `entities?kind=eq.auction_lot&attributes->>'id'=eq.{lotId}` (query filtrada) em vez de listar tudo.

### 1.3 `checkoutOk` URL param não limpa a URL
**Arquivo:** `src/App.tsx` L376-378

O query param `?checkout=sucesso` permanece na URL mesmo após o banner ser exibido. Ao compartilhar/favoritar o link, qualquer usuário que abrir verá o banner de pagamento confirmado.

**Fix:** Após setCheckoutOk(true), chamar `window.history.replaceState(null, "", window.location.pathname + window.location.hash)`.

### 1.4 `scoredLots[0]!` — non-null assertion frágil
**Arquivo:** `src/app/page.tsx` L736

A guarda `if (scoredLots.length === 0) return undefined` está 3 linhas acima, então a assertiva é segura hoje, mas é implícita. Com `noUncheckedIndexedAccess:true`, qualquer refactor que reordene o `useMemo` pode introduzir um crash em runtime que o TypeScript não detecta.

### 1.5 `KPI_COLORS[0..3]` indexados sem verificação
**Arquivo:** `src/app/page.tsx` L137-142, L818-831

`KPI_COLORS` é `as const` de 4 elementos. Acessos em `[0]`, `[1]`, `[2]`, `[3]` são `string | undefined` com `noUncheckedIndexedAccess`, mas o `!` não foi adicionado e o TypeScript não reclama porque `as const` arrays têm tipo de tuple. Não é crash hoje mas é frágil a extensão.

### 1.6 `emptyMod` spread compartilhado
**Arquivo:** `src/app/page.tsx` L545

`const emptyMod = { count: 0, items: [], loaded: false, error: false };` é reutilizado com spread `{ ...emptyMod }` em 8 lugares. O spread funciona corretamente aqui, mas se `emptyMod.items` for mutado por acidente (JavaScript allows it), todos os módulos compartilham o mesmo array original. Embora `useState` seja imutável por convenção, é um footgun.

**Fix:** `() => ({ count: 0, items: [] as string[], loaded: false, error: false })` como factory.

### 1.7 Sem feedback visual quando todos os módulos falham
**Arquivo:** `src/app/page.tsx` seção módulos

Quando todas as 6 chamadas de `Promise.allSettled` falham (rede off), cada ModuleCard mostra "Erro ao carregar" individualmente — mas não há banner global ou retry button. O usuário vê 8 cards de erro sem ação clara.

---

## 2. Velocidade — Bundle, Cache e Rede

### 2.1 Bundle monolítico de 577 KB (sem vite.config.ts)
**Ausência:** `apps/web/vite.config.ts` não existe na estrutura atual (apenas `package.json` com scripts `vite build`). Sem configuração explícita de chunks, Vite coloca tudo que não é lazy em `index-*.js`.

O arquivo `index-BFE7QM-o.js` contém **577 KB** raw (~163 KB gzip), confirmado pelo `ls -lh dist/assets/`. Ele inclui react-dom + @supabase/supabase-js + todos os componentes importados diretamente em `App.tsx` (AuthProvider, ThemeProvider, CookieBanner, IntelligenceOmnibox, ContextChat, PwaInstallPrompt, LoginPage, LandingPage, OnboardingPage).

**Configuração proposta para criar `apps/web/vite.config.ts`:**
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vendor: react + react-dom (cache longo, muda raramente)
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "vendor-react";
          }
          // Supabase SDK (pesado, muda raramente)
          if (id.includes("node_modules/@supabase")) {
            return "vendor-supabase";
          }
          // Lucide icons (tree-shaken mas ainda >50 KB com 20+ icons importados)
          if (id.includes("node_modules/lucide-react")) {
            return "vendor-lucide";
          }
          // Features de domínio (shared packages)
          if (id.includes("packages/") || id.includes("@fonteia/")) {
            return "domain";
          }
          // Auth + landing (necessários antes do login)
          if (id.includes("/auth/") || id.includes("/app/auth/") || id.includes("/app/landing/")) {
            return "auth";
          }
        },
      },
    },
  },
});
```
Estimativa: `vendor-react` ~42 KB gzip, `vendor-supabase` ~45 KB, restante do index cai para ~40–60 KB.

### 2.2 CSS de 72 KB (sem code-split por rota)
**Arquivo:** `dist/assets/index-qhtFYZlN.css` = 72 KB

O CSS inclui todas as classes de landing, login, billing, legal, onboarding, etc. Para o usuário logado (90% dos usuários do SaaS), a landing CSS é carregada desnecessariamente. Não é crítico mas contribui para o LCP em mobile 3G.

**Fix de baixo esforço:** Dividir `styles.css` em `styles-public.css` (landing/login) e `styles-app.css` (shell/dashboard), importados condicionalmente. Mas o maior ganho é nas seções 2.3 e 2.4.

### 2.3 CSS-in-JS no render de `DashboardPage` e `AppShell`
**Arquivo:** `src/app/page.tsx` L913-1189 e `src/App.tsx` L937-1079

Dois blocos `<style>` gigantes dentro do JSX (276 e 142 linhas respectivamente) são injetados no `<head>` a cada mount. React verifica e re-injeta se o DOM de alguma forma diferir. Além do overhead de DOM, esses estilos estão fora do fluxo de cache do browser (não têm content hash).

**Fix:** Mover para arquivos `.css` separados importados estaticamente (`src/styles/dashboard.css`, `src/styles/shell.css`). Reduz o bundle JS em ~10 KB e elimina o trabalho de parse/inject em runtime.

### 2.4 Nenhum módulo usa o `d1-cache` como wrapper do `listX()`
**Arquivos:** todos em `src/features/*/`-api.ts

O cliente D1 (`src/lib/d1-client.ts` L329) usa `cachedFetch` internamente para a requisição HTTP ao d1-bridge — isso já deduplica requests HTTP. Mas as funções `listLicitacoes()`, `listMunicipios()`, etc. não têm TTL no nível da feature: cada `useEffect` disparado por mount faz uma chamada nova (mesmo que o d1-cache seja hit, ainda há overhead de Promise resolution e setState).

O DashboardPage chama 6 APIs em paralelo toda vez que o usuário navega para o Painel — inclusive em retornos rápidos (Painel → Lotes → Painel). O `d1-cache` resolve o hit de rede mas não o overhead de 6 `useState` updates consecutivos.

**Fix de alto impacto:** No DashboardPage, substituir o `useEffect` de múltiplos módulos por um único `useEffect` com `Promise.allSettled` que só roda SE `modulesLoading && !loaded` — adicionar uma ref de controle `hasLoadedRef = useRef(false)` que persiste entre re-renders.

### 2.5 `listLicitacoes` e `listMunicipios` não têm TTL no nível de feature
**Arquivos:** `src/features/licitacoes/licitacoes-api.ts`, `src/features/municipios/municipios-api.ts`

Mesmo com d1-cache na camada HTTP, chamadas dentro da mesma sessão que ocorram após o TTL do d1-cache (300s) refarão a requisição. Para dados que mudam 1×/dia (licitações, municípios), um TTL de 5-10 minutos no nível de módulo seria adequado.

**Fix:** Enrolar a chamada em `cachedFetch(\`list:licitacoes\`, 10 * 60_000, () => fetchFromD1(...))` no topo das funções `listX()`.

### 2.6 Supabase pagina leilões em loop serial
**Arquivo:** `src/features/leiloes/leiloes-api.ts` L58-85

O fallback Supabase busca lotes em loop serial — página 0, espera resposta, página 1, espera, etc. até `break` ou `MAX_SUPABASE_PAGES=10`. Para datasets de 1.000+ lotes, isso pode ser 3-5 requests seriais de ~200ms cada = 1s+ de latência.

**Fix parcial:** Buscar a contagem primeiro (`HEAD` ou `Prefer: count=exact`) e só paginar se necessário. Para leilões da Receita (tipicamente <500 lotes), uma única request de 500 itens é suficiente.

---

## 3. UI/UX Consistency

### 3.1 Tokens de radius conflitantes (CRÍTICO)
**Arquivo:** `src/styles.css` L74-78 vs `src/styles/design-system.css` L10

| Token | `styles.css` (import 1) | `design-system.css` (import 2, vence) |
|---|---|---|
| `--r-sm` | `6px` | `8px` |
| `--r-md` | `10px` | `12px` |
| `--r-xl` | `24px` | `22px` |
| `--r-lg` | `16px` | `16px` ✓ |

Consequência: componentes legados como `.alert-modal` (radius `--r-xl`) e `.billing-card` (`--r-lg`) ficam com `22px` e `16px` respectivamente (values do design-system), que visualmente podem diferir do intended. Mas mais grave: os componentes do AppShell real (`.btn`, `.input`, `.card`) usam `--r-md:12px` do design-system — consistente.

### 3.2 Fonte Inter residual em componentes legados
**Arquivo:** `src/styles.css` L92

`:root { font-family: "Inter" }` é sobrescrito pelo `body { font-family: var(--font) }` do design-system, mas componentes que herdam diretamente de `:root` sem passar por `body` podem ainda ver Inter. Isso nunca deve acontecer na prática (todo elemento está dentro de `body`), mas é lixo que confunde.

### 3.3 Skeleton duplicado com animação diferente
**Arquivo:** `src/styles.css` L210-212 (shimmer com `var(--border)`) vs `src/styles/design-system.css` L226-247 (shimmer com `color-mix(in srgb, var(--t-hi) 6%, transparent)`)

O segundo bloco vence (importado depois) e usa tokens dark-safe. O primeiro é lixo que aumenta o CSS. Mas há uma inconsistência sutil: a velocidade da animação é diferente (1.6s no primeiro vs 1.8s no segundo). Isso não é um bug visual mas é desordem.

### 3.4 `color-mix()` sem fallback
**Arquivo:** `src/app/page.tsx` L495, L1302 e `src/styles/design-system.css` inúmeras linhas

`color-mix(in srgb, ...)` requer Chrome 111+, Firefox 113+, Safari 16.2+. Sem `@supports` fallback. Em browsers levemente antigos (ex.: Chrome 100 em Android 8), os badges de fonte ficam sem cor de fundo.

**Fix:** Adicionar `@supports not (color: color-mix(in srgb, red 50%, blue))` com fallback de cor fixo, ou aceitar o risco dado que CanIUse mostra ~95% de suporte global.

### 3.5 `QuickActionCard` — `aria-label` esconde a descrição
**Arquivo:** `src/app/page.tsx` L285-330

O botão tem `aria-label={action.title}` (ex.: "Ver leilões da Receita") que SUBSTITUI o conteúdo DOM para AT. A descrição "Lotes com score e economia mapeada" fica visível na tela mas invisível para screen readers.

**Fix:** `aria-describedby` apontando para o `div` de descrição com um `id` gerado, ou combinar no `aria-label`: `aria-label={\`${action.title}: ${action.description}\`}`.

### 3.6 `<tr role="button">` anti-pattern
**Arquivo:** `src/app/page.tsx` L1898-1920

Linhas da tabela com `role="button"` em `<tr>` são semanticamente incorretas: AT anuncia "button" dentro de uma tabela, confundindo a relação de célula. ARIA authoring practices recomendam não colocar role interativo em elementos de tabela.

**Fix:** Adicionar botão "Ver detalhes" na última coluna (que já existe com "Analisar") e remover `role="button"` da linha. O click na linha pode ser mantido como convenience mas sem o role.

### 3.7 Placeholder do topbar sem role="search"
**Arquivo:** `src/App.tsx` L603

O `div.searchbar` tem `role="search"` ✓, mas o `<input>` tem `aria-label="Buscar"` que duplica com o `role="search"` do wrapper. Resultado: AT anuncia "buscar search input" repetindo a palavra. A label deve ser mais descritiva: "Buscar no Fonte.ia".

### 3.8 Ausência de `scope` nos `<th>` das tabelas
**Arquivo:** `src/app/page.tsx` L1698-1713 e L1873-1889

`<th>` sem `scope="col"` — screen readers não saberão que são cabeçalhos de coluna. Afeta leitores de tela em modo de tabela (NVDA/JAWS table mode).

### 3.9 Inconsistência de padding em `section-label`
**Arquivo:** `src/app/page.tsx` L1217 vs `src/styles.css` L264-272

Em `page.tsx`, `.section-label` tem `marginBottom: 10` inline. Em `styles.css`, `.section-label` é definido como eyebrow uppercase sem margem. A classe `.section-sub` tem `marginBottom: 14px` inline. Em outras páginas (licitações, empresas), os espaçamentos variam. Não há token de espaçamento `--s-*` usado consistentemente no dashboard.

**Fix:** Usar `className="section-label"` + `className="section-sub"` como classes semânticas e definir suas margens no CSS (não inline).

### 3.10 Mobile 375px — filtros em coluna única mas input não tem `type="search"`
**Arquivo:** `src/app/page.tsx` L1650-1654

O `<input>` do filtro de busca tem `aria-label` correto mas não tem `type="search"` — em iOS, isso previne que o teclado mostre o botão "Buscar" (return key label). Em mobile 375px os filtros colapsam para 1 coluna (correto via CSS), mas o input fica em 100% sem espaço para o `×` limpar que algumas UIs adicionam.

**Fix:** `type="search"` + considerar um botão de limpar (×) inline para o campo.

---

## 4. Dashboard Perfection — `src/app/page.tsx`

### 4.1 "Carro-chefe" card duplica informação e desperdiça espaço
**Arquivo:** L1280-1315

O terceiro card do `global-kpi-strip` mostra "Carro-chefe → Leilões (Receita Federal)" — informação óbvia que repete o próprio dashboard. O slot seria mais valioso mostrando algo dinâmico: **"Última coleta"** (timestamp do `lastSyncedAt` dos leilões) ou **"Lotes com score alto"** (contagem de `scoring.label === "alto"`).

**Fix:** Substituir o card estático por `<CountUp value={scoredLots.filter(e => e.scoring.label === 'alto').length} />` com label "Alta confiança".

### 4.2 KPI "Acompanhando" mostra 0 no primeiro render
**Arquivo:** L542, L558-560

O `watchlistSize` é inicializado com `useState(0)` e preenchido em `useEffect`. O CountUp anima de 0 para o valor real — mas se o usuário tem 5 itens na watchlist, verá "0 → 5" toda vez que abrir o Painel.

**Fix:** `useState(() => getWatchlistSize())` — o initializer já tem guard `typeof window !== "undefined"`.

### 4.3 "Destaque do dia" não rotaciona
**Arquivo:** L732-738

`featuredEntry` sempre é o lote com o maior score. Se o lote top não mudar por dias, o "Destaque do dia" nunca muda — não parece "do dia". Melhor rotular como "Melhor oportunidade agora" ou incluir aleatoriedade entre os top-3.

### 4.4 Tabela de lotes sem contagem de "filtros ativos"
**Arquivo:** L1638-1685

Quando há filtros ativos (riskFilter ≠ "all", personFilter ≠ "all"), o header mostra apenas "X lotes carregados" sem indicar que há filtros ativos. O usuário pode pensar que há poucos lotes disponíveis.

**Fix:** Adicionar badge "filtros ativos" + botão "Limpar" ao lado do header quando algum filtro está ativo. O "Limpar filtros" já existe no estado vazio mas não aparece enquanto houver resultados filtrados.

### 4.5 Distribuição de confiança com label invertido
**Arquivo:** L2067-2079

```tsx
<Bar label="Confiança alta" value={dist.baixo} ... />
<Bar label="Cautela"        value={dist.alto}  ... />
```
A variável `dist.baixo` representa lotes com score ≥ 70 (confiança ALTA) e `dist.alto` representa score < 45 (cautela/risco ALTO). Os nomes de variável estão invertidos semanticamente (baixo risco = alta confiança = `dist.baixo`). Confuso para leitores do código e potencialmente confuso para usuários se a interpretação mudar.

**Fix (semântico, sem bug visual):** Renomear as propriedades em `riskDistribution()` para `{ altoScore, medioScore, baixoScore }` para tornar o domínio explícito.

### 4.6 Sem indicação de "fonte ao vivo" vs "cache" nos cards de módulo
**Arquivo:** L1373-1391

O Dashboard exibe `count` de módulos, mas o usuário não sabe se está vendo dados ao vivo ou do seed. O badge "seed indexado" aparece apenas no total global (L1258), não nos cards individuais.

**Fix:** Adicionar um `<span className="tiny muted">ao vivo</span>` ou `<span className="tiny muted">cache</span>` no footer de cada ModuleCard quando `data.loaded === true`.

### 4.7 Animação de entrada com `nth-child` frágil
**Arquivo:** L1066-1078

```css
.dash-section-enter:nth-child(1) { animation-delay: 0ms; }
.dash-section-enter:nth-child(5) { animation-delay: 160ms; }
```
Se uma section for condicional (ex.: `isLoading ? null : <section>`) e seu slot no DOM mudar, os delays de animação ficam dessincronizados. `:nth-child` conta filhos DOM, não "seções semânticas".

**Fix:** Usar CSS custom property `--stagger-delay` (já definida no design-system: `.stagger > * { animation-delay: calc(var(--i, 0) * 55ms) }`) com `style={{ "--i": 0 } as React.CSSProperties}` em cada section.

### 4.8 Table rows — evento de click sem feedback visual em dispositivos touch
**Arquivo:** L1896-2044

As linhas da tabela têm `transition: background .14s` no hover, mas em dispositivos touch o hover não se mantém. Não há estado `:active` definido para `.lot-row`.

**Fix:** Adicionar `.lot-row:active { background: var(--surface-2); }` no CSS da tabela.

---

## 5. Velocidade — Proposta de `manualChunks` Detalhada

### Configuração `apps/web/vite.config.ts` completa

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    reportCompressedSize: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // ─── Vendor: runtime React (cacheable longo)
          if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/")) {
            return "vendor-react";
          }
          // ─── Vendor: Supabase JS (60-80 KB gzip, muda raramente)
          if (id.includes("/node_modules/@supabase/")) {
            return "vendor-supabase";
          }
          // ─── Lucide icons (imports são tree-shaken mas o runtime ainda é pesado)
          if (id.includes("/node_modules/lucide-react/")) {
            return "vendor-lucide";
          }
          // ─── Domain packages (domain, sources, scoring, ai, billing)
          if (id.includes("/packages/") || id.includes("@fonteia/")) {
            return "domain";
          }
          // ─── Auth + Landing (necessários antes do login — fast first paint)
          if (
            id.includes("/app/auth/") ||
            id.includes("/auth/") ||
            id.includes("/app/landing/") ||
            id.includes("/app/onboarding/")
          ) {
            return "auth-shell";
          }
          // ─── Features de leilões (carro-chefe — carregadas quase sempre)
          if (id.includes("/features/leiloes/") || id.includes("/app/lotes/") || id.includes("/app/leiloes/")) {
            return "feature-leiloes";
          }
          // ─── Features secundárias (carregadas sob demanda)
          if (
            id.includes("/features/licitacoes/") ||
            id.includes("/features/empresas/") ||
            id.includes("/features/politica/") ||
            id.includes("/features/municipios/")
          ) {
            return "feature-core";
          }
          if (
            id.includes("/features/ambiental/") ||
            id.includes("/features/juridico/") ||
            id.includes("/features/inpi/") ||
            id.includes("/features/cerebro/")
          ) {
            return "feature-secondary";
          }
          // ─── AI components (pesados, só carregados em telas de busca/chat)
          if (id.includes("/components/ai/") || id.includes("/features/raio-x/")) {
            return "feature-ai";
          }
          // ─── Páginas públicas de marketing (não entram no bundle autenticado)
          if (id.includes("/app/publico/") || id.includes("/app/guias/") || id.includes("/app/ferramentas/")) {
            return "public-marketing";
          }
        },
      },
    },
  },
});
```

**Estimativa de impacto:**

| Chunk | Antes | Depois (estimado) |
|---|---|---|
| `index.js` (main) | 577 KB / 163 KB gz | ~180 KB / ~52 KB gz |
| `vendor-react` | — | ~150 KB / ~42 KB gz |
| `vendor-supabase` | — | ~160 KB / ~45 KB gz |
| `vendor-lucide` | — | ~80 KB / ~22 KB gz |
| `feature-leiloes` (lazy) | 63 KB | ~65 KB |
| `public-marketing` (lazy) | múltiplos | agrupados |

**Observação:** Lucide-react v1.17.0 (`package.json`) — verificar se é tree-shaken por padrão com Vite (deve ser, pois é ESM). O chunk `vendor-lucide` pode não ser necessário se o tree-shaking funcionar corretamente; confirmar com `rollup-plugin-visualizer`.

---

## 6. O Que Está Bom (Não Tocar)

- **Auth context** (`src/auth/auth-context.tsx`): Implementação sólida com demo mode, onAuthStateChange correto sem race condition, sem window/localStorage no caminho crítico.
- **Error handling de APIs:** Todas as feature APIs usam try/catch com mensagens amigáveis; erros técnicos são `console.error` only, nunca expostos ao usuário.
- **`Ring.tsx` e `ScoreRing.tsx`:** SSR-safe (window.matchMedia em useEffect), prefers-reduced-motion respeitado, aria-hidden no SVG correto.
- **`d1-cache.ts`:** Implementação correta de TTL + in-flight deduplication + eviction. Bem documentado.
- **Lazy loading:** 33 rotas são lazy com `React.lazy()` e `<Suspense>`. AppShell tem ErrorBoundary. Correto.
- **Design system tokens:** Excelente cobertura (light/dark, shadows, radius, colors). A exceção é o conflito de valores de `--r-*` descrito acima.
- **Responsividade:** Mobile breakpoints bem pensados (375px, 480px, 640px, 900px). Bottom nav, FAB, drawers funcionam.
- **Acessibilidade básica:** `aria-label` nos inputs de filtro, `aria-hidden` nos ícones decorativos, `aria-current` no nav, `prefers-reduced-motion` respeitado em animações e skeleton.
- **SEO/meta:** `index.html` tem OG tags, Twitter cards, structured data JSON-LD completo, canonical URL, manifest, theme-color. Excelente.
- **Fonte self-hosted:** `@fontsource-variable/figtree` sem CDN externo — sem latência de terceiros, GDPR-safe.
- **IntelligenceOmnibox:** focus trap correto, Esc fecha, ⌘K/Ctrl+K funciona, degradação graciosa em 503.
- **`CountUp`:** `requestAnimationFrame`, ease cubic correto, locale pt-BR, prefers-reduced-motion.
- **`getWatchlistSize()`:** SSR-safe com `typeof window !== "undefined"`, JSON.parse com try/catch.

---

## Checklist Rápido para o Agente de Execução

```
[ ] Criar apps/web/vite.config.ts com manualChunks proposto
[ ] Remover --r-sm/--r-md/--r-xl duplicados de src/styles.css
[ ] Remover font-family: "Inter" do :root em src/styles.css  
[ ] Remover .skeleton / .skeleton::after duplicados de src/styles.css (L210-212)
[ ] Adicionar key={route} no <ErrorBoundary> em App.tsx L689
[ ] Substituir color: "#1D5FE0" por color: "var(--brand-ink)" em page.tsx L1302, L1415
[ ] Adicionar scope="col" em todos os <th> de tabelas em page.tsx
[ ] Converter <div role="button" class="closing-soon-row"> para <button type="button">
[ ] Adicionar aria-live="polite" aria-atomic="true" e debounce ao CountUp
[ ] Trocar aria-label={action.title} por aria-label={`${action.title}: ${action.description}`} nos QuickActionCards
[ ] Mudar useState(0) para useState(() => getWatchlistSize()) para watchlistSize
[ ] Adicionar window.history.replaceState após checkoutOk em App.tsx
[ ] Adicionar type="search" ao input do filtro em page.tsx L1650
[ ] Adicionar .lot-row:active { background: var(--surface-2) } no CSS
[ ] Adicionar scope de TTL via cachedFetch nas feature APIs (listLicitacoes, listMunicipios, etc.)
[ ] Mover os blocos <style> de page.tsx e App.tsx para arquivos CSS estáticos
```
