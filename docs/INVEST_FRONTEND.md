# Investigação Frontend — Fonte.ia
**Data:** 2026-06-13  
**Escopo:** apps/web — read-only, sem edições aplicadas

---

## BUG 1 — Dark mode: fundo da página Conta fica branco

### Causa raiz

**`apps/web/src/styles.css`, linhas 480–490**

```css
.command-center,
.opportunity-board,
.evidence-panel,
.module-rail,
.source-health,
.page-panel,          /* ← wraper da AccountPage */
.answer-card,
.score-detail,
.lot-detail-header,
.lot-detail-meta {
  background: var(--white);   /* ← problema aqui */
  ...
}
```

`--white` é declarado em `styles.css` linha 33 como `#ffffff` e **nunca é sobrescrito** no seletor `[data-theme="dark"]` de `design-system.css`. O design system define `--surface: #0E1626` para dark (design-system.css linha 37), mas o bloco acima usa `--white` estático.

O componente `AccountPage` (`apps/web/src/app/account/page.tsx`, linha 1084) usa `className="page-panel account-page"`, então toda a tela herda `background: #ffffff` independente do tema. Os botões funcionam porque eles usam corretamente `var(--surface)` / `var(--brand-ink)` inline.

### Correção proposta

Em `apps/web/src/styles.css`, linha 490, trocar `var(--white)` por `var(--surface)`:

```css
/* antes */
background: var(--white);

/* depois */
background: var(--surface);
```

Isso corrige o fundo de todos os painéis listados no seletor (`.page-panel`, `.evidence-panel`, `.lot-detail-header`, etc.) de uma vez, sem tocar em nenhum componente.

---

## BUG 2 — Searchbar do topo só abre /app/lotes em vez de pesquisar

### Causa raiz

**`apps/web/src/App.tsx`, linha 356**

```tsx
<div
  className="searchbar"
  style={{ cursor: "pointer" }}
  onClick={() => go("/app/lotes")}   /* ← navega para lotes, não busca */
  role="button"
  tabIndex={0}
>
  <Search size={16} ... />
  <input placeholder="Buscar lote, órgão ou edital…" readOnly tabIndex={-1} ... />
  <span className="kbd">⌘K</span>
</div>
```

O `<input>` é `readOnly` e `tabIndex={-1}`, tornando-o puramente visual. O clique inteiro navega para `/app/lotes` sem capturar texto.

O que existe e está pronto: a função `goToSearch(question?)` na linha 223 de App.tsx navega corretamente para `/app/buscar` com um seed de pesquisa. A `SearchPage` (`apps/web/src/app/search/page.tsx`) já aceita `initialQuestion` e executa ranking real por tokens.

### Correção proposta

Em `App.tsx`:

1. Adicionar estado `const [topbarQuery, setTopbarQuery] = useState("")` próximo de `searchSeed` (linha 182).
2. Remover `readOnly` e `tabIndex={-1}` do `<input>`; adicionar `value={topbarQuery}` e `onChange={(e) => setTopbarQuery(e.target.value)}`.
3. Remover o `onClick={() => go("/app/lotes")}` do container; substituir por `onFocus` opcional que apenas garante visibilidade.
4. Adicionar `onKeyDown` no input: quando `e.key === "Enter"` e `topbarQuery.trim()`, chamar `goToSearch(topbarQuery)` e limpar o campo.
5. Opcional: globalizar `⌘K` / `Ctrl+K` num `useEffect` que foca o input.

---

## BUG 3 — Cards de lote sem o nome do item

### Causa raiz

**`packages/sources/src/connectors/receita-leiloes.ts`, linhas 28–50 (tipo `ReceitaLeilaoLot`)**

O tipo base não tem campo `title` nem `description`. O endpoint `/destaques` da Receita retorna apenas: `orgao`, `cidade`, `edital`, `edle`, número do lote, valor, prazo e imagem de destaque. A descrição real do item (`descricao`) só existe em `ReceitaLoteItemRaw.descricao` (catalog connector, linha 165), acessível via `fetchLoteDetalhe()` — chamada separada por lote, feita apenas na tela de detalhe.

O que está disponível nos cards do painel: campo `category` (opcional, ex. `"VEÍCULO"`, `"PRODUTO MINERAL"`) populado pelo ingest completo (catalog). Nos lotes via destaque (API ao vivo), `category` pode ser `undefined`.

No dashboard (`apps/web/src/app/page.tsx`, linha 275): `cardLabel` é construído como `"Lote ${lot.displayNumber} — ${lot.agency}, ${displayCity(lot.city)}"` — sem category.

Na listagem de lotes (`apps/web/src/app/lotes/page.tsx`, linha 357): `lot.category` já é exibido como chip quando existe (linha 372), mas não no título principal do card.

### Correção proposta

**Imediato (sem nova API call):** Em `apps/web/src/app/lotes/page.tsx`, dentro do `LoteCard`, promover `lot.category` para linha de destaque logo abaixo do número do lote:

```tsx
<div style={{ fontWeight: 700 }}>
  {lot.category ?? "Bem apreendido"}
</div>
<div style={{ fontSize: 12, color: "var(--t-mid)", fontFamily: "monospace" }}>
  Lote {lot.displayNumber}
</div>
```

No dashboard (`page.tsx`), acrescentar `{lot.category ? ` · ${lot.category}` : ""}` ao `cardLabel` e exibir como subtítulo da célula da tabela.

**Médio prazo:** adicionar `description?: string` ao tipo `ReceitaLeilaoLot` e populá-lo com `itensDetalhesLote[0].descricao` durante o ingest. Assim o card mostra a descrição real sem call extra.

---

## BUG 4 — Raio-X está no fim da coluna direita; deve estar no topo

### Causa raiz

**`apps/web/src/app/leiloes/lot-detail-page.tsx`, linhas 1836–2058**

Na sidebar (`.evidence-panel`), a ordem JSX atual é:

1. **Linhas 1838–2048:** Bloco do Assistente Fonte.ia / Raio-X com IA
2. **Linha 2050:** `<hr className="divide" />`
3. **Linhas 2053–2057:** `<EvidencePanel>` (trilha de fonte)

No **desktop**, o layout usa `grid` com sticky sidebar (styles.css linha 1613): o Raio-X aparece no topo corretamente porque é o primeiro filho.

No **mobile** (styles.css linha 958), `.lot-detail` vira `flex-direction: column`, e a `.evidence-panel` inteira aparece após todo o conteúdo de `.lot-detail-main`. Como `.lot-detail-main` tem a foto hero, identidade, score, análise e edital por IA — são ~1500px de conteúdo — o Raio-X só aparece após rolar tudo.

**Em resumo:** o Raio-X já está primeiro dentro da sidebar, mas a sidebar inteira vai para o fim em mobile.

### Correção proposta

Extrair o bloco do Assistente Fonte.ia (linhas 1836–2049) do `.evidence-panel` e movê-lo para **dentro de `.lot-detail-main`**, logo após o botão de voltar e antes do hero, **somente no mobile**. A forma mais limpa:

1. Criar um componente `<RaioXPanel>` com o conteúdo atual das linhas 1838–2048.
2. Renderizá-lo em dois lugares:
   - Dentro de `.lot-detail-main` com `className="raiox-mobile"` (visível só em mobile via CSS: `display:block; @media md: display:none`).
   - No topo da sidebar `.evidence-panel` com `className="raiox-desktop"` (oculto em mobile).
3. Alternativa mais simples: adicionar `order: -1` no CSS da `.evidence-panel` em mobile dentro do flex container — mas isso move a sidebar inteira (incluindo Evidência) para cima, que pode não ser o desejado.

---

## BUG 5 — Status das Fontes é estático e nunca atualiza

### Causa raiz

**`packages/sources/src/catalog.ts`, linha 3** — `SOURCE_CATALOG` é um array TypeScript hardcoded. Cada fonte tem `status` definido em tempo de compilação (ex: linha 10: `status: "fragile_operational"` para a Receita).

**`apps/web/src/app/sources/page.tsx`, linhas 1–12** — importa o catálogo diretamente:

```ts
import { SOURCE_CATALOG } from "@fonteia/sources";
```

Não há `useEffect`, nenhuma chamada HTTP, nenhum polling. O badge "operacional frágil" é permanente independente da situação real da API da Receita.

O `SourceStatus` está em `packages/domain/src/sources.ts` e tem os valores: `connected`, `fragile_operational`, `integrating`, `open_no_api`, `complementary_non_government`, `restricted_government`, `paid_or_credentialed`, `deprecated`.

### Correção proposta

Em `apps/web/src/app/sources/page.tsx`:

1. Adicionar estado: `const [runtimeStatus, setRuntimeStatus] = useState<Record<string, SourceStatus>>({})`.
2. Em `useEffect` (sem deps, roda 1x), chamar `listLeilaoLots()` (já importado em outros lugares do app):
   - Se retornar `source !== "empty"` → `runtimeStatus["receita-leiloes-sle"] = "connected"`.
   - Se retornar `source === "empty"` ou lançar erro → `runtimeStatus["receita-leiloes-sle"] = "deprecated"`.
3. No `SourceRow`, usar `runtimeStatus[source.id] ?? source.status` como status efetivo.
4. Para outras fontes futuras, criar um endpoint `/health` no Worker que pinga cada integração ativa e retorna `Record<sourceId, SourceStatus>`.

---

## BUG 6 — App mostra no máximo ~1000–2000 lotes (sem paginação)

### Causa raiz

**`apps/web/src/features/leiloes/leiloes-api.ts`, linha 56**

```ts
const query = "entities?kind=eq.auction_lot&select=attributes,updated_at&order=updated_at.desc&limit=2000";
```

O fallback Supabase é capped a 2000 registros. O caminho primário (`fetchApiLots`, linha 34) chama `/leiloes/lotes` no Worker sem parâmetro de paginação — o Worker (`services/api/src/worker.ts`, linha 354) busca os destaques da Receita ao vivo, que por natureza são limitados ao payload de `/destaques` da Receita (destaques ativos no momento).

Não existe paginação em nenhuma camada do front: `listLeilaoLots` retorna sempre um array flat. O dashboard (`page.tsx`) usa scroll infinito client-side (`ROWS_PER_PAGE = 25`) mas sobre o array total — se o total for 2000, o scroll funciona, mas o teto é 2000.

O problema real para o crescimento: a ingestão via catálogo pode ter muito mais lotes (`ingest-receita-catalog.ts`), mas o front só acessa via Supabase REST com `limit=2000`.

### Correção proposta

**Curto prazo:** Aumentar `limit=2000` para `limit=5000` em `leiloes-api.ts` linha 56, e adicionar header `Prefer: count=exact` para detectar truncamento:

```ts
const query = "entities?kind=eq.auction_lot&select=attributes,updated_at&order=updated_at.desc&limit=5000";
// headers: { ..., "Prefer": "count=exact" }
// Verificar resposta Content-Range header para saber se houve truncamento
```

**Médio prazo:** Implementar paginação server-side real em `fetchSupabaseLots` usando `range` do Supabase REST:
- 1ª chamada: `range=0-999`
- 2ª chamada: `range=1000-1999`
- Continuar até receber menos de 1000 resultados
- Concatenar e retornar

**Longo prazo:** Adicionar paginação no `SearchPage` e `LotesPage` para carregar próximas páginas via API em vez de buscar todos os lotes de uma vez no mount.

---

## Resumo Executivo — Correções Priorizadas

| Prioridade | Bug | Arquivo principal | Complexidade | Impacto |
|---|---|---|---|---|
| 🔴 P1 | Dark mode fundo branco | `styles.css:490` | **1 linha** | Qualidade visual — toda sessão dark |
| 🔴 P1 | Searchbar não busca | `App.tsx:356` | Baixa (~15 linhas) | Feature core — discoverability |
| 🟠 P2 | Raio-X no fim (mobile) | `lot-detail-page.tsx:1836` + CSS | Média | Conversão — principal CTA |
| 🟠 P2 | Cards sem nome do item | `lotes/page.tsx:357` + `page.tsx:275` | Baixa | Usabilidade — compreensão imediata |
| 🟡 P3 | Limite 2000 lotes | `leiloes-api.ts:56` | Baixa (fix rápido) → Média (paginação) | Escalabilidade |
| 🟡 P3 | Status fontes estático | `sources/page.tsx` | Média | Confiança / credibilidade |

### Observação sobre Bug 3
`ReceitaLeilaoLot` não tem `title`/`description` — o campo disponível é `category` (opcional). Descrição completa do item (`itensDetalhesLote[].descricao`) só existe no payload de detalhe por lote. Exibir `category` já melhora muito a UX sem custo de API adicional.

### Observação sobre Bug 4
A ordem JSX no sidebar está correta — o Raio-X é o primeiro filho. O problema é só em mobile, onde a sidebar inteira empurra para baixo do conteúdo principal. A correção requer ou duplicar o bloco (mobile vs desktop) ou extrair para componente reutilizável com visibilidade controlada por CSS.
