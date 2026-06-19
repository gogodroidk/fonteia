# Modelo de Dados e Garantias de Histórico — Fonte.ia

Referência técnica para engenheiros e operadores. Descreve o esquema de `entities`, os `kind`s ativos, o fluxo Postgres → D1, as garantias de não-perda de histórico e o runbook de backfill.

---

## 1. Arquitetura de dados

O armazenamento é dividido em dois nós complementares conforme o padrão de acesso:

**Supabase Postgres** é a fonte da verdade. Contém a tabela `entities` (todos os `kind`s), as tabelas de auditoria (`raw_records`, `source_runs`, `evidence`, `claims`, `entity_links`), embeddings vetoriais para busca semântica e os dados transacionais de negócio (subscriptions, alertas, cupons). O embedding é `vector(768)` gerado pelo Gemini — a migration 0001 declarou `vector(1536)` mas o banco em produção usa 768 (divergência documentada em `docs/HARDENING.md`).

**Cloudflare D1** (`fonteia-data`, ID `417caa83-86dc-463e-8682-656cf938cd24`) é a réplica de leitura bulk, carregada pela rota `/migrate` da Edge Function `d1-bridge`. Armazena as mesmas colunas de `entities` exceto `embedding` e `geometry` (não suportados pelo D1). O app consulta o D1 via `d1-bridge /query` para kinds de volume alto (municípios, empresas, licitações, marcas etc.), deixando o Postgres livre para busca vetorial e consultas autenticadas.

O fluxo completo é:

```
Fontes públicas (APIs / arquivos)
        ↓
  Edge Functions ingest-* (Deno, ~150s)
        ↓  RPC SECURITY DEFINER
  Postgres public.entities  ←→  source_runs / raw_records / evidence
        ↓  d1-bridge /migrate (keyset, INSERT OR REPLACE)
  Cloudflare D1
        ↑  d1-bridge /query
  apps/web (Vite + React)
```

A rota `/migrate` lê o Postgres em lotes de 500 linhas por keyset (`id > lastId`, `kind <> 'auction_lot'`) e grava no D1 em sub-lotes de 8 tuplas por statement (limite de 100 bind vars do D1). O processo é idempotente: `INSERT OR REPLACE`. Leilões (`auction_lot`) ficam apenas no Postgres porque têm acesso público irrestrito por política RLS própria.

---

## 2. Catálogo de `kind`s

A tabela abaixo lista todos os `kind`s com dados reais em produção. Campos marcados como _(verificar)_ são razoáveis com base no código de normalização disponível, mas o schema exato de `attributes` pode variar conforme evolução da Edge Function.

| `kind` | Módulo | Fonte oficial | Chave natural (`external_ids`) | RPC de ingestão |
|---|---|---|---|---|
| `auction_lot` | leilões | Receita Federal (SLE) | `receitaLotId` | `ingest_receita_lots` / `ingest_receita_catalog` |
| `bidding` / `public_contract` | licitações | PNCP | _(verificar)_ | `ingest_pncp` / `ingest_pncp_contratos` |
| `company` | empresas | BrasilAPI → Receita Federal | `cnpj` (coluna nativa) | `ingest_brasilapi_cnpj` |
| `municipality` | municípios | IBGE | _(verificar)_ | `ingest_municipios` |
| `parliamentary_expense` | política | Câmara — CEAP | `codDocumento` | `ingest_camara_despesas` |
| `legislative_vote` | política | Câmara — votações | `votacaoId` | `ingest_camara_votacoes` |
| `environmental_infraction` | ambiental | IBAMA — autos de infração | `seqAutoInfracao` | `ingest_ambiental` |
| `environmental_alert` | ambiental | INPE / Programa Queimadas | `queimadasId` | `ingest_inpe_queimadas` |
| `legal_process` | jurídico | CNJ DataJud | `numeroProcesso` | `ingest_cnj` |
| `trademark` | INPI | INPI / RPI (XML semanal) | `processNumber` | `ingest_inpi` |
| `fiscal_report` | municípios | Tesouro Nacional (Siconfi) | `siconfiId` | `ingest_siconfi` |
| `federal_transfer` | transferências | Transferegov / +Brasil | `transferegovId` | `ingest_transferegov` |
| `sanction` | empresas | Portal da Transparência (CEIS) | _(verificar)_ | `ingest_portal_transparencia` |

### 2.1 `auction_lot` — Leilões judiciais (Receita Federal)

Fonte: Sistema de Leilão Eletrônico da Receita Federal (SLE), endpoint operacional sem API pública documentada.

- **Chave**: `external_ids->>'receitaLotId'` (formato `edle-nrAtribuido`). Dois coletores convergem na mesma chave: `ingest_receita_lots` (destaques) e `ingest_receita_catalog` (catálogo completo). Idempotente: o segundo upsert apenas atualiza o registro existente.
- **`attributes` principais**: `displayNumber`, `edital`, `edle`, `category`, `city`, `valorAvaliacaoCents`, `imageUrls`, `sourceUrl`, `proposalDeadline`.
- **Cron**: diário. O acesso ao SLE é classificado como `fragile_operational` — usar cache/fallback se o endpoint responder fora do padrão.
- **Nota de acesso**: `auction_lot` é o único `kind` público por RLS (policy "Public auction lots are readable"), lido diretamente do Postgres pelo app. Não está no D1.

### 2.2 `company` — Empresas (BrasilAPI / Receita Federal)

Fonte: BrasilAPI (`https://brasilapi.com.br/api/cnpj/v1/{cnpj}`) como proxy da Receita Federal. Confiança `0.85` (comunitária, não oficial direta).

- **Chave**: coluna `cnpj` (14 dígitos, sem pontuação). Índice único parcial `idx_entities_company_cnpj_unique`.
- **`attributes` principais**: `razaoSocial`, `nomeFantasia`, `situacaoCadastral`, `cnaePrincipal`, `cnaesSecundarios`, `capitalSocial`, `simples`, `mei`, `qsa`, `dataInicioAtividade`, `naturezaJuridica`, `municipio`, `uf`, `codigoIbge`.
- **Rate limit**: 800 ms entre consultas (não documentado pela BrasilAPI).
- **Cron**: sob demanda (enriquecimento por CNPJ referenciado em outros kinds).

### 2.3 `municipality` — Municípios (IBGE)

Fonte: IBGE.

- **Chave**: _(verificar — código IBGE esperado em `external_ids` ou coluna `ibge_code`)_.
- **`attributes` principais**: dados demográficos, geográficos e administrativos do IBGE _(verificar campos exatos)_.
- **Cron**: cadência baixa (dados mudam raramente).

### 2.4 `parliamentary_expense` — Despesas CEAP (Câmara dos Deputados)

Fonte: API REST de cotas parlamentares (`dadosabertos.camara.leg.br/api/v2/deputados/{id}/despesas`).

- **Chave**: `external_ids->>'codDocumento'`.
- **`attributes` principais**: `deputadoId`, `deputadoNome`, `partido`, `uf`, `tipo`, `fornecedor`, `cnpjFornecedor`, `valorDocumento`, `valorLiquido`, `valorGlosa`, `dataDocumento`, `ano`, `mes`, `urlDocumento`, `numDocumento`.
- **Cron**: mensal ou sob demanda por legislatura.

### 2.5 `legislative_vote` — Votações (Câmara dos Deputados)

Fonte: `dadosabertos.camara.leg.br/api/v2/votacoes`.

- **Chave**: `external_ids->>'votacaoId'` (formato `<id>-<seq>`, ex. `2473873-65`).
- **`attributes` principais**: `data`, `dataHoraRegistro`, `descricao`, `siglaOrgao`, `idOrgao`, `idEvento`, `aprovacao`, `placarSim`, `placarNao`, `placarAbstencoes`, `tipoVotacao`, `proposicao` (objeto com siglaTipo, numero, ano, ementa), `votos` (array).
- **Cron**: diário durante sessões legislativas.

### 2.6 `environmental_infraction` — Autos de Infração (IBAMA)

Fonte: IBAMA Dados Abertos (`dadosabertos.ibama.gov.br`).

- **Chave**: `external_ids->>'seqAutoInfracao'`.
- **`attributes` principais**: `infrator`, `cpfCnpj`, `uf`, `codigoIbge`, `tipoInfracao` _(outros campos verificar)_.
- **Cron**: mensal.

### 2.7 `environmental_alert` — Focos de Incêndio (INPE / Queimadas)

Fonte: Programa Queimadas do INPE, CSV mensal público sem autenticação.
URL: `https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/mensal/Brasil/focos_mensal_br_YYYYMM.csv`

- **Chave**: `external_ids->>'queimadasId'` com formato `queimadas:<municipio_id_ibge>:<anoMes>`. Um registro por município por mês; diferentes meses coexistem como registros independentes — nunca se sobrescrevem entre si.
- **`attributes` principais**: `anoMes`, `municipio`, `estado`, `uf`, `codigoIbge`, `totalFocos`, `frpSum`, `frpCount`, `frpTotal`, `frpMedio`, `maxRiscoFogo`, `maxDiasSemChuva`, `biomas` (histograma bioma → contagem), `bioma` (dominante derivado), `windows` (lista de byte-offsets já mesclados — garante idempotência entre janelas).
- **Cron**: mensal (arquivos ficam disponíveis após fechamento do mês).

### 2.8 `legal_process` — Processos Judiciais (CNJ DataJud)

Fonte: CNJ DataJud API Pública.

- **Chave**: `external_ids->>'numeroProcesso'`.
- **`attributes` principais**: `tribunal`, `grau`, `classe`, `assuntos`, `orgaoJulgador`, `dataAjuizamento`, `dataHoraUltimaAtualizacao`, `formato`, `sistema`, `nivelSigilo`, `qtdMovimentos`. Movimentos são omitidos do `attributes` para controle de tamanho; apenas a contagem é armazenada.
- **Cron**: diário.

### 2.9 `trademark` — Marcas (INPI / RPI)

Fonte: Revista da Propriedade Industrial (RPI), arquivo ZIP/XML semanal.
URL base: `https://revistas.inpi.gov.br/txt/RM<NUMERO>.zip`

- **Chave**: `external_ids->>'processNumber'` (número do processo, 9 dígitos).
- **`attributes` principais**: `processNumber`, `nome`, `niceClasses`, `status`, `titularNome`, `titularCnpj` (somente quando extraível do nome — o XML da RPI não traz CPF/CNPJ estruturado), `titularUf`, `apresentacao`, `natureza`, `despachoCodigo`, `despachoNome`, `dataDeposito`, `revista` (número da RPI).
- **Cron**: semanal (a RPI é publicada toda semana).
- **Limitação**: `cnpj` na tabela `entities` fica NULL para titulares pessoas físicas ou quando o CNPJ não é extraível do nome do titular. A busca funciona por nome e número de processo.

### 2.10 `fiscal_report` — Relatórios Fiscais (Tesouro / Siconfi)

Fonte: API Siconfi ORDS (`apidatalake.tesouro.gov.br/ords/siconfi/tt`). Demonstrativo Contábil Anual (DCA) por ente federativo.

- **Chave**: `external_ids->>'siconfiId'` com formato `siconfi-dca-<cod_ibge>-<exercicio>`. Anos diferentes geram IDs distintos e coexistem na tabela — um ente com dados de 2019 a 2024 terá até 6 registros independentes.
- **`attributes` principais**: `exercicio`, `codigoIbge`, `uf`, `esfera` (M/E/U), `regiao`, `populacao`, `dcaLinhas` (array de linhas contábeis: `anexo`, `coluna`, `codConta`, `conta`, `valor`).
- **Cron**: anual por exercício, com varredura histórica configurável (ver seção 3).

### 2.11 `federal_transfer` — Transferências Federais (Transferegov / +Brasil)

Fonte: API PostgREST pública do Transferegov, sem autenticação.
- FAF (Fundo a Fundo): `https://api.transferegov.gestao.gov.br/fundoafundo/plano_acao`
- TED (Termo de Execução Descentralizada): `https://api.transferegov.gestao.gov.br/ted/plano_acao`

- **Chave**: `external_ids->>'transferegovId'` com formato `<modulo>:<id_plano_acao>` (ex.: `faf:12345` ou `ted:67890`). Módulos diferentes de um mesmo plano resultam em registros distintos.
- **`attributes` principais (FAF)**: `modulo`, `nome`, `objeto`, `orgaoRepassador`, `cnpjOrgaoRepassador`, `orgaoRecebedor`, `cnpjOrgaoRecebedor`, `situacao`, `valorTotal`, `valorRepasse`, `dataInicio`, `dataFim`, `codigoPlanoAcao`, `municipio`, `uf`, `codigoIbge`.
- **`attributes` TED**: mesmo shape, mas com mapeamento defensivo de campos (ver limitações na seção 5).
- **Cron**: semanal ou sob demanda; cursor preserva progresso por módulo entre execuções.

### 2.12 `sanction` — Sanções (Portal da Transparência / CEIS)

Fonte: Portal da Transparência — CGU (requer token por cadastro).

- **Chave**: _(verificar — provavelmente identificador da sanção ou CNPJ+data)_.
- **`attributes` principais**: _(verificar campos exatos via `ingest-portal-transparencia`)_.
- **Cron**: mensal.

---

## 3. Garantias de histórico / não perder nada

### 3.1 IDs por período: coexistência sem sobrescrita

Dois coletores usam esquemas de `id` compostos que garantem que registros de períodos distintos sejam sempre registros independentes na tabela `entities`, nunca sobrescrevendo o histórico de outro período:

**INPE — focos de incêndio**

O `queimadasId` tem o formato `queimadas:<municipio_id>:<anoMes>`. Quando o coletor processa Janeiro/2024 (`202401`) de um município, ele grava ou atualiza o registro `queimadas:3550308:202401`. Quando processa Setembro/2024 (`202409`), ele grava `queimadas:3550308:202409`. Os dois registros coexistem na tabela com dados independentes. Rodar o coletor de Janeiro novamente não afeta Setembro — a chave é diferente.

**Siconfi — relatórios fiscais**

O `siconfiId` tem o formato `siconfi-dca-<cod_ibge>-<exercicio>`. O exercício de 2022 (`siconfi-dca-3550308-2022`) e o de 2023 (`siconfi-dca-3550308-2023`) são registros distintos. Re-ingerir 2022 atualiza apenas aquele registro sem tocar no de 2023.

**Transferegov — transferências**

O `transferegovId` tem o formato `<modulo>:<id_plano_acao>`. O mesmo plano no módulo FAF (`faf:12345`) e no TED (`ted:12345`) são entidades diferentes. O cursor de retomada é `modulo:offset`, então ao avançar o módulo TED não se regride o FAF já processado.

### 3.2 Merge aditivo do INPE entre janelas

O CSV mensal de focos pode ter até ~400 MB em meses de pico (ex.: setembro 2024 ≈ 408 MB). A Edge Function tem budget de ~150 segundos e baixa no máximo 4 MB por execução (janela configurável via `?window=`). Cada execução processa uma janela de byte-offsets e grava os parciais de foco por município.

Para que o total por município/mês fique correto após múltiplas janelas, a RPC `ingest_inpe_queimadas` (migration 0015) faz **merge aditivo**:

1. Cada item recebe um `windowKey` igual ao byte-offset inicial da janela.
2. A RPC carrega o registro existente no Postgres para aquele `queimadasId`.
3. Se o `windowKey` já está no array `windows` do registro, a janela foi processada antes — a RPC ignora o item (idempotência: reprocessar a mesma janela não duplica focos).
4. Se o `windowKey` é novo, a RPC soma os parciais: `totalFocos`, `frpSum`, `frpCount` são adicionados; `maxRiscoFogo` e `maxDiasSemChuva` tomam o `GREATEST`; o histograma de biomas é mesclado chave a chave.
5. Somente após a soma dos parciais a RPC deriva `frpMedio = frpSum / frpCount` e `bioma` (dominante pelo histograma acumulado). Calcular esses derivados por janela e somar as médias seria matematicamente errado.

O resultado é que qualquer número de execuções parciais sobre o mesmo arquivo mensal converge para o total correto, sem dupla-contagem.

### 3.3 Cursor de retomada (driver auto-avançante)

A migração referenciada no projeto como `0016` (não versionada no repositório até a data deste documento) descreve a tabela `ingest_cursors` e a função `ingest_driver_step`. O mecanismo funciona assim:

A tabela `ingest_cursors` armazena o estado de progresso de cada coletor — qual período/offset já foi processado. A função `ingest_driver_step('<source>')` avança um passo do cursor: determina a próxima janela a processar (próximo mês, próximo offset, próximo ente), invoca a Edge Function correspondente com os parâmetros corretos e atualiza o cursor ao receber sucesso.

Um cron periódico chama `ingest_driver_step` repetidamente para cada fonte. Ele varre TODO o histórico disponível de forma autônoma, respeitando o orçamento de 150 segundos por invocação de Edge Function.

**Floor configurável**: cada fonte tem um `floor_cfg` que define até onde o driver vai buscar no histórico. Valores típicos:

- INPE queimadas: 24 meses de histórico a partir da data corrente.
- Siconfi DCA: desde 2019 (primeiro ano disponível com cobertura ampla).

Ir mais fundo aumenta o armazenamento no D1 e no Postgres proporcionalmente. Para o INPE, cada mês adicional pode representar ~5.500 registros (municípios brasileiros). Para o Siconfi, cada exercício adicional adiciona tantos registros quanto entes federativos cadastrados (~5.600 municípios + estados + União).

### 3.4 Rastreabilidade: oficial vs. pública vs. IA

Cada entidade em `entities` aponta para sua origem via:

- `source_ids` (array): identificadores das fontes que contribuíram para o registro.
- Tabela `evidence`: cada registro de evidência tem `source_id`, `source_url`, `collected_at` e `content_hash`. O `content_hash` permite detectar se o conteúdo da fonte mudou desde a última coleta.
- Tabela `raw_records`: payload bruto original da fonte, com hash de integridade.

As fontes são classificadas em `sources.reliability`:
- `official_stable` — API governamental oficial com SLA documentado (PNCP, CNJ, Siconfi).
- `official_fragile` — endpoint governamental sem API documentada (Receita SLE, INPI/RPI).
- `community_stable` — fonte comunitária que espelha dados oficiais (BrasilAPI, confidence 0.85).

A IA (`fonteia` Edge Function) nunca fabrica dados: respostas da IA citam apenas evidências existentes na tabela `evidence`. Se não há evidência suficiente, a resposta declara "evidência insuficiente" em vez de inferir.

---

## 4. Runbook de backfill

### 4.1 Via driver automático (recomendado)

Se a tabela `ingest_cursors` e a função `ingest_driver_step` estiverem disponíveis (migration 0016 aplicada), basta chamar o driver para a fonte desejada via SQL Editor do Supabase ou via MCP:

```sql
-- Avança um passo do cursor para o coletor de queimadas
SELECT public.ingest_driver_step('inpe-queimadas-dados-abertos');

-- Para varredura histórica completa, chamar repetidamente até nextCursor = null:
-- (loop via cron ou manualmente no SQL Editor)
```

Para verificar o progresso:

```sql
SELECT source_id, cursor_value, last_run_at, last_status
FROM public.ingest_cursors
ORDER BY last_run_at DESC;
```

### 4.2 Via invocação direta da Edge Function

Quando o driver não está disponível ou é necessário processar um período específico:

**INPE queimadas — processar um mês específico:**
```bash
# Primeira janela do mês (offset 0)
curl -X GET \
  "https://<project>.supabase.co/functions/v1/ingest-inpe-queimadas?anoMes=202409" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"

# A resposta retorna { nextCursor: "202409:4000000" } se o arquivo não foi esgotado.
# Continuar com o cursor:
curl -X GET \
  "https://<project>.supabase.co/functions/v1/ingest-inpe-queimadas?anoMes=202409&offset=4000000" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"

# Repetir até fileExhausted: true ou nextCursor: null.
```

**Siconfi — processar um exercício específico e UF:**
```bash
# Processa os primeiros 20 entes municipais de SP do exercício 2022
curl -X GET \
  "https://<project>.supabase.co/functions/v1/ingest-tesouro-siconfi?exercicio=2022&uf=SP&limit=20&cursor=0" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"

# Continuar com nextCursor retornado (ex.: 20, 40, 60...):
curl -X GET \
  "https://<project>.supabase.co/functions/v1/ingest-tesouro-siconfi?exercicio=2022&uf=SP&limit=20&cursor=20" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

**Transferegov — retomar a partir de um offset:**
```bash
curl -X GET \
  "https://<project>.supabase.co/functions/v1/ingest-transferegov?cursor=faf:1000&maxPaginas=5" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

### 4.3 Acompanhar o progresso

**Contagem por kind no Postgres:**
```sql
SELECT kind, count(*) FROM public.entities GROUP BY kind ORDER BY count DESC;
```

**Contagem no D1** (via `d1-bridge /stats`):
```bash
curl "https://<project>.supabase.co/functions/v1/d1-bridge/stats" \
  -H "apikey: sb_publishable_uojihld8t92MQXo7gXrR3w_WPVn4RkZ"
```

**Runs recentes de ingestão:**
```sql
SELECT source_id, status, started_at, records_inserted, error_message
FROM public.source_runs
ORDER BY started_at DESC
LIMIT 20;
```

**Verificar se o D1 está sincronizado:**
```sql
-- Total no Postgres (excluindo auction_lot, que fica só no Postgres)
SELECT count(*) FROM public.entities WHERE kind <> 'auction_lot';
```
Comparar com o `total` retornado por `/stats` no D1. Uma diferença indica que `/migrate` precisa ser re-executado.

### 4.4 Re-executar a sincronização Postgres → D1

A rota `/migrate` do `d1-bridge` é idempotente (`INSERT OR REPLACE`). Para re-sincronizar todo o D1:

```bash
# Inicia do zero (sem ?after)
curl -X POST \
  "https://<project>.supabase.co/functions/v1/d1-bridge/migrate" \
  -H "apikey: sb_publishable_uojihld8t92MQXo7gXrR3w_WPVn4RkZ" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# A resposta retorna { lastId, done, totalRemainingHint, nextCall }.
# Se done=false, continuar com ?after=<lastId> até done=true.
```

### 4.5 Ajustar o floor histórico do driver

Se a tabela `ingest_cursors` existir, o `floor_cfg` pode ser atualizado diretamente:

```sql
-- Aumentar o histórico do INPE para 36 meses
UPDATE public.ingest_cursors
SET floor_cfg = jsonb_set(floor_cfg, '{months}', '36')
WHERE source_id = 'inpe-queimadas-dados-abertos';

-- Expandir o histórico do Siconfi para 2015
UPDATE public.ingest_cursors
SET floor_cfg = jsonb_set(floor_cfg, '{fromYear}', '2015')
WHERE source_id = 'tesouro-siconfi';
```

**Custo de ir mais fundo**: cada mês adicional do INPE processa ~5.500 registros no Postgres e D1. Cada exercício adicional do Siconfi processa ~5.600 entes. O armazenamento no D1 tem limites de plano — verificar o plano Cloudflare vigente antes de expandir o floor. A decisão de profundidade histórica é do dono do produto.

---

## 5. Limitações conhecidas e próximos passos

**TED / Transferegov — campos esparsos**: o módulo TED da API Transferegov tem estrutura diferente do FAF. A função `normalizeTed` em `ingest-transferegov/index.ts` usa leitura defensiva de múltiplos nomes de campo alternativos (`nome_orgao_descentralizador` / `sigla_orgao_descentralizador`, `codigo_ibge_municipio` / `cod_ibge_municipio` etc.), porque os nomes de campo da API TED divergem do padrão FAF e não estão documentados de forma estável. O `nome`, `objeto`, `valorTotal` e `valorRepasse` são derivados com fallbacks, o que pode resultar em campos como "Órgão não informado" ou "Objeto não informado" para planos TED com campos ausentes. A normalização do TED precisa de uma revisão com dados reais da API para confirmar os nomes canônicos de campo e eliminar os fallbacks defensivos.

**Migração 0016 não versionada**: a tabela `ingest_cursors` e a função `ingest_driver_step` são mencionadas como migration 0016, mas não constam nos arquivos em `infra/migrations/` na data deste documento. Se forem criadas via SQL Editor, devem ser versionadas no repositório seguindo o padrão das migrations anteriores.

**Profundidade histórica vs. armazenamento**: a decisão de `floor_cfg` para cada fonte envolve um trade-off que deve ser validado com o dono do produto. Histórico mais profundo aumenta o valor analítico (identificar tendências multi-anual de queimadas, séries fiscais de municípios) mas incrementa o tamanho do D1 e o custo de sincronização. A recomendação técnica é manter o floor mínimo viável por enquanto e expandir sob demanda conforme feedback de usuários.

**Vetor de embedding**: a coluna `entities.embedding` é `vector(768)` em produção, divergindo da migration 0001 (`vector(1536)`). A RPC `match_entities` e a função `similar_entities` usam `vector(768)` corretamente. Qualquer nova migration que referencie a coluna deve usar 768, não 1536.

**CNJ / LGPD**: processos judiciais têm sensibilidade de privacidade. O campo `movimentos` é omitido do `attributes` (apenas `qtdMovimentos` é armazenado). Qualquer expansão do modelo CNJ deve passar por revisão de compliance antes de ir para produção.
