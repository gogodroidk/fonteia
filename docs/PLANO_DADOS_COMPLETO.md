# Plano de Dados Completo — INPI (marcas) e Receita Federal (leilões)

**Preparado em:** 2026-06-19  
**Autor:** engenheiro de ingestão, Fonte.ia by Olli  
**Escopo:** estado atual + plano faseado + contrato com o Cérebro  
**Não altera código** — é diagnóstico e plano de execução.

---

## 1. Estado atual da ingestão

### 1.1 INPI — Marcas (RPI)

**O que já está no ar:**

- Edge Function: `supabase/functions/ingest-inpi/index.ts`
- RPC Postgres: `public.ingest_inpi(jsonb)` — `infra/migrations/0010_ingest_inpi.sql`
- Destino: Supabase Postgres `public.entities` (kind = `trademark`), depois sincronizado ao Cloudflare D1 via `/migrate` da `d1-bridge`
- Volume atual: ~29.522 processos, da edição RPI 2893 (publicada em 16/06/2026)
- Frequência: **sem cron ativo no código** — a função existe mas precisa ser chamada manualmente ou por um cron externo

**Como funciona hoje:**

A função descobre automaticamente a edição mais recente por estimativa de semanas a partir de uma âncora conhecida (RPI 2893 = 16/06/2026). Baixa o ZIP `RM<numero>.zip` inteiro (~9 MB comprimidos, ~49 MB XML descomprimido) via HTTP Range do servidor `https://revistas.inpi.gov.br/txt`. Descomprime em memória com `DecompressionStream("deflate-raw")` e parseia cada `<processo>` por regex sem DOM. Normaliza para `kind='trademark'` e chama `ingest_inpi` em lotes de 500. Cada invocação processa a edição **da semana atual** inteira.

**O que NÃO está ingerido:**

A RPI publica edições semanais desde o início dos anos 1990 (números baixos como RPI 1000, 1200...). O histórico completo de marcas brasileiras acumula centenas de edições não ingeridas. A base completa do INPI — todas as marcas ativas e extintas, em todos os status — está disponível apenas em uma base bulk separada (`https://dadosabertos.inpi.gov.br`) em formato de dump SQL/CSV periódico, que **não é a RPI semanal**. A RPI cobre apenas movimentações da semana: concessões, indeferimentos, extinções, renovações. Não é um catálogo completo das marcas vigentes — é o boletim de mudanças.

**Bloqueador estrutural (honesto):**

O XML da RPI não traz CPF/CNPJ estruturado do titular. Só existe `nome-razao-social`. O CNPJ só é extraído quando vem embutido no nome (padrão MEI/EI). Resultado: a maioria das marcas entra com `cnpj = null` e não aparece automaticamente ao expandir uma empresa no Cérebro por CNPJ. A busca por nome funciona; a ligação por CNPJ é parcial e best-effort. Isso é uma limitação do dado público, não um bug.

**Arquivos relevantes:**
- `supabase/functions/ingest-inpi/index.ts` — função completa (518 linhas)
- `infra/migrations/0010_ingest_inpi.sql` — RPC + índice único parcial por `processNumber`
- `infra/migrations/0001_core_schema.sql` — schema base (entities, source_runs, raw_records, evidence)

---

### 1.2 Receita Federal — Leilões SLE

**O que já está no ar:**

- Edge Function: `supabase/functions/ingest-receita-catalog/index.ts`
- RPC Postgres: `public.ingest_receita_catalog(jsonb)` — `infra/migrations/0004_ingest_receita_catalog.sql`
- RPC complementar: `public.ingest_receita_lots(jsonb)` — protegida em `infra/migrations/0003_secure_ingest_receita_lots.sql`
- Destino: Supabase Postgres `public.entities` (kind = `auction_lot`)
- Os leilões ficam **apenas no Supabase Postgres** — o `d1-client.ts` explicitamente exclui `auction_lot` do D1 (ver linha 13: "Os leilões (`auction_lot`) e a busca semântica por embeddings PERMANECEM no Supabase")
- Frequência: **sem cron ativo no código** — invocação manual

**Como funciona hoje:**

A função chama `GET /api/editais-disponiveis` no SLE (`https://www25.receita.fazenda.gov.br/sle-sociedade`), que retorna todos os editais agrupados por status. Por padrão filtra apenas situações 2, 3, 5, 6, 7 (abertos/próximos). Para cada edital, chama `GET /api/edital/{unidade}/{numero}/{exercicio}` e persiste todos os lotes via `ingest_receita_catalog`. Rate limit de 800ms entre editais. Chave de deduplicação: `edle-nrAtribuido`.

**O que NÃO está sendo feito:**

1. **PDFs dos editais não são baixados.** O endpoint `/edital-completo` existe na API SLE e retorna o PDF em base64 dentro de um JSON. O código atual não o chama.
2. **Editais encerrados/cancelados não são ingeridos** (filtro padrão excluiu situações 10, 14, 15). O parâmetro `?all=1` está implementado mas não é chamado rotineiramente.
3. **Detalhe rico do lote não é buscado.** O endpoint `GET /api/lote/{u}/{n}/{e}/{lote}` traz `itensDetalhesLote[]` (descrição textual completa, quantidade, unidade, recinto/armazém) e todas as fotos. A função atual não chama esse endpoint — usa apenas o resumo do lote dentro da resposta do edital.
4. **Histórico de leilões antigos.** O SLE só expõe editais que ainda estão na sua memória operacional. Editais de anos anteriores podem não aparecer mais no `editais-disponiveis`. Não existe endpoint de histórico público identificado.
5. **Cron/agendamento ausente.** Sem schedule periódico, novos editais surgem sem serem capturados.

**Arquivos relevantes:**
- `supabase/functions/ingest-receita-catalog/index.ts` — função completa (197 linhas)
- `supabase/functions/edital-pdf/index.ts` — função existente para parsing de PDF (referência de arquitetura)
- `docs/research/SLE_INGESTION_CONTRACT.md` — recon completo do portal SLE com endpoints confirmados ao vivo
- `docs/research/PLANO_PIPELINE_LEILOES_RECEITA_FONTEIA.md` — plano arquitetural extenso (1584 linhas)
- `infra/migrations/0004_ingest_receita_catalog.sql` — RPC

---

## 2. Fontes oficiais e formatos

### 2.1 INPI — Revista da Propriedade Industrial (RPI)

**URL base:** `https://revistas.inpi.gov.br/txt/RM<NUMERO>.zip`  
**Portal:** `https://revistas.inpi.gov.br/rpi/`  
**Frequência:** semanal (toda segunda-feira)  
**Formato:** ZIP com um único XML (`RM<numero>.xml`), layout `rpi_xml_marcas_versao_103`  
**Tamanho por edição:** ~9 MB comprimido / ~49 MB XML / ~29.500 processos  
**Histórico:** edições numeradas desde pelo menos a RPI 1, publicadas desde os anos 1990. Em junho/2026 a edição é a 2893 — ou seja, há potencialmente ~2.893 edições históricas  
**Autenticação:** pública, sem login, sem rate-limit declarado  
**CNPJ:** não está no XML. Apenas `nome-razao-social`. Extração best-effort por regex  

**Base completa do INPI (diferente da RPI):**  
O INPI publica também um dump da base completa de marcas registradas em `https://dadosabertos.inpi.gov.br/`. Esse dump é um CSV/SQL periódico que contém todas as marcas ativas — não apenas as movimentações da semana. Não foi explorado no recon atual. Esse seria o caminho para ter "todas as marcas" em vez de apenas as movimentadas nas últimas semanas.

### 2.2 Receita Federal — SLE (Sistema de Leilão Eletrônico)

**Host:** `https://www25.receita.fazenda.gov.br/sle-sociedade/`  
**Autenticação:** pública, sem login, sem captcha nas rotas de leitura  
**Formato primário:** JSON (API interna do SPA Angular, endpoints confirmados ao vivo em 2026-06-13)  
**Formato secundário:** PDF entregue via JSON base64  

**Endpoints confirmados:**

| Endpoint | Retorna | Volume típico |
|---|---|---|
| `GET /api/editais-disponiveis` | Todos os editais agrupados por status | ~29 KB por resposta |
| `GET /api/edital/{u}/{n}/{e}` | Edital completo + todos os lotes resumidos | ~455 KB (191 lotes) |
| `GET /api/lote/{u}/{n}/{e}/{lote}` | Detalhe rico de um lote | ~8 KB |
| `GET /api/edital/{u}/{n}/{e}/edital-completo` | PDF do edital (base64 em JSON) | ~686 KB por edital |
| `GET /api/edital/{u}/{n}/{e}/relacao-lotes` | PDF da relação de lotes (base64 em JSON) | ~594 KB |

**Volume realista de PDFs:**  
Cada edital tem 2 PDFs. Se houver 40 editais ativos em um momento, são 80 PDFs. Tamanho médio: ~600 KB cada. Volume total do estado ativo: ~48 MB de PDFs. Baixar e armazenar o histórico completo requer Cloudflare R2 (ou Supabase Storage).

**Nota sobre valores no JSON:**  
Os campos `valorMinimo` e `valorAvaliacao` estão em **reais inteiros** (não centavos), conforme verificado no recon (ex.: `valorMinimo: 850000` = R$ 850.000). A função atual converte corretamente com `toCents(n) = Math.round(n * 100)`.

---

## 3. Limites e riscos reais

### 3.1 Cloudflare D1

O D1 `fonteia-data` (ID `417caa83-86dc-463e-8682-656cf938cd24`) tem hoje ~217 mil entidades. Os limites documentados do D1 são: 10 GB por banco de dados, sem limite declarado de linhas no plano Workers Paid. Inserir mais marcas INPI (edições históricas) ou lotes de leilão escala sem problema técnico no D1 em si, desde que respeitado o batch máximo de 500 linhas por transação (já implementado no d1-bridge).

**Atenção:** `auction_lot` não está no D1 — permanece apenas no Supabase Postgres. Se quiser que leilões apareçam no Cérebro via D1, é uma decisão arquitetural pendente (ver seção 5).

### 3.2 Edge Functions (Supabase Deno)

Limite de ~150s por invocação. As funções atuais são bem projetadas para esse limite: a ingestão INPI processa uma edição inteira (~29.500 processos) em uma invocação porque o arquivo (~9 MB comprimido) descomprime em ~0.2s e o parsing por regex é rápido. Para edições históricas com backfill, o parâmetro `?skip=N` permite retomada por contagem.

**O que NÃO cabe em uma Edge Function:** baixar e processar dezenas de PDFs de lotes em paralelo. Cada PDF base64 pesa ~600 KB. Processar 40 editais × 2 PDFs = 80 downloads sequenciais com rate limit de 2s cada = ~160s só de I/O, sem contar decodificação e armazenamento. Isso estoura o timeout. A solução correta é um Worker Cloudflare autônomo ou uma GitHub Action.

### 3.3 Download em volume — por que "baixar tudo agora" não funciona

**INPI histórico completo via RPI:** ingerir as 2.893+ edições semanais históricas significa baixar ~2.893 × 9 MB = ~26 GB comprimidos. Mesmo com paralelismo controlado e rate limit conservador (1 edição/10s), o download leva ~8 horas. Isso não cabe em nenhuma Edge Function. Requer um processo externo (Worker Cloudflare com Cron Trigger ou GitHub Action agendada) que ingira N edições por execução com cursor persistido.

**Receita PDFs:** o PDF do edital não existe como arquivo estático — é servido como JSON base64. Cada requisição de PDF decodifica e reencoda. Salvar centenas de PDFs requer armazenamento blob (R2 ou Supabase Storage), não uma coluna do banco.

**Custo de R2:** R2 tem free tier de 10 GB de armazenamento e 1 milhão de operações Class A por mês. Armazenar ~48 MB de PDFs do estado ativo dos leilões cabe sem custo. Armazenar histórico de PDFs de anos requereria avaliação de volume.

### 3.4 Parsing de PDF em escala

A função `edital-pdf/index.ts` já existe como referência. O PDF do SLE é um PDF 1.7 textual (não escaneado), então a extração de texto é direta sem OCR. Porém, carregar um PDF de 514 KB em base64, decodificar, extrair texto e criar chunks de evidência dentro de uma Edge Function com limite de memória pode falhar para PDFs maiores. A prática segura é: baixar, armazenar no R2, e processar texto em um Worker separado com mais budget.

### 3.5 INPI — ausência de CNPJ estruturado

Este é o maior risco de expectativa: mesmo com 100% das marcas históricas ingeridas, a maioria delas não terá `cnpj` preenchido. O link empresa→marca no Cérebro funcionará apenas quando o CNPJ estiver embutido no nome do titular (caso MEI/EI). Para empresas normais (SA, LTDA, etc.), o nome do titular é só texto e não há como cruzar automaticamente sem um terceiro lookup (ex.: buscar pelo nome na Receita — operação cara e frágil). Isso é uma limitação estrutural do dado público da RPI, não solucionável sem mudança na fonte.

### 3.6 Instabilidade das fontes governamentais

APIs governamentais brasileiras apresentam instabilidade frequente (500s esporádicos, lentidão fora do horário comercial, manutenções). O `_shared/http.ts` já implementa `fetchWithRetry` com backoff exponencial (3 tentativas, 800ms de base). O padrão de falha honesta (`{ok: false, error: "..."}`) já está em todas as funções de ingestão.

---

## 4. Plano incremental e executável (faseado)

### Fase 1 — Ampliar cobertura INPI via pipeline existente (sem nova infra)

**Objetivo:** passar de ~29.500 marcas (1 edição, junho/2026) para a cobertura das últimas 52 semanas (1 ano de movimentações), depois expandir para histórico maior.

**Como funciona o backfill:**  
A função `ingest-inpi` aceita o parâmetro `?revista=N`. Para processar a edição RPI 2841 (1 ano atrás), basta chamar `?revista=2841`. O ZIP de cada edição está disponível indefinidamente em `https://revistas.inpi.gov.br/txt/RM<N>.zip`. Cada invocação processa uma edição completa em ~20-30 segundos.

**Passos concretos:**

1. **Configurar cron semanal para a edição atual.** O Supabase suporta cron via pg_cron ou via invocação externa. A forma mais simples é um GitHub Action agendado (`schedule: cron: '0 6 * * 1'` — segunda-feira às 06h) que chama o endpoint da Edge Function com o bearer do `INGEST_CRON_SECRET`. Custo: zero.

2. **Backfill das edições do último ano.** Criar um script de backfill simples que itera de `revista=2841` até `revista=2892` e chama a Edge Function para cada um, com 5s de intervalo entre chamadas. Pode rodar como GitHub Action one-shot. Cada edição processa em ~30s; 52 edições = ~26 minutos. Isso adiciona potencialmente ~52 × 29.500 = ~1,5 milhão de processos, mas com deduplicação por `processNumber` — o volume real de novos registros únicos depende de quantos processos têm movimentação em semanas diferentes.

3. **Base completa do INPI (dadosabertos.inpi.gov.br).** Para ter TODAS as marcas ativas (não só movimentações semanais), explorar o dump da base completa em `https://dadosabertos.inpi.gov.br`. Isso requer análise do formato do dump e uma função de ingestão separada (`ingest-inpi-base`). Volume estimado: centenas de milhares de registros. Esse passo exige decisão de infra/custo do dono.

**O que mudar no código:**  
Nada na função `ingest-inpi/index.ts` — ela já suporta `?revista=N`. Apenas criar o cron e o script de backfill.

**Verificação:**  
Após cada backfill de edição, consultar o D1:  
`SELECT COUNT(*) FROM entities WHERE kind='trademark'`  
E no Supabase:  
`SELECT COUNT(*) FROM entities WHERE kind='trademark'`

---

### Fase 2 — Receita Federal: completar ingestão JSON + PDFs como evidência

**Objetivo:** ingerir todos os editais (abertos + histórico acessível) com detalhe rico do lote, e armazenar o PDF do edital como evidência rastreável no R2.

**Passo 2a — Ativar cron da ingestão existente:**  
A função `ingest-receita-catalog` já funciona. Falta apenas um cron que a chame periodicamente. Sugestão: a cada 6 horas (`0 */6 * * *`), para capturar editais novos. Implementação: GitHub Action ou pg_cron.

**Passo 2b — Incluir editais encerrados/cancelados:**  
Chamar `ingest-receita-catalog?all=1` uma vez por semana para capturar o histórico de editais já encerrados que ainda estejam na memória do SLE. Isso preenche a base para análise de médias de preço (funcionalidade de inteligência de licitação).

**Passo 2c — Buscar detalhe rico do lote:**  
Adicionar em `ingest-receita-catalog` a chamada ao endpoint `GET /api/lote/{u}/{n}/{e}/{lote}` para lotes sem `itensDetalhesLote` já persistido. O detalhe traz: `itensDetalhesLote[].descricao` (texto completo do bem), quantidade, unidade, recinto/armazém, e todas as fotos (URLs absolutas do SERPRO). Isso enriquece o card do lote e alimenta a IA.

Implementação: dentro do loop de lotes da função atual, para cada `lote.nrAtribuido`, checar se `attributes.itensDetalhesLote` já existe (usando o upsert atual como cache implícito). Se não, chamar o endpoint de detalhe e mesclar no payload antes do upsert. Rate limit adicional: 1 req / 2s por lote. Para um edital com 191 lotes, isso é ~6 minutos só de detalhe de lotes — excede o timeout da Edge Function. Solução: cursor por índice de lote (`?edleStart=`, `?loteOffset=`) com retorno parcial, idêntico ao padrão já adotado no INPI.

**Passo 2d — PDF como evidência:**  
Criar função `ingest-receita-pdfs/index.ts` que:

1. Busca no Supabase todos os `auction_lot` de um `edle` ainda sem evidência de PDF (campo `raw_records.content_hash` ausente para o `source_url` de PDF).
2. Chama `GET /api/edital/{u}/{n}/{e}/edital-completo` — JSON com `{data: <base64>, name: "...", length: N}`.
3. Decodifica base64 → bytes. Valida magic bytes `%PDF`. Calcula `sha256`.
4. Faz upload para Cloudflare R2 no path `receita-federal/{exercicio}/edital-{edle}/edital.pdf` via R2 HTTP API (token CF_API_TOKEN do Vault).
5. Registra em `raw_records` + `evidence` com `content_hash = sha256:...` e `source_url` real.

Essa função pode ser invocada uma vez por edital novo (disparo por webhook ou cron diário, varrendo editais sem PDF persistido). O PDF só é baixado novamente quando `numeroErratas` do edital aumenta.

**O que mudar no código:**  
- `supabase/functions/ingest-receita-catalog/index.ts`: adicionar cursor por lote para detalhe rico (Passo 2c)  
- Criar: `supabase/functions/ingest-receita-pdfs/index.ts` (Passo 2d)  
- Migração SQL: adicionar RPC `ingest_receita_pdfs` para persistir evidências de PDF (seguindo o padrão de `0010_ingest_inpi.sql`)

---

### Fase 3 — Sync com embeddings e Cérebro

**Objetivo:** novas entidades ingeridas nas fases 1 e 2 aparecem automaticamente na busca semântica e no Cérebro.

**Para marcas INPI (já no D1):**  
A função `supabase/functions/embed-entities` gera embeddings pgvector 768d via Gemini para entidades no Supabase. Marcas ingeridas via `ingest_inpi` já chegam ao Postgres. Basta incluir `kind='trademark'` no pipeline de embedding (verificar se já está incluído na seleção de kinds do `embed-entities`).

**Para lotes Receita (já no Supabase Postgres):**  
`auction_lot` já está no Postgres. Se `embed-entities` não os indexa hoje, adicionar o kind. O embedding alimenta a busca semântica do módulo de leilões e o RAG do `fonteia`.

**Para lotes Receita no Cérebro:**  
Atualmente `auction_lot` está excluído do D1 e o Cérebro não o expande. Ver seção 5 para a discussão de contrato.

**Para PDFs (Fase 2d):**  
O texto extraído do PDF deve ser fatiado em chunks e gravado com embedding. Arquitetura recomendada: após salvar o PDF no R2, enfileirar o `raw_record_id` para processamento assíncrono por um Worker de embedding. No MVP, pode ser um segundo passo na mesma Edge Function (com timeout conservador de chunks menores).

---

## 5. Sincronização com o Cérebro

### 5.1 Como o Cérebro lê dados

O Cérebro (`apps/web/src/features/cerebro/cerebro-api.ts`) lê entidades via `fetchD1Entities` do `d1-client.ts`, que consulta o endpoint `/query` da `d1-bridge`. Os parâmetros são `kind`, `cnpj`, `q` (busca textual), `limit`, `offset`.

A função `leafFromRow` em `cerebro-api.ts` converte cada linha D1 em um nó-folha. Ela já tem casos para todos os kinds existentes. Novos kinds precisam de um case novo nessa função.

**Contrato que uma nova entidade deve satisfazer para aparecer no Cérebro:**

| Campo | Requisito | Observação |
|---|---|---|
| `kind` | Deve ser um dos kinds válidos do domínio | Ver lista em `packages/domain/src/index.ts` |
| `name` | Não-vazio | Rótulo do nó no canvas |
| `cnpj` | 14 dígitos sem máscara, ou null | Habilita expansão por CNPJ |
| `attributes` | JSON válido com campos documentados por kind | `leafFromRow` os acessa por chave |
| `source_ids` | Array com ao menos um id de fonte | Rastreabilidade |
| Persiste no D1 | Sim, via `/migrate` do d1-bridge | O Cérebro lê do D1, não do Postgres diretamente |

**Kinds que o Cérebro já lida (com `leafFromRow` implementado):**  
`sanction`, `public_contract`, `bidding_opportunity`, `legal_process`, `environmental_infraction`, `organization`, `municipality`, `politician`, `legal_proposition`, `trademark`, `parliamentary_expense`, `legislative_vote`, `company`

### 5.2 Marcas INPI no Cérebro (estado atual)

O kind `trademark` já tem case em `leafFromRow`. As marcas ingeridas vão ao Postgres, de lá para o D1 via `/migrate`, e aparecem no Cérebro quando se expande um CNPJ que está presente em `entities.cnpj` de uma marca. O problema real: a maioria das marcas tem `cnpj = null` (sem CNPJ no XML da RPI), então a expansão por CNPJ não as encontra. A busca textual por nome do titular funciona como alternativa quando o usuário busca a empresa pelo nome.

**Melhoria imediata possível:** ao ingerir uma nova marca com `cnpj = null`, tentar enriquecer o `cnpj` via BrasilAPI/CNPJ buscando pelo `titularNome`. Isso é uma operação cara (1 request por marca) e fora do escopo da RPI — mas poderia ser feita como pós-processamento assíncrono para as marcas mais relevantes (ex.: as com despacho de concessão na semana).

### 5.3 Lotes da Receita no Cérebro (decisão pendente)

Hoje `auction_lot` não está no D1 e o Cérebro não o expande. Para que leilões apareçam no grafo de conhecimento (ex.: "este CNPJ tem um lote de mercadoria apreendida em leilão"), há duas opções:

**Opção A — Manter `auction_lot` só no Supabase, adicionar consulta específica no Cérebro:**  
O `cerebro-api.ts` faria uma consulta direta ao Supabase REST para `auction_lot` quando o CNPJ bate com o campo `cnpj` de um lote. Não exige mudança no D1. Mas hoje os lotes de leilão da Receita não têm CNPJ do devedor — têm CNPJ do órgão responsável pelo leilão, que não é o ângulo útil para o Cérebro.

**Opção B — Não incluir `auction_lot` no Cérebro:**  
O módulo de leilões é consultado diretamente pelos usuários que querem leilões. O Cérebro é para cruzamentos entre entidades por CNPJ. Lotes de leilão da Receita não têm CNPJ do devedor estruturado — a ligação seria forçada e pouco útil. Esta é a recomendação atual.

**O que resolve a situação de longo prazo:** se o INPI dump completo trouxer CNPJ do titular por marca, e se houver cruzamento futuro entre marcas e processos de execução fiscal (CNJ), o grafo ficaria rico. Mas isso é fase 3+ e exige fontes adicionais.

---

## 6. Próximos passos priorizados

### O que dá para fazer já (sem decisão de infra/custo)

1. **Cron semanal da ingestão INPI.** Uma GitHub Action de 10 linhas chamando a Edge Function toda segunda-feira. Mantém a base atualizada sem esforço. Estimativa: 2h de trabalho.

2. **Cron da ingestão Receita a cada 6h.** Mesma abordagem. Garante que novos editais aparecem no produto em até 6h. Estimativa: 2h de trabalho.

3. **Backfill das últimas 52 edições RPI.** Script one-shot iterando `revista=2841` até `2892`. Roda em ~26 minutos como GitHub Action. Adiciona até ~1 ano de histórico de movimentações de marcas. Estimativa: 4h de trabalho (script + teste).

4. **Ativar `?all=1` no cron semanal da Receita.** Inclui editais encerrados/cancelados para análise de médias históricas. Mudança de 1 linha no GitHub Action. Estimativa: 30 minutos.

### O que exige decisão de infra/custo do dono

5. **PDF dos editais no R2.** Requer criar bucket R2 (gratuito até 10 GB), nova Edge Function `ingest-receita-pdfs`, nova migração SQL para a RPC. Benefício: rastreabilidade total, texto para IA. Estimativa: 1 dia de trabalho técnico. Custo R2: praticamente zero para o volume atual.

6. **Detalhe rico do lote (`itensDetalhesLote`).** Requer refatorar `ingest-receita-catalog` para suportar cursor por lote. Benefício: descrição textual completa de cada item (POLIPROPILENO, quantidade, unidade, armazém). Necessário para a IA responder perguntas específicas sobre o bem. Estimativa: 4h de trabalho. Sem custo adicional (API pública).

7. **Base completa do INPI (dadosabertos.inpi.gov.br).** Requer explorar o formato do dump (CSV/SQL), criar `ingest-inpi-base`, nova migração. Benefício: passar de ~30k marcas ativas (via RPI recente) para centenas de milhares de marcas ativas totais. Exige avaliação de volume e custo de armazenamento D1. Estimativa: 2-3 dias de trabalho técnico. Decisão de produto: vale para o módulo INPI? Depende da demanda dos usuários atuais.

8. **Histórico completo RPI além de 1 ano.** Ingerir RPI 1 até 2841 (~2.840 edições). Volume: potencialmente milhões de registros com alta taxa de duplicatas (mesmo processo aparece em múltiplas semanas). Requer avaliação de custo de armazenamento no D1 e no Postgres. Sem decisão de negócio sobre se histórico >1 ano tem valor de produto.

9. **Embedding de marcas INPI e lotes Receita.** Requer verificar se `embed-entities` já indexa esses kinds. Se não, adicionar. Benefício: busca semântica (ex.: "lote de equipamentos hospitalares em SP") e respostas da IA com citação de fonte. Decisão de custo: cada embedding Gemini custa tokens.

---

## Apêndice — Contrato de campos por kind para o Cérebro

Para que um novo kind apareça corretamente no Cérebro, a linha D1 deve ter:

**`trademark` (marcas INPI):**  
- `name`: nome do elemento nominativo da marca  
- `cnpj`: CNPJ do titular (quando extraível), null caso contrário  
- `attributes.processNumber`: número do processo INPI (9 dígitos)  
- `attributes.titularNome`: razão social do titular  
- `attributes.titularUf`: UF do titular  
- `attributes.niceClasses[]`: lista de códigos de classe Nice  
- `attributes.status`: despacho da semana (ex.: "Concessão de registro")  
- `attributes.apresentacao`: Nominativa / Mista / Figurativa  
- `attributes.dataDeposito`, `dataConcessao`, `dataVigencia`: datas ISO  
- `source_ids`: `["inpi-dados-abertos"]`  
- `sourceUrl` implícito: `leafFromRow` usa `INPI_BUSCA_URL` como fallback  

**`auction_lot` (leilões Receita) — quando/se incluído no D1 futuramente:**  
- `name`: "Lote {N} - {categoria ou cidade}"  
- `cnpj`: null (não disponível na Receita Federal SLE)  
- `attributes.edle`: chave do edital  
- `attributes.edital`: número formatado  
- `attributes.minimumBidCents`: lance mínimo em centavos  
- `attributes.valorAvaliacaoCents`: avaliação em centavos  
- `attributes.category`: tipo do bem  
- `attributes.proposalDeadline`: ISO datetime  
- `attributes.sourceUrl`: URL do portal SLE para o lote  
- `source_ids`: `["receita-leiloes-sle"]`  
