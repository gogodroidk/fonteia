# Plano de Storage em Nuvem — Fonte.ia by Olli

**Preparado em:** 2026-06-19  
**Scope:** plano de storage para escala de dados públicos brasileiros (dados.gov.br, CKAN municipal, expansão dos módulos existentes)  
**Não altera código nem deploya nada — é diagnóstico e plano de decisão para o dono.**

---

## 1. Matriz "onde guardar o quê"

Essa matriz reflete o estado real do repositório (D1 `fonteia-data`, ID `417caa83-86dc-463e-8682-656cf938cd24`; Supabase projeto `pwiuiihsyazghdsrpshg`; R2 e KV disponíveis mas sem uso definido no código).

| Dado | Destino | Motivo |
|---|---|---|
| Entidades estruturadas de referência — contratos PNCP, municípios IBGE, políticos, sanções CEIS, marcas INPI, CNJ, IBAMA | **Cloudflare D1** (`fonteia-data`) | Já é o destino hoje (~217k rows). SQL, sem RLS, sem pgvector. Leitura pública via `d1-bridge`. Custo zero a escala moderada. |
| Leilões da Receita Federal (SLE) | **Supabase Postgres** (`entities`, kind=`auction_lot`) | Precisa de pgvector (busca semântica) e RLS (controle por plano). Já implementado. Não vai para o D1 — veja ADR 0002. |
| Embeddings vetoriais (768d Gemini) de qualquer entidade | **Supabase Postgres** (`entities.embedding vector(768)`) | pgvector já instalado, RPCs `match_entities`/`similar_entities` operacionais. Não há alternativa sem custo extra. |
| Dados transacionais de usuário — profiles, subscriptions, alerts, coupons, ai_rate_limits | **Supabase Postgres** | RLS, auth, triggers. Sem alternativa. |
| PDFs de editais da Receita Federal SLE | **Cloudflare R2** (`fonteia-blobs`) | Blobs binários não têm lugar em banco relacional. ~600 KB por edital, ~2 PDFs por edital. ~48 MB para o estado ativo dos leilões. Free tier cobre. |
| Dumps brutos CSV/ZIP de fontes CKAN (dados.gov.br, prefeitura.sp.gov.br) | **Cloudflare R2** (`fonteia-raw`) | Arquivos brutos de ingestão: guardar a versão de origem antes de parsear, para reprocessar sem baixar de novo. Imutáveis por hash. |
| XMLs da RPI (INPI) — ZIPs semanais ~9 MB comprimido cada | **Cloudflare R2** (`fonteia-raw`) | Opcional: só compensa se o INPI tirar do ar ou para backfill offline. Baixar e parsear on-the-fly também é viável (como hoje). Decidir conforme seção 4. |
| Cache de respostas de APIs pagas (InfoSimples) | **Supabase Postgres** (`external_lookups`) | Já implementado (migration 0011). Dados estruturados com TTL. |
| Cache de consultas públicas frequentes (D1 query results, BrasilAPI CNPJ) | **Cloudflare KV** | Cache key-value simples: `cnpj:<14d>` → JSON do registro, TTL 24h. Evita round-trips para dados que mudam pouco. |
| Feature flags / configuração de runtime (módulo ativo/bloqueado) | **Cloudflare KV** | Já disponível. Chave como `feature:modulo_juridico` com valor `on/off`. |
| Chunks de texto extraídos de PDFs para RAG | **Supabase Postgres** (`raw_records`) | Já existe a tabela. `content_hash` para dedupe. Chunks menores de ~500 tokens com embedding 768d associado. |
| Fotos de lotes de leilão (URLs externas do SERPRO) | **Não armazenar — referenciar** | As URLs do SLE são absolutas e estáveis. Guardar a URL em `attributes.fotoUrls[]` é suficiente. Fazer proxy/cache só se o SLE apresentar instabilidade. |

---

## 2. Limites reais e custos (com números, sem otimismo)

### 2.1 Cloudflare D1

O plano **Workers Free** tem D1 com limite de **10 GB por banco** e **5 GB de armazenamento total em todos os bancos**. O plano **Workers Paid (US$ 5/mês)** eleva para **10 GB por banco, sem limite declarado de bancos**, e inclui 25 bilhões de linhas lidas/mês e 50 milhões de writes/mês gratuitos (cobranças adicionais são US$ 0,001/milhão de leituras e US$ 1,00/milhão de writes além do free tier).

A tabela `entities` atual tem 11 colunas, sendo `attributes` TEXT com JSON compacto. Uma row típica de entidade (kind=politician, kind=trademark, kind=municipality) ocupa entre 500 bytes e 2 KB no D1 após serialização TEXT. Com 217k rows hoje, o banco usa em torno de 200–400 MB estimados — longe do limite de 10 GB.

**Quando o D1 para de servir:**
- Quando precisar de busca vetorial (embeddings): nunca foi suportado. Use Postgres.
- Quando precisar de RLS por linha de dados (ex.: entidades privadas por tenant): D1 não tem RLS. Use Postgres.
- Quando o banco superar ~8 GB (deixe margem de 2 GB): migrar kinds menos consultados para um segundo banco D1 ou para R2 como arquivo histórico.
- Quando queries complexas com múltiplos JOINs começarem a demorar mais de 100ms: D1 não tem planner sofisticado. Se isso acontecer, considerar Postgres (mas não antes de medir).
- Quando o volume de writes ultrapassar 50M/mês de forma consistente: o Workers Paid cobre 50M writes gratuitos. Se a ingestão completa do INPI histórico (backfill de 2.893 edições × 29.500 rows = ~85 milhões de rows potenciais, com dedupe real provavelmente muito menor) for realizada, pode haver custo de write pontual. Com dedupe agressiva por `processNumber`, o volume real de writes únicos provavelmente fica abaixo de 1–3 milhões de rows novas.

**Estimativa de custo do D1 para os cenários desta plataforma:** praticamente zero dentro do Workers Paid (US$ 5/mês). O D1 não é o gargalo de custo.

### 2.2 Cloudflare R2

Preços vigentes (verificar em https://developers.cloudflare.com/r2/pricing/ para confirmar, pois podem mudar):

| Item | Free tier | Além do free tier |
|---|---|---|
| Armazenamento | 10 GB/mês | US$ 0,015/GB/mês |
| Operações Class A (PUT, DELETE, escrita) | 1 milhão/mês | US$ 4,50/milhão |
| Operações Class B (GET, leitura) | 10 milhões/mês | US$ 0,36/milhão |
| Egress para internet | **Grátis** | Grátis |
| Egress para Workers Cloudflare | **Grátis** | Grátis |

O ponto crítico do R2 é que o egress é grátis — diferente de S3 (AWS cobra US$ 0,09/GB de saída). Isso muda completamente a conta para casos de uso de serving de blobs via Worker.

**Volume estimado para uso atual e próximo:**
- PDFs de editais SLE ativos (~80 PDFs × 600 KB): ~48 MB. Free tier cobre por décadas de editais só desse módulo.
- Dumps brutos CKAN (CSV mensal de dados.gov.br): os maiores arquivos do CKAN federal são os dumps de compras públicas e CNPJ — que chegam a dezenas de GB por arquivo. Para o CNPJ, o dump completo da Receita Federal é liberado mensalmente em arquivos ZIP divididos que somam ~5 GB comprimidos. Guardar 2 versões históricas ocupa ~10 GB — no limite do free tier. A partir da terceira versão retida, o custo seria de ~US$ 0,15/mês por versão adicional de 10 GB. É barato.
- ZIPs da RPI/INPI (opcional, armazenamento das edições semanais): cada edição ~9 MB comprimido. Armazenar as últimas 52 semanas = ~468 MB. Free tier. Armazenar histórico completo (~2.893 edições) = ~26 GB → US$ 0,24/mês além do free.

**Conclusão R2:** para os casos de uso descritos neste plano, o custo de R2 ao longo do primeiro ano fica em zero ou poucos dólares por mês. O R2 não é uma decisão de custo — é uma decisão de arquitetura (ter ou não ter os blobs brutos disponíveis para reprocessamento).

### 2.3 Supabase Postgres + pgvector

O plano **Pro (US$ 25/mês)** tem:
- 8 GB de armazenamento de banco de dados
- 250 GB de egress
- 500 MB de armazenamento de arquivos (Supabase Storage, que não está sendo usado)
- pgvector disponível

Cada embedding de 768 dimensões ocupa `768 × 4 bytes = 3.072 bytes ≈ 3 KB` por linha. Com 217k entidades embeddadas: ~650 MB só de embeddings. Somando os dados das linhas (sem contar a coluna de embedding): cada row da `entities` tem ~1–3 KB de dado, totalizando ~200–600 MB. No estado atual (~217k rows com embedding), o banco usa estimados **800 MB a 1,3 GB** — dentro dos 8 GB do Pro.

**Quando o Supabase Pro deixa de ser suficiente:**
- Ao superar ~2 milhões de rows com embedding (usando ~6 GB só de vetor), o banco começa a estourar os 8 GB do plano Pro.
- A migração seria para o plano **Team (US$ 599/mês)** ou **Enterprise** — o salto de custo é brutal.
- Alternativa antes desse ponto: separar embeddings em uma tabela `entity_embeddings (id, embedding vector(768))` sem os outros campos, permitindo que o HNSW index caiba melhor e que a tabela principal seja mais compacta.
- Alternativa para escala maior (>5M entidades com embedding): avaliar **Qdrant Cloud** (plano gratuito até 1GB, depois US$ 0,02/GB). Mas só justifica se o Supabase Pro não couber — hoje está longe disso.

### 2.4 Custo de embeddings Gemini

O modelo `text-embedding-004` (768d) é o que está em uso hoje. A precificação do Google AI Studio/Vertex AI para embeddings é cobrada por token de entrada. Para verificar o preço exato atual consulte https://ai.google.dev/pricing, mas como referência histórica o `text-embedding-004` via API do Google AI tem cobrado na faixa de **US$ 0,00001 a US$ 0,00002 por 1.000 tokens de entrada** — ou seja, US$ 0,01 a US$ 0,02 por 1 milhão de tokens.

Uma entidade típica tem um texto de embedding de ~50–150 tokens (name + kind + atributos principais concatenados). Para 217k entidades existentes: ~10–30 milhões de tokens = US$ 0,10 a US$ 0,60. Custo negligível.

Para o backfill completo do INPI (hipótese: 1 milhão de marcas únicas): ~50–150M tokens = US$ 0,50 a US$ 3,00. Ainda muito barato.

O custo real de embedding só se torna relevante se gerar embeddings de chunks de PDFs (textos longos) em escala. Um PDF de edital com 20 páginas pode ter 5.000–15.000 tokens. Para 1.000 PDFs: 5–15 bilhões de tokens = US$ 50 a US$ 300. Esse é o cenário em que o custo começa a ser conversação, não erro desprezível.

### 2.5 Cloudflare KV

KV tem free tier de 100k writes/dia e 100k reads/dia. O Workers Paid inclui 1 bilhão de reads/mês e 1 milhão de writes/mês. Para o uso de cache de CNPJ e flags, o free tier é suficiente por muito tempo.

---

## 3. Política de retenção e idempotência

### 3.1 Dedupe por hash (já parcialmente implementado)

A migration `0009_evidence_integrity.sql` já implantou SHA-256 em `evidence.content_hash`. O padrão de upsert por `(source_id, external_id)` em todas as funções `ingest_*` já garante idempotência no nível da entidade. O que falta formalizar:

- **Blobs no R2:** antes de fazer PUT, calcular `sha256` do conteúdo. A key do objeto deve ser `{bucket}/{source}/{sha256_prefix4}/{sha256}.{ext}` — isso torna o objeto naturalmente idempotente (mesmo arquivo = mesma key). Registrar o hash em `raw_records.content_hash` com `source_url = r2://fonteia-blobs/...` para rastreabilidade.
- **Dumps CSV/ZIP brutos:** a key deve incluir a data de publicação oficial do dump (não a data de download), para evitar que o mesmo arquivo baixado duas vezes gere dois objetos. Usar `{bucket}/raw/{source_id}/{published_date}/{filename}`.
- **`collected_at` preservado:** já está na política de `ingest_*` — o campo `collected_at` no `raw_records` registra quando o dado foi coletado, e o upsert não o atualiza em reingestão. Manter essa convenção para todos os novos ingestores.

### 3.2 O que apagar vs. arquivar

Nunca deletar blobs brutos do R2 que já têm `content_hash` registrado em `raw_records` — são a cadeia de custódia do dado. A evidência ("este dado veio deste arquivo nesta data") perde validade se o blob original desaparecer.

**Apagar:** versões intermediárias de processamento (chunks temporários, arquivos parcialmente processados, backups de estado de cursor). Esses nunca devem ir para R2 — ficam em memória ou em KV com TTL de horas.

**Arquivar:** dumps mensais da Receita Federal CNPJ de mais de 12 meses podem ser movidos para uma prefix `/archive/` no R2 com lifecycle rule para classe de armazenamento mais barata (quando disponível no R2 — verificar suporte). Para o INPI histórico, uma vez que todas as edições foram ingeridas e parsadas, os ZIPs originais no R2 podem ser marcados como `archive` e mantidos indefinidamente a custo de ~US$ 0,015/GB/mês — custo aceitável para integridade de auditoria.

**Não arquivar nunca:** evidências de entidades ativas (PDFs de editais ainda em prazo de proposta, contratos em vigor). Só arquivar após encerramento do prazo + 90 dias.

### 3.3 Atualização incremental por cursor (anti-baixar-tudo)

O padrão correto para manter dados frescos não é baixar o dataset inteiro em cada execução — é manter um cursor da última atualização processada.

Para datasets com controle de data:
- **PNCP:** usar `dataPublicacao` como cursor. A cada execução de cron, buscar contratos com `dataPublicacao >= cursor_atual`. Atualizar o cursor no KV após sucesso.
- **INPI/RPI:** o número da edição é o cursor natural. Guardar em KV: `ingest:inpi:last_revista = 2893`. Toda segunda-feira o cron tenta `?revista=last+1` e avança se der 200.
- **SLE Receita:** já funciona por varredura de `editais-disponiveis` — por natureza é incremental (só expõe editais ativos). Para histórico, usar `?all=1` uma vez por semana.
- **CKAN (dados.gov.br, dados.prefeitura.sp.gov.br):** a API CKAN tem `?sort=metadata_modified+desc&start=0&rows=N` que permite buscar apenas recursos modificados desde a última execução. Guardar em KV: `ingest:ckan:prefeitura_sp:last_modified = <ISO>`. Se o dataset não tiver `metadata_modified` confiável, usar hash do arquivo para detectar mudança sem reprocessar.

Para dumps sem cursor (ex.: dump mensal do CNPJ que é sempre o arquivo inteiro):
- Guardar o SHA-256 do arquivo baixado em KV: `ingest:cnpj:last_hash`.
- Se o hash não mudou, não reprocessar — skip completo.
- Se mudou, baixar para R2, parsear incrementalmente com streaming (não carregar o CSV inteiro em memória na Edge Function — usar um Worker com Streams API ou uma GitHub Action).

---

## 4. Estratégia dirigida por demanda

Esta é a regra mais importante: **não espelhar cego — ingerir na ordem do que os clientes buscam.**

### 4.1 Critérios de priorização de dataset

| Critério | Como medir |
|---|---|
| Volume de busca por módulo | Logs da Edge Function `fonteia` (campo `intent` ou `module` nas respostas da IA) |
| Perguntas sem resposta ("evidência insuficiente") | Contagem de respostas onde a IA retornou `confidence < 0.5` ou sem `evidence[]` |
| Pedidos explícitos de clientes | Registrar no suporte; cada pedido de "vocês têm dados de X?" é um voto |
| Taxa de conversão por módulo | Quais módulos os leads mencionam na compra (feedback de vendas) |
| Custo de ingestão vs. valor gerado | Datasets gratuitos e fáceis sobem na fila; datasets que exigem parsing complexo/OCR descem |

### 4.2 Implementação prática

Hoje não existe pipeline de telemetria dos logs de busca. O mínimo viável é adicionar uma linha de log estruturado em `supabase/functions/fonteia/index.ts` (ou onde a IA processa as queries) que registre `{ module, query_kind, had_evidence: bool, timestamp }` em uma tabela `search_logs` ou via `analytics.track()` externo (PostHog, Plausible com eventos customizados, ou simplesmente um INSERT em Supabase).

Sem esse dado, as decisões de qual dataset ingerir são opiniões. Com esse dado, são fatos.

### 4.3 Ordem sugerida para novos datasets CKAN

Baseado no estado atual dos módulos (8 módulos com dados reais) e na lógica de "o que preenche lacunas do Cérebro":

1. **Dump completo CNPJ da Receita Federal** — o maior multiplicador de valor do Cérebro. Liga empresa ↔ todos os outros módulos. Disponível em https://dados.rfb.gov.br/CNPJ/. Formato: vários CSVs ZIP (~5 GB comprimidos). Ingestão via GitHub Action + armazenamento raw no R2 + parsing incremental.

2. **CKAN SP (dados.prefeitura.sp.gov.br)** — contratos e licitações municipais de SP. Relevante para clientes B2G em SP. Dataset disponível via CKAN API.

3. **Dados abertos INPI (dadosabertos.inpi.gov.br)** — dump da base completa de marcas (não só movimentações semanais da RPI). Para passar de ~30k marcas para centenas de milhares de marcas ativas com CNPJ do titular.

4. **Diário Oficial da União (INLABS/DOU)** — complementar ao jurídico. APIs de busca no DOU via https://in.gov.br/en/web/dou/tecnologias. Valor: detectar nomeações, contratos, atos administrativos por CNPJ.

5. **TCE-SP e outros Tribunais de Contas** — já há `ingest_tce_sp` no repositório. Dados de auditoria por órgão/CNPJ.

---

## 5. Buckets, recursos e passo a passo de provisionamento

### 5.1 Recursos a criar

| Recurso | Nome sugerido | Propósito |
|---|---|---|
| R2 Bucket | `fonteia-blobs` | Blobs processados e servidos: PDFs de editais, documentos com hash registrado em `evidence` |
| R2 Bucket | `fonteia-raw` | Dumps brutos de fontes (CSV, ZIP, XML) antes do parse. Imutável por hash. |
| KV Namespace | `fonteia-cache` | Cache de consultas externas, cursores de ingestão, feature flags |
| KV Namespace | `fonteia-cursors` | Cursores de cron (separado de cache para não expirar acidentalmente) |

O KV `fonteia-cache` e `fonteia-cursors` podem ser o mesmo namespace se quiser simplicidade — use prefixos de chave (`cache:`, `cursor:`, `flag:`) para separar o conteúdo. A divisão em dois namespaces é mais segura porque o TTL de cache não vai expirar cursores de ingestão por acidente.

### 5.2 Variáveis de ambiente e secrets necessários

Para as Edge Functions que farão upload para o R2:

```
SUPABASE_URL                    (já injetado automaticamente)
SUPABASE_SERVICE_ROLE_KEY       (já injetado automaticamente)
CF_API_TOKEN                    (já no Vault como CF_API_TOKEN — confirmar que tem permissão R2 além de D1)
CF_ACCOUNT_ID                   (já no Vault)
CF_R2_BUCKET_BLOBS              = fonteia-blobs
CF_R2_BUCKET_RAW                = fonteia-raw
```

**Atenção:** o `CF_API_TOKEN` já no Vault foi criado com permissão "D1 Edit". Para o R2, o token precisa ter também a permissão "R2 Object Read & Write". Se o token atual não tem essa permissão, criar um novo token com ambas as permissões (ou usar o mesmo token e editar as permissões no Cloudflare Dashboard) e atualizar o Vault. Não criar um token diferente para R2 — um único token com as permissões mínimas necessárias é mais simples de rotar.

Para Workers que leem do R2 via binding nativo (mais eficiente do que via API REST):
- Adicionar binding `[[r2_buckets]]` no `wrangler.toml` do Worker relevante (não está definido em nenhum `wrangler.toml` atualmente). Bindings nativos eliminam a necessidade de passar o `CF_API_TOKEN` no código — o runtime injeta a credencial.

Para o KV:
- Criar via `wrangler kv namespace create fonteia-cache --env production`
- Adicionar binding `[[kv_namespaces]]` nos Workers que precisarem

### 5.3 Passo a passo de provisionamento (o que o dono precisa autorizar)

**Pré-condição:** Workers Paid ativo (US$ 5/mês). Sem ele, os limites de D1 Free são muito restritivos. Se já está ativo, pular o passo 1.

**Passo 1 — Ativar Workers Paid (decisão do dono, custo US$ 5/mês):**
Dashboard Cloudflare → Workers & Pages → Plans → Workers Paid. Libera D1 sem limite de banco, KV com tier generoso e R2 free tier de 10 GB.

**Passo 2 — Criar os buckets R2 (o time faz via MCP `r2_bucket_create` ou via wrangler):**
```bash
wrangler r2 bucket create fonteia-blobs
wrangler r2 bucket create fonteia-raw
```
Nenhum custo até superar 10 GB combinados.

**Passo 3 — Criar KV Namespaces:**
```bash
wrangler kv namespace create fonteia-cache --env production
wrangler kv namespace create fonteia-cursors --env production
```
Anotar os IDs retornados e adicionar aos `wrangler.toml` dos Workers relevantes.

**Passo 4 — Atualizar o CF_API_TOKEN no Vault para incluir permissão R2:**
No Cloudflare Dashboard → API Tokens → editar o token que está no Vault como `CF_API_TOKEN` → adicionar permissão "R2 Object Read & Write" para a conta inteira. Não mudar o valor do token (editando permissões, o valor permanece o mesmo). Confirmar no Vault que o valor bate.

**Passo 5 — Criar função `ingest-receita-pdfs` e binding R2 no Worker de ingestão:**
Essa é a primeira função que usará o R2. O binding nativo no Worker Deno elimina a necessidade de chamar a API REST do R2 — basta usar `env.FONTEIA_BLOBS.put(key, body)`. Para Edge Functions Supabase (Deno), o acesso ao R2 é via API REST com o `CF_API_TOKEN` do Vault (mesma abordagem do d1-bridge). Para Workers Cloudflare (como `services/ingest`), o binding nativo é possível.

**Passo 6 — Configurar lifecycle/cors do R2 (opcional mas recomendado):**
Adicionar CORS policy no bucket `fonteia-blobs` se for servir arquivos diretamente para o browser (ex.: link para PDF do edital). Se o serving for feito via Worker intermediário (recomendado — controle de acesso), CORS no bucket não é necessário.

---

## 6. Estimativa de custo por escala

Os três cenários abaixo refletem estágios realistas da plataforma, não projeções otimistas.

### Premissas dos cenários

- Workers Paid: US$ 5/mês (plano base)
- Supabase Pro: US$ 25/mês (já ativo)
- R2: US$ 0,015/GB/mês além de 10 GB gratuitos
- D1: zero adicional dentro do Workers Paid (reads e writes dentro do free tier do plano pago)
- Gemini embeddings: US$ 0,02 por 1M tokens
- Gemini Flash (respostas IA): US$ 0,075 por 1M tokens de entrada, US$ 0,30 por 1M tokens de saída (verificar preço atual)
- Stripe: 2,9% + R$ 0,30 por transação (já existente, não muda com volume de dados)

### Cenário Enxuto: estado atual + primeiros datasets novos

- D1: ~217k entidades + backfill INPI (~500k marcas únicas históricas) + PNCP contratos + dump CNPJ parcial → ~1 milhão de rows estimadas
- Supabase Postgres: ~217k entidades com embedding, auction_lots (~5k lotes), dados de usuário de ~50 clientes ativos
- R2 blobs: PDFs de editais SLE ativos (~50 MB) + algumas versões de dump CNPJ (~5 GB)
- KV: cursores + cache
- Gemini: embedding de ~500k entidades novas (~250M tokens) → US$ 5 (pontual, não recorrente)
- Gemini IA: 50 clientes × 100 queries/mês × ~2.000 tokens cada → ~10M tokens/mês → ~US$ 0,75/mês

**Custo mensal recorrente:**
| Item | Custo |
|---|---|
| Workers Paid | US$ 5,00 |
| Supabase Pro | US$ 25,00 |
| R2 storage (~5 GB, dentro do free tier) | US$ 0,00 |
| D1 (dentro do Workers Paid) | US$ 0,00 |
| Gemini IA (recorrente) | US$ 0,75 |
| Gemini embeddings (amortizado) | ~US$ 0,50 |
| **Total infraestrutura** | **~US$ 31/mês** |

Com os planos atuais (2 × R$ 197 + 2 × R$ 597 = R$ 1.588/mês de exemplo) a margem de infraestrutura é muito confortável. O custo de infra não é o problema neste cenário.

### Cenário Médio: plataforma consolidada, ~500 clientes

- D1: ~3 milhões de entidades (dump CNPJ completo + todos os módulos atuais + 1 ano de PNCP + INPI base completa)
- Supabase Postgres: ~1 milhão de rows com embedding (auction_lots + entidades-chave com busca semântica) → ~3 GB de embeddings
- R2 blobs: PDFs históricos de editais + 6 versões mensais de dump CNPJ + XMLs INPI históricos → ~40 GB
- KV: normal

**Custo mensal recorrente:**
| Item | Custo |
|---|---|
| Workers Paid | US$ 5,00 |
| Supabase Pro | US$ 25,00 |
| R2 storage (~40 GB, 30 GB além do free) | US$ 0,45 |
| D1 writes extras (batch de migração) | ~US$ 1,00 (se >50M writes/mês no pico) |
| Gemini IA (500 clientes × 200 queries × 2k tokens) | ~US$ 15 |
| Gemini embeddings (novas entidades) | ~US$ 1,00 |
| **Total infraestrutura** | **~US$ 47/mês** |

Neste cenário, o Supabase começa a pressionar os 8 GB de storage do plano Pro (~3 GB de embeddings + ~2 GB de dados + ~2 GB de índices HNSW). Planejar migração dos embeddings de entidades bulk para uma solução separada ou upgrade do Supabase antes de atingir 7 GB.

### Cenário Agressivo: "cérebro de dados públicos", todos os datasets, ~2.000 clientes

- D1: ~10 milhões de entidades (próximo do limite de 10 GB do banco — planejar partição por kind em múltiplos bancos D1 ou migrar entidades bulk para Postgres com particionamento)
- Supabase Postgres: ~5 milhões de rows com embedding → **~15 GB só de embeddings** → estoura o plano Pro (8 GB)
- Supabase upgrade necessário: plano Team (US$ 599/mês) — o maior salto de custo de toda a stack
- Alternativa: mover embeddings bulk para Qdrant Cloud (US$ 0,02/GB) → ~5M × 3 KB = 15 GB → US$ 0,30/mês + taxa por query. Economiza US$ 574/mês vs. upgrade do Supabase.
- R2 storage: ~200 GB (histórico completo de dumps + PDFs + XMLs INPI) → US$ 0,00 (free tier: 10 GB) + 190 GB × US$ 0,015 = US$ 2,85/mês
- Gemini IA: 2.000 clientes × 300 queries × 2k tokens → ~US$ 60/mês

**Custo mensal recorrente:**
| Item | Custo |
|---|---|
| Workers Paid | US$ 5,00 |
| Supabase Pro (se mantido com embedding separado) | US$ 25,00 |
| Qdrant Cloud (embeddings bulk) | ~US$ 10,00 |
| R2 storage (~200 GB) | US$ 2,85 |
| D1 (múltiplos bancos ou reads extras) | ~US$ 5,00 |
| Gemini IA | US$ 60,00 |
| Gemini embeddings (manutenção) | US$ 3,00 |
| **Total infraestrutura** | **~US$ 111/mês** |

Se em vez de separar os embeddings o upgrade para Supabase Team for a escolha (US$ 599/mês), o custo total sobe para ~US$ 660/mês. A diferença de US$ 550/mês só se justifica se o volume de dados transacionais (billing, auth, alerts) também exigir o Team — ou seja, se o Supabase Pro não couber o banco como um todo, não só os embeddings. Nesse ponto, fazer a análise de quais tabelas pesam mais antes de decidir.

### Tabela resumida dos três cenários

| Métrica | Enxuto | Médio | Agressivo |
|---|---|---|---|
| Entidades no D1 | ~1M rows / ~1 GB | ~3M rows / ~3 GB | ~10M rows / ~10 GB |
| Embeddings (Postgres) | ~217k / ~650 MB | ~1M / ~3 GB | ~5M / ~15 GB (exige solução separada) |
| R2 storage | ~5 GB | ~40 GB | ~200 GB |
| Clientes ativos | ~50 | ~500 | ~2.000 |
| Custo infra/mês | **~US$ 31** | **~US$ 47** | **~US$ 111** (com Qdrant) ou ~US$ 660 (Supabase Team) |
| Receita estimada (mix de planos) | R$ 3–5k/mês | R$ 30–80k/mês | R$ 150–400k/mês |
| Margem de infra | >95% | >99% | >99% |

A infraestrutura nunca vai ser o problema de margem nesta plataforma — o problema é crescimento de receita, não custo de infra.

---

## 7. Plano recomendado para começar já (sem decisão difícil)

O ponto de partida correto — dado o estado atual e os próximos passos já mapeados nos outros documentos — é:

1. **Confirmar que o Workers Paid já está ativo.** Se não estiver, ativar (US$ 5/mês). Tudo o mais depende disso.

2. **Criar os dois buckets R2** (`fonteia-blobs` e `fonteia-raw`) via wrangler ou MCP. Custo zero. Sem isso, o pipeline de PDFs de editais não tem destino.

3. **Verificar as permissões do CF_API_TOKEN no Vault.** Se o token atual tem apenas "D1 Edit", adicionar "R2 Object Read & Write" no Cloudflare Dashboard antes de implementar qualquer código de upload.

4. **Criar os dois KV Namespaces** (`fonteia-cache` e `fonteia-cursors`). Custo zero. Necessário para os cursores de cron que evitarão re-download de dados já ingeridos.

5. **Não tomar nenhuma decisão sobre Qdrant, segundo banco D1 ou upgrade do Supabase agora.** Essas são decisões do cenário Agressivo, que exige ~10x o volume atual de embeddings. Revisar quando o Supabase Postgres estiver em ~5 GB de uso total.

---

*Documento de referência. Verificar preços atuais do R2, D1 e Gemini antes de qualquer decisão de orçamento — os valores aqui são referências de ordem de grandeza baseadas em preços disponíveis até junho/2026.*
