# Investigação de Dados — Fonte.ia × SLE Receita Federal

**Data:** 2026-06-13  
**Escopo:** Três questões abertas pelo dono: PDFs adicionais do edital, título/descrição do lote no painel, e cap de ~1000 lotes na ingestão.

---

## 1. Outros PDFs do edital — endpoint `relacao-lotes`

### O que já existe

A função `supabase/functions/edital-pdf/index.ts` chama:

```
GET https://www25.receita.fazenda.gov.br/sle-sociedade/api/edital/{u}/{n}/{e}/edital-completo
```

Retorna `{ "data": "<base64 PDF>" }`. Confirmado empiricamente (magic `%PDF-1.7`).

### Segundo documento disponível — Relação de Lotes (PDF)

O código em `packages/sources/src/connectors/receita-leiloes-catalog.ts` já documenta e exporta a função auxiliar `relacaoLotesPdfApiUrl` (linha 63):

```typescript
export function relacaoLotesPdfApiUrl(edle: string): string {
  return `${editalApiUrl(edle)}/relacao-lotes`;
}
```

**Verificação em tempo real:** O endpoint foi testado ao vivo:

```
GET https://www25.receita.fazenda.gov.br/sle-sociedade/api/edital/0317900/000002/2026/relacao-lotes
```

Resposta: base64 de um PDF de 15+ páginas com o PDF da relação de bens/itens do edital (magic `%PDF-1.5`). Mesmo envelope `{ "data": "..." }` do edital-completo.

### Outros endpoints inferidos da API do SLE

A partir do padrão `api/edital/{u}/{n}/{e}/{sufixo}`, os sufixos conhecidos ou altamente prováveis são:

| Sufixo | Status | Conteúdo |
|---|---|---|
| `edital-completo` | **Confirmado** | Edital completo (texto legal, regras, datas) |
| `relacao-lotes` | **Confirmado ao vivo** | Lista de todos os lotes/bens do edital em PDF |
| `termo-adesao` | Inferido | Termo de adesão para habilitação |
| `laudo` | Inferido | Laudo de avaliação dos bens (quando existir) |

O campo `preCondicoesLinks` na resposta JSON do edital (endpoint `api/edital/{u}/{n}/{e}`) provavelmente contém os links disponíveis para cada edital específico — vale inspecionar para descobrir dinamicamente quais PDFs existem.

### Como adicionar o botão "Relação de itens (PDF)" no painel

**Opção A — Reutilizar a função `edital-pdf` com parâmetro `doc`**

Adicionar `?doc=relacao-lotes` à função existente (`supabase/functions/edital-pdf/index.ts`):

```typescript
// linha ~74 — trocar o sufixo fixo por variável
const DOC_SUFIXOS = ["edital-completo", "relacao-lotes"] as const;
type DocSufixo = typeof DOC_SUFIXOS[number];

const docParam = (searchParams.get("doc") ?? "edital-completo") as DocSufixo;
if (!DOC_SUFIXOS.includes(docParam)) return jsonErr("doc inválido", 400);

const url = `${SLE_BASE}/api/edital/${unidade}/${numero}/${exercicio}/${docParam}`;
```

Nome do arquivo a ajustar (ex.: `relacao_lotes_0317900_000002_2026.pdf`).

**No front (`apps/web/src/app/leiloes/lot-detail-page.tsx`)**

Junto ao botão `baixarEdital()` (linha ~840), adicionar:

```typescript
async function baixarRelacao() {
  const { url, key } = getSupabasePublicConfig();
  const res = await fetch(
    `${url}/functions/v1/edital-pdf?edle=${encodeURIComponent(lot.edle)}&doc=relacao-lotes`,
    { headers: { apikey: key } },
  );
  // mesmo tratamento de blob + download do baixarEdital()
}
```

Botão:
```tsx
<button className="ghost-button lot-hero-action" onClick={() => void baixarRelacao()} type="button">
  <FileText aria-hidden="true" size={16} />
  Relação de itens (PDF)
</button>
```

**Opção B — Edge Function separada `relacao-lotes-pdf`** (mais simples de fazer rollback, recomendado se quiser evitar mudança na função existente — copiar e alterar o sufixo).

---

## 2. Nome/descrição do item para o painel

### Situação atual

O tipo `ReceitaLeilaoLot` (`packages/sources/src/connectors/receita-leiloes.ts`, linha 28) não tem campo de descrição do bem. O campo `category` (`lote.category` = `lote.tipo` do SLE, ex.: `"CELULAR/ACESSÓRIO"`) é o único indicador de natureza disponível na ingestão em lote.

O painel já faz a coisa certa: na `LotDetailPage` (`apps/web/src/app/leiloes/lot-detail-page.tsx`, linha 665), o `itemTitle` é preenchido por `detalhe?.titulo`, onde `detalhe` vem de `fetchLoteDetalhe()` chamado sob demanda ao abrir o lote (linha 640). A função `lote-detalhe` já constrói esse título.

### Onde está a descrição

Endpoint real do SLE:
```
GET https://www25.receita.fazenda.gov.br/sle-sociedade/api/lote/{u}/{n}/{e}/{nrAtribuido}
```

Campos relevantes na resposta (`supabase/functions/lote-detalhe/index.ts`, linha 36–52):

| Campo | Onde | Exemplo real |
|---|---|---|
| `tipo` | Raiz do objeto | `"CELULAR/ACESSÓRIO"` |
| `itensDetalhesLote[].descricao` | Array de itens | `"SMARTPHONE APPLE IPHONE 11 128GB..."` |
| `itensDetalhesLote[].quantidade` | Array de itens | `2` |
| `itensDetalhesLote[].unMedida` | Array de itens | `"un"` |
| `itensDetalhesLote[].recintoArmazenador` | Array de itens | `"J. Log Logística"` |

### Como `lote-detalhe` já gera o título curto

A função `buildTitulo` (`supabase/functions/lote-detalhe/index.ts`, linha 69):

```typescript
function buildTitulo(itens: Array<{ descricao: string }>): string | null {
  const first = itens[0]?.descricao;
  if (!first) return null;
  const head = first.length > 90 ? `${first.slice(0, 87).trimEnd()}…` : first;
  if (itens.length <= 1) return head;
  const extra = itens.length - 1;
  return `${head} (+${extra} ${extra === 1 ? "item" : "itens"})`;
}
```

Exemplo de saída: `"SMARTPHONE APPLE IPHONE 11 128GB SPACE GRAY (+1 item)"`.

A limpeza de lixo jurídico (`cleanDescricao`, linha 65) remove sufixos como `////VEDADA A COMERCIALIZAÇÃO.`.

### O que falta para mostrar no card da lista

O `LotCard` em `apps/web/src/app/lotes/page.tsx` só mostra `lot.category` (o `tipo`) no chip. Para mostrar a descrição real no card seria necessário:

**Opção 1 (recomendada) — persistir o título na ingestão**

Na `ingest-receita-catalog`, após buscar `listaLotes`, fazer um segundo fetch para os lotes com mais de X fotos ou valor alto, chamar `api/lote/{edle}/{nrAtribuido}`, e persistir `itensDetalhesLote[0].descricao` em `entities.attributes.itemTitle` (ou `entities.name`).

Custo: ~1 req/lote → impraticável para todos os lotes em massa. Fazer apenas para lotes destaque ou de alto valor.

**Opção 2 (atual, já funciona no detalhe) — lazy load no abrir o lote**

Já implementado: ao abrir um lote, `fetchLoteDetalhe()` busca o detalhe e preenche `itemTitle`. O card da lista não exibe o título descritivo — mostra só `lot.category` + cidade + agência, que é o comportamento correto para a grade (menos carga, sem N+1 requests).

**Opção 3 — enriquecer apenas os destaques**

Na ingestão de destaques (`receita-leiloes.ts`), o campo `imagemDestaque` já está presente. Para lotes destacados, fazer o fetch de detalhe durante a ingestão e salvar `descricao` no atributo.

**Conclusão:** O painel de detalhe já funciona (título aparece assim que o lote abre). Para o card na lista, a solução mais correta é enriquecer só os destaques/lotes de maior valor durante a ingestão — evita N+1 na coleta.

---

## 3. Limite de ~1000 lotes — causa e correção

### A causa real não é a ingestão — é a consulta do front

A ingestão (`ingest-receita-catalog`) itera **todos os editais** e **todos os lotes** de cada edital via `api/editais-disponiveis` + `api/edital/{edle}`. Não há `limit` na coleta. O RPC `ingest_receita_catalog` (`infra/migrations/0004_ingest_receita_catalog.sql`) também não tem cap — é um `FOR v_lot IN ... LOOP` sem limite.

**O gargalo está na consulta do front**, em `apps/web/src/features/leiloes/leiloes-api.ts`, linha 56:

```typescript
const query = "entities?kind=eq.auction_lot&select=attributes,updated_at&order=updated_at.desc&limit=2000";
```

O front pede `limit=2000`. Se o banco tiver mais de 2000 lotes, o front nunca vê os demais. **E antes disso**, o Supabase PostgREST tem um `max-rows` padrão de **1000** — qualquer query sem `Prefer: count=exact` e sem `Range` header retorna no máximo 1000 linhas, silenciosamente.

Portanto há **dois limites**:
1. PostgREST default `max-rows = 1000` (configuração do servidor Supabase — não exposta ao usuário em projetos hosted).
2. O `limit=2000` hardcoded no front, que só protege se o PostgREST for configurado para > 1000.

### Evidência do cap no SLE

A API `editais-disponiveis` do SLE **também tem cap**, confirmado ao vivo: o campo `editaisEstaoLimitados: true` aparece nas situações 11, 12, 14 e 15 (encerrados/histórico). Isso significa que **o SLE limita quantos editais encerrados retorna** — não há parâmetro de paginação documentado no endpoint. Os editais **abertos** (situação 2, 3, 5, 6, 7) voltam completos (`editaisEstaoLimitados: false`).

### Correções

**Correção 1 — Paginação no front (`leiloes-api.ts`)**

Substituir a query única por paginação via header `Range`:

```typescript
async function fetchSupabaseLots(fetcher: typeof fetch): Promise<{ lots: ReceitaLeilaoLot[]; lastSyncedAt?: string }> {
  const { url: supabaseUrl, key: publishableKey } = getSupabasePublicConfig();
  const PAGE = 1000;
  let offset = 0;
  const allRows: SupabaseEntityRow[] = [];

  while (true) {
    const response = await fetcher(
      `${trimTrailingSlash(supabaseUrl)}/rest/v1/entities?kind=eq.auction_lot&select=attributes,updated_at&order=updated_at.desc`,
      {
        headers: {
          accept: "application/json",
          apikey: publishableKey,
          authorization: `Bearer ${publishableKey}`,
          "Range-Unit": "items",
          Range: `${offset}-${offset + PAGE - 1}`,
          Prefer: "count=none",
        },
      },
    );
    if (!response.ok) throw new Error(`Supabase REST returned ${response.status}`);
    const rows = (await response.json()) as SupabaseEntityRow[];
    allRows.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  const lots = allRows.map((row) => row.attributes).filter((lot) => lot?.sourceId === "receita-leiloes-sle");
  return { lots, lastSyncedAt: allRows.find((row) => row.updated_at)?.updated_at };
}
```

**Correção 2 — Configurar `max-rows` no Supabase**

No dashboard Supabase → Settings → API → `Max rows` → aumentar de 1000 para 5000 (ou remover o limite com `0`). Isso garante que mesmo sem paginação no front, a query retorna mais registros.

**Correção 3 — Ingestão recorrente dos editais encerrados**

O `editaisEstaoLimitados: true` mostra que o SLE limita o histórico retornado por padrão. Para capturar editais encerrados não retornados pelo endpoint padrão, a ingestão pode filtrar apenas editais abertos (situações 2, 3, 5, 6, 7) — já feito na `ingest-receita-catalog` (linha 131, filtro `OPEN`). Isso é correto: o cap do SLE é nos encerrados, que têm valor limitado para o produto hoje.

**Correção 4 — Cron de 6h**

A `ingest-receita-catalog` deve rodar a cada 6 horas para capturar novos editais. No Supabase Dashboard → Edge Functions → Schedules → criar schedule `0 */6 * * *` apontando para a função. Hoje não há cron configurado no código do repositório.

---

## Resumo Executivo

**PDFs adicionais:** O SLE expõe pelo menos dois PDFs por edital via o mesmo padrão de envelope base64: `edital-completo` (já implementado) e `relacao-lotes` (confirmado ao vivo). O código em `packages/sources/src/connectors/receita-leiloes-catalog.ts:63` já tem a URL mapeada. Para adicionar o botão "Relação de itens (PDF)", basta parametrizar a função `edital-pdf` com `?doc=relacao-lotes` e adicionar um segundo botão no `lot-detail-page.tsx`.

**Título/descrição do lote:** O dado já existe e já funciona no detalhe — a função `lote-detalhe` chama `api/lote/{edle}/{nrAtribuido}`, lê `itensDetalhesLote[].descricao` e monta o `titulo` curto (truncado em 90 chars + `+N itens`). O painel de detalhe já exibe esse título. Para o card na grade, a solução certa é enriquecer só os destaques/lotes de alto valor durante a ingestão e persistir o campo em `entities.attributes.itemTitle` — não fazer N+1 em todos os lotes.

**Cap de 1000 lotes:** O gargalo principal está no front (`leiloes-api.ts:56`, `limit=2000`) combinado com o `max-rows=1000` padrão do PostgREST do Supabase. A ingestão em si não tem cap. Correções: (a) paginar a query do front com header `Range`, (b) aumentar `max-rows` no dashboard Supabase, (c) criar cron de 6h para a `ingest-receita-catalog`. O SLE também limita editais encerrados (`editaisEstaoLimitados: true` nas situações 11/12/14/15), mas o filtro de abertos já está correto na ingestão.
