# Contrato de Ingestão — Receita Federal / Sistema de Leilão Eletrônico (SLE)

> Recon do portal público SLE da Receita Federal para a Fonte.ia.
> Objetivo: ingerir **todos os editais** e **todos os lotes** (não apenas os "destaques").

**Host:** `https://www25.receita.fazenda.gov.br`
**Base path do portal/API:** `/sle-sociedade/`
**Tipo de app:** SPA Angular (`<sle-app>`, bundle único `main-*.js`), backend Java (`Undertow/1` atrás de `nginx`).
**Data do recon:** 2026-06-13.

---

## 0. TL;DR (resposta direta)

- **Existe uma API JSON interna, sem documentação, mas pública e anônima.** Foi confirmada ao vivo. Não exige login, token, cookie, header `Accept`, nem User-Agent específico para leitura. Não há captcha nas rotas de leitura.
- **Dá para listar TODOS os editais via JSON** em uma única chamada: `GET /api/editais-disponiveis`.
- **Dá para obter TODOS os lotes de um edital via JSON** em uma única chamada: `GET /api/edital/{unidade}/{numero}/{exercicio}` (retorna o edital completo já com `listaLotes[]`). O detalhe rico de cada lote (descrição, itens, fotos) vem de `GET /api/lote/{unidade}/{numero}/{exercicio}/{lote}`.
- **O PDF oficial vem pela própria API**, em base64, dentro de um JSON `{data, name, length}` — não há URL direta de arquivo `.pdf`. Endpoints: `.../edital-completo` (edital) e `.../relacao-lotes` (relação de lotes).
- **Não usar o endpoint `destaques` como fonte do catálogo.** Ele só traz os lotes promovidos.

**Recomendação:** ingestão **JSON-first** (estrutura + metadados via JSON) + baixar o PDF `edital-completo` como **evidência** e guardar com hash de conteúdo. PDF não é o caminho primário aqui — é a prova.

---

## 1. Como a SPA carrega os dados

O HTML inicial (`/sle-sociedade/`) é uma casca vazia ("Carregando...") que só carrega `main-*.js`. Toda a leitura de dados é feita pelo `HttpClient` do Angular contra rotas relativas à `<base href="/sle-sociedade/">`, ou seja, todas as chamadas resolvem para `https://www25.receita.fazenda.gov.br/sle-sociedade/api/...`.

O mapeamento abaixo foi extraído lendo o bundle `main-*.js` (todas as chamadas `http.get(...)`) e **confirmado ao vivo** com `curl` nas rotas marcadas como ✅.

Rotas de navegação da SPA (úteis como `sourceUrl` humano, não são API):

| Rota da SPA | Significado |
|---|---|
| `/sle-sociedade/portal/editais-disponiveis` | tela com a lista de editais |
| `/sle-sociedade/portal/edital/{unidade}/{numero}/{exercicio}` | tela de um edital + lotes |
| `/sle-sociedade/portal/edital/{edle}/lote/{lote}` | tela de um lote |

---

## 2. Tabela de endpoints (API interna)

Todos os caminhos são relativos a `https://www25.receita.fazenda.gov.br/sle-sociedade/`.
Notação da chave do edital: **`edle = {unidade}/{numero}/{exercicio}`** (ex.: `200100/1/2026`).

| # | Método | URL (pattern) | Retorna | Status no recon | Usar para ingestão? |
|---|---|---|---|---|---|
| 1 | GET | `api/editais-disponiveis` | Catálogo COMPLETO de editais, agrupado por situação | ✅ 200 (~29 KB) | **SIM — porta de entrada** |
| 2 | GET | `api/editais-disponiveis/unidadesExecutoras` | Lista de nomes de unidades executoras (para filtro) | ✅ 200 (array de strings) | opcional (filtro/UX) |
| 3 | GET | `api/edital/{unidade}/{numero}/{exercicio}` | Edital completo **+ `listaLotes[]`** (todos os lotes, resumidos) | ✅ 200 (~455 KB p/ 191 lotes) | **SIM — edital + lotes** |
| 4 | GET | `api/edital/{unidade}/{numero}/{exercicio}/edital-completo` | **PDF do edital** (base64 em JSON `{data,name,length}`) | ✅ 200 (~686 KB) | **SIM — evidência/PDF** |
| 5 | GET | `api/edital/{unidade}/{numero}/{exercicio}/relacao-lotes` | **PDF da relação de lotes** (base64 em JSON) | ✅ 200 (~594 KB) | SIM — evidência secundária |
| 6 | GET | `api/lote/{unidade}/{numero}/{exercicio}/{lote}` | Detalhe rico de um lote (descrição, itens, fotos, erratas) | ✅ 200 (~8 KB) | **SIM — detalhe do lote** |
| 7 | GET | `api/portal/destaques` | Apenas lotes "destaque" (catálogo promovido) | ✅ 200 | NÃO (é o que o código usa hoje; insuficiente) |
| 8 | GET | `api/portal` | Mesmo modelo do destaques, mas dirigido por filtros (`?q=`, `?C=`, `?U=`...) | ✅ 200 | alternativa de busca, não para varredura total |
| 9 | GET | `api/editais-disponiveis?{filtros}` | `editais-disponiveis` filtrado (params chave=valor) | ✅ 200 | opcional |
| 10 | GET | `api/edital/{u}/{n}/{e}/pesquisa` | Busca textual dentro de um edital | não testado | opcional |
| 11 | GET | `api/edital/{u}/{n}/{e}/cabecalho` | Cabeçalho do edital (subset) | ⚠️ 500 no recon | evitar — use #3 |

Rotas que existem no bundle mas **NÃO interessam à ingestão pública** (área transacional/logada; fora do escopo permitido — não usar): `api/darf/...`, `api/sala-disputa/...`, `api/resposta/...`, `api/favoritos`, `api/edital/.../propostas-lances-lotes`, `api/edital/.../extrato-leilao`, `api/edital/.../historico-leilao`, `api/edital/.../ata-publicada`. São propostas, lances, DARF, sala de disputa e respostas — não coletar.

### Observações de protocolo confirmadas ao vivo
- **Sem autenticação** nas rotas 1–9: respondem 200 sem cookie/token.
- **Sem `robots.txt`** no host (`/robots.txt` → 404). Não há diretiva de crawl publicada; mesmo assim, aplicar rate limit por educação (ver §6).
- **Sem headers de CORS, cache-control ou rate-limit** expostos nas respostas. `x-powered-by: Undertow/1`.
- Funciona **sem** `User-Agent` customizado e **sem** `Accept: application/json` (testado: 200). Ainda assim, enviar UA honesto e `Accept` correto.
- Os 500 observados em `cabecalho`, `api/portal/editais` e na rota de edital com path-params trocados são do backend (rota inexistente / parâmetro inesperado), **não** bloqueio anti-bot.

---

## 3. Formas dos JSON (amostras reais, aparadas)

### 3.1 `GET api/editais-disponiveis` — catálogo completo

Estrutura: `situacoes[]` (um grupo por código de situação), cada um com `lista[]` de editais. **É aqui que se enumera TODO o universo de editais.**

```jsonc
{
  "agora": "2026-06-13 05:03",
  "situacoes": [
    {
      "situacao": 2,                       // código de situação (ver §5)
      "editaisEstaoLimitados": false,
      "lista": [
        {
          "edital": "0717600/000004/2026", // número "bonito" (com zeros)
          "edle": "717600/4/2026",         // CHAVE -> {unidade}/{numero}/{exercicio}
          "codigoSituacao": 2,
          "permitePF": false,              // false = só PJ; true = PF e PJ
          "tipo": "1",
          "uaNm": "PORTO DO RIO DE JANEIRO",
          "orgao": "RFB",
          "cidade": "RIO DE JANEIRO",
          "dataInicioPropostas": "2026-07-13 09:00",
          "dataFimPropostas":   "2026-07-15 21:00",
          "dataAberturaLances": "2026-07-16 10:00",
          "lotes": 40                      // qtde de lotes do edital
        }
        // ... demais editais deste status
      ]
    }
    // ... demais grupos de status (7 grupos no recon)
  ],
  "unidadeInvalida": null
}
```

**Para varrer tudo:** `for situacao in situacoes: for edital in situacao.lista: yield edital.edle`.

### 3.2 `GET api/edital/{unidade}/{numero}/{exercicio}` — edital completo + lotes

Top-level (campos principais; há ~55 campos no total, muitos `null` quando não se aplicam):

```jsonc
{
  "edital": "0200100/000001/2026",
  "edle": "200100/1/2026",
  "situacao": 2,
  "permitePF": true,
  "tipo": 1,
  "orgao": "Receita Federal do Brasil",
  "cidade": "SUPERINTENDÊNCIA REGIONAL ... DA 2ª REGIÃO FISCAL",
  "dataInicioPropostas": "2026-06-22 08:00",
  "dataFimPropostas":   "2026-07-06 20:00",
  "dataClassificacao":  "2026-07-07 09:30",
  "dataAberturaLances": "2026-07-07 10:00",
  "formaContato": "E-MAIL fulano@rfb.gov.br, ...",
  "dadosPublicacao": "PUBLICADO NO DIÁRIO OFICIAL DA UNIÃO DE 20/05/2026, EDIÇÃO 93, SEÇÃO 3 ...",
  "numeroAvisos": 0,
  "numeroErratas": 0,
  "mercadoriasApreendidas": false,
  "permissoes": ["lista-lotes", "busca-textual"],
  "avisosErratas": [
    { "data": "2026-06-12 15:45", "codigoTipo": 2, "tipo": "Errata", "texto": "No item 2.1.7.2 ..." }
  ],
  "listaLotes": [
    {
      "loleNrSq": 1,                 // id sequencial do lote (interno)
      "nrAtribuido": 1,              // número exibido do lote
      "tipo": "PRODUTO MINERAL",     // categoria/natureza do bem
      "situacaoLote": 11,
      "valorMinimo": 850000,         // EM REAIS (não centavos) — ver nota abaixo
      "valorAvaliacao": 1500000,
      "possuiImagens": true,
      "destaque": false,
      "permitePF": false,
      "nrAvisos": 1,
      "nrErratas": 0,
      "imagens": [
        { "imllNrSq": 530697, "src": "https://storagegw.estaleiro.serpro.gov.br/...",
          "min": "https://storagegw.estaleiro.serpro.gov.br/...", "w": 1200, "h": 1600 }
      ]
      // + flags permite* (Darf, Proposta, SalaDisputa...) que NÃO interessam à ingestão
    }
    // ... TODOS os lotes do edital (ex.: 191)
  ]
}
```

> **Nota de valores:** comparando este endpoint (`valorMinimo: 850000` = R$ 850.000) com o `destaques` (`valor: 180000`), os valores estão **em reais inteiros**, não centavos. O connector atual (`receita-leiloes.ts`) faz `valor * 100` para virar centavos — manter essa convenção, mas validar contra os PDFs porque o portal **não** publica casas decimais aqui.

### 3.3 `GET api/lote/{unidade}/{numero}/{exercicio}/{lote}` — detalhe do lote

É onde está o **conteúdo de produto** (descrição textual, quantidade, unidade, recinto/armazém, todas as fotos):

```jsonc
{
  "loleNrSq": 139,
  "nrAtribuido": 139,
  "edle": "200100/1/2026",
  "edital": "0200100/000001/2026",
  "orgao": "Receita Federal do Brasil",
  "tipo": "OUTROS",
  "situacaoLote": 11,
  "cidade": "SUPERINTENDÊNCIA REGIONAL ... 2ª REGIÃO FISCAL",
  "valorMinimo": 180000,
  "avisosErratas": [
    { "data": "2026-05-25 09:33", "codigoTipo": 1, "tipo": "Aviso",
      "texto": "Este lote contém bens que se encontram em outra Unidade Administrativa ..." }
  ],
  "itensDetalhesLote": [
    {
      "recintoArmazenador": "NAVEGAÇÃO CHIBATÃO",   // local de retirada/armazém
      "nrReferencia": null,
      "quantidade": 104000,
      "unMedida": "kg",
      "descricao": "POLIPROPILENO COM CARGA POLYPROPYLENE HOMOPOLYMER REPOL H019TG////"
    }
    // um lote pode ter vários itens
  ],
  "imagens": [
    { "imllNrSq": 526816, "src": "https://storagegw.estaleiro.serpro.gov.br/...",
      "min": "https://...", "w": 743, "h": 539 }
    // ... todas as fotos (ex.: 14)
  ],
  "lotesQueUsuarioTemPermissao": ["1", "..."]  // ignorar
}
```

### 3.4 `GET api/edital/{u}/{n}/{e}/edital-completo` — PDF do edital

**Não** é `application/pdf`. É JSON com o PDF em base64:

```jsonc
{
  "data": "JVBERi0xLjcNCiW1tbW1DQ...",   // base64; decodifica para "%PDF-1.7..."
  "name": "Edital_Completo_2026_200100_1.pdf",
  "length": 514830,                        // bytes do PDF decodificado
  "width": 0, "height": 0,
  "mimeType": null, "lastModified": null
}
```

Decodificação (confirmado): `base64decode(data)` começa com `%PDF-1.7`. A SPA faz isso client-side (`saveAsPdf`). `relacao-lotes` tem o mesmo envelope (`Relacao_Lotes_2026_200100_1.pdf`, PDF 1.5).

### 3.5 Imagens dos lotes

URLs absolutas em `storagegw.estaleiro.serpro.gov.br/sle-pro-publico/arquivos/...`, com `src` (full) e `min` (thumb) + `w`/`h`. São públicas e baixáveis diretamente (host do SERPRO).

---

## 4. Caminho do PDF (acquisition path)

Não existe link `.pdf` para raspar de HTML. O PDF oficial é entregue **pela API** e precisa ser remontado:

```text
GET api/edital/{unidade}/{numero}/{exercicio}/edital-completo
  -> JSON { data: <base64>, name: "Edital_Completo_...pdf", length: <bytes> }
  -> bytes = base64decode(data)
  -> validar magic bytes "%PDF"
  -> sha256(bytes)  (hash de conteúdo / prova de origem)
  -> salvar bytes no Storage com name; guardar url de origem + sha256 + collectedAt
```

Caso de fallback (se algum dia a API JSON sair do ar): a tela pública `/sle-sociedade/portal/edital/{u}/{n}/{e}` renderiza os mesmos dados via SPA — exigiria Playwright. **Hoje não é necessário**: a API JSON cobre tudo.

---

## 5. Enums (extraídos do bundle)

### 5.1 Situação do edital (`situacao` / `codigoSituacao`)
Mapa código → nome (enum `tn` no bundle; relevantes para varredura):

| Código | Nome | Significado prático |
|---|---|---|
| 2 | `DISPONIBILIZADO` | publicado, antes de abrir propostas |
| 3 | `ABERTO_PARA_PROPOSTA` | aceitando propostas |
| 5 | `ABERTA_SESSAO_PUB_EM_CLASSIFICACAO` | sessão pública, classificando |
| 6 | `ABERTA_SESSAO_PUB_CLASSIFICACAO_ENCERRADA` | classificação encerrada |
| 7 | `ABERTA_SESSAO_PARA_LANCE` | em fase de lances |
| 10 | `ENCERRADA_SESSAO_PUBLICA` | sessão encerrada |
| 14 | `CANCELADO` | cancelado |
| 15 | `ENCERRADA_SESSAO_PUBLICA_ATA_PUBLICADA` | encerrado, ata publicada |

> Há sobreposição de números entre os enums de **edital** e de **lote** (ex.: `situacaoLote: 11` aparece como `DISPONIBILIZADO/ENCERRADO` dependendo do contexto). Tratar `situacao` (edital) e `situacaoLote` separadamente; preservar o número cru e mapear o rótulo só na exibição.

### 5.2 Filtros do `api/portal` (enum `kr`, query params)
A SPA serializa filtros como letra → código: `T` = TIPO_LOTE, `O` = ORGAO, `U` = UF, `C` = CIDADE, e `TIPO_LICITANTE`. Ex.: `GET api/portal?U=SP&C=SANTOS`. Útil para busca dirigida, **não** para varredura total.

---

## 6. Politeness / anti-block

Mesmo sem `robots.txt` e sem rate-limit observável, é um sistema do governo — tratar com cuidado:

- **Rate limit:** ~1 requisição a cada 2s (sequencial, sem paralelismo agressivo). Para varredura total: listar editais (1 req) e então 1 edital a cada 2s; lotes individuais só quando precisar do detalhe rico (lazy).
- **User-Agent honesto:** `FonteiaBot/1.0 (+mailto:contato@fontebrasil.online)` (não fingir navegador).
- **Backoff exponencial** em `429`/`5xx`: 2s, 4s, 8s, 16s (máx. ~4 tentativas), depois desistir e registrar erro — não martelar.
- **Cache:** TTL ~15 min para `editais-disponiveis`; o detalhe de edital pode cachear mais tempo e só refazer quando `dataFimPropostas`/`numeroErratas` mudarem. (O connector atual já usa cache de 15 min via KV — manter o padrão.)
- **Janela de coleta:** rodar fora do horário comercial de pico quando possível (a coleta de amostra rodou ~05:00 BRT).
- **Idempotência/dedup:** chave natural `edle` (edital) e `(edle, nrAtribuido)` (lote). Hash de conteúdo (`sha256` do JSON cru e do PDF) para detectar mudança/errata sem reprocessar.
- **Sem áreas logadas:** nunca tocar `darf`, `sala-disputa`, `resposta`, `favoritos`, `propostas-lances-*`. Coletar só dado público.

---

## 7. Design de ingestão recomendado (JSON-first + PDF como evidência)

```text
1. GET api/editais-disponiveis
   -> achatar situacoes[].lista[] em N editais (chave = edle)
   -> upsert "edital" (metadados leves: datas, cidade, uaNm, qtdLotes, situacao)

2. Para cada edital (1 req / 2s):
   GET api/edital/{u}/{n}/{e}
   -> upsert edital completo + listaLotes[] (todos os lotes, resumo)
   -> sha256(jsonCru) como content_hash do edital

3. Para cada lote que importe (lazy / sob demanda / quando destaque ou filtro casar):
   GET api/lote/{u}/{n}/{e}/{lote}
   -> upsert detalhe (itensDetalhesLote[].descricao, recinto, qtd, imagens[])

4. Evidência (uma vez por edital, e quando errata mudar):
   GET api/edital/{u}/{n}/{e}/edital-completo  -> base64 -> bytes -> sha256
   -> salvar PDF no Storage (auction-files/receita-federal/{exercicio}/edital-{numero}/edital.pdf)
   -> registrar evidence { source_url, content_hash, collected_at }
   (opcional) GET .../relacao-lotes -> mesmo fluxo

5. Imagens (opcional, públicas): baixar src de storagegw.estaleiro.serpro.gov.br
```

**Por que JSON-first e não PDF-first:** os campos estruturados (valor, datas, cidade, descrição do item, quantidade, unidade, recinto, fotos) já vêm prontos no JSON, sem parsing de PDF nem OCR. O PDF entra como **prova oficial** com hash, para rastreabilidade e para a IA citar fonte — não como fonte primária de estrutura. Isso bate com o princípio do projeto ("Fonte oficial → Coleta → Evidência preservada → Dados estruturados").

### Mudanças que isso implica no código atual
- `packages/sources/src/connectors/receita-leiloes.ts` hoje só conhece `destaques`. Adicionar funções para `editais-disponiveis`, `edital/{edle}`, `lote/{edle}/{lote}` e `edital-completo` (mantendo o padrão de cache/fetch existente).
- O job `services/ingest/src/jobs/ingest-receita-leiloes.ts` hoje persiste só destaques com `path: "$.destaques[*]"`. Estender para o fluxo dos 5 passos acima, mantendo `raw_records` + `evidence` + `content_hash` como já faz.
- (Apenas notas — este recon **não** altera código; só documenta.)

---

## 8. O que foi verificado ao vivo vs. não

**Verificado ao vivo (curl, 2026-06-13, anônimo):**
- ✅ `api/editais-disponiveis` → 200, estrutura `situacoes[].lista[]` confirmada.
- ✅ `api/editais-disponiveis/unidadesExecutoras` → 200, array de strings.
- ✅ `api/edital/200100/1/2026` → 200, 191 lotes em `listaLotes[]`.
- ✅ `api/edital/200100/1/2026/edital-completo` → 200, PDF base64 (`%PDF-1.7`, `Edital_Completo_2026_200100_1.pdf`).
- ✅ `api/edital/200100/1/2026/relacao-lotes` → 200, PDF base64.
- ✅ `api/lote/200100/1/2026/139` → 200, `itensDetalhesLote[]` + 14 imagens.
- ✅ `api/portal/destaques` → 200 (referência).
- ✅ Ausência de `robots.txt` (404), ausência de auth, ausência de headers de rate-limit/CORS, backend `Undertow/1`.

**Extraído do bundle `main-*.js` mas NÃO exercitado ao vivo** (caminho/forma conhecidos, resposta não capturada): `api/portal` com filtros, `api/edital/.../pesquisa`, e as rotas transacionais (darf/sala-disputa/resposta/favoritos — intencionalmente não tocadas por estarem fora do escopo público).

**Não determinado:**
- Comportamento real sob `429`/throttling (não foi provocado de propósito — não martelamos o servidor).
- Se `editaisEstaoLimitados`/limite de paginação chega a ativar em volume maior de editais (no recon veio `false`; com a UA filtrada pode mudar). `lotesPorPagina` existe na **UI** (paginação client-side), mas os endpoints retornam o edital inteiro de uma vez — não há paginação server-side observada nas rotas de varredura.
- Estabilidade dos hashes de bundle (`main-ZRU2EMER.js` muda a cada deploy do portal; os **caminhos de API** tendem a ser estáveis, os nomes de arquivo JS não).

---

## 9. Referência rápida (copiar/colar)

```text
BASE = https://www25.receita.fazenda.gov.br/sle-sociedade

# 1. Todos os editais
GET {BASE}/api/editais-disponiveis

# 2. Edital + todos os lotes (resumo)   edle = unidade/numero/exercicio
GET {BASE}/api/edital/{unidade}/{numero}/{exercicio}

# 3. Detalhe rico de um lote
GET {BASE}/api/lote/{unidade}/{numero}/{exercicio}/{lote}

# 4. PDF oficial do edital (base64 em JSON {data,name,length})
GET {BASE}/api/edital/{unidade}/{numero}/{exercicio}/edital-completo

# 5. PDF da relação de lotes (base64 em JSON)
GET {BASE}/api/edital/{unidade}/{numero}/{exercicio}/relacao-lotes

Headers: User-Agent honesto + Accept: application/json (opcionais, mas recomendados)
Rate: ~1 req / 2s, backoff 2/4/8/16s em 429/5xx, cache 15 min.
```
