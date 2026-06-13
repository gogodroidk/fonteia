# PLANO COMPLETO — Próxima Fase da Fonte.ia

> Documento de arquitetura de produto/dados. Escrito após leitura do código (App.tsx, `packages/sources`, `supabase/functions/ingest-receita-*`, esquema `entities/raw_records/evidence`, RPCs de ingestão) e pesquisa das fontes públicas reais. **Nenhum código foi alterado.**
>
> Data: 2026-06-13 · Estado atual: só o módulo **Leilões da Receita** está operacional.

---

## 0. Como o leilões flui hoje (o padrão a reusar)

O fluxo já está limpo e desacoplado. **Todo módulo novo deve copiar exatamente este caminho**, mudando só o `kind` da entidade e a tela:

```
Conector (TS puro, testável)            packages/sources/src/connectors/<fonte>.ts
   │  fetch + normalize → tipo de domínio
   ▼
Edge Function de ingestão (Deno)        supabase/functions/ingest-<fonte>/index.ts
   │  paginação + rate-limit educado + chama RPC em lotes
   ▼
RPC SQL (SECURITY DEFINER, idempotente) infra/migrations/000X_ingest_<fonte>.sql
   │  upsert em raw_records + entities(kind=…) + evidence
   ▼
Tabela genérica `entities` (kind, attributes JSONB, external_ids, geometry, embedding)
   │  RLS: SELECT público só para o kind liberado
   ▼
App lê entities por kind → tela do módulo  apps/web/src/app/<modulo>/…
```

**Por que isso escala bem (já está pronto na base):**

- `entities` é genérica: colunas `kind`, `name`, `normalized_name`, `cnpj`, `cpf_hash`, `ibge_code`, `external_ids JSONB`, `attributes JSONB`, `geometry` (PostGIS), `embedding VECTOR(1536)` (pgvector). **Não precisa de tabela nova por módulo** — só um `kind` novo.
- Os `ENTITY_KINDS` de **todos** os módulos já existem em `packages/domain/src/entities.ts`: `bidding_opportunity`, `company`, `legal_process`, `trademark`, `environmental_area`, `politician`, `municipality`, `public_contract`. Cada um já tem sua interface tipada.
- Os `MODULE_IDS` e a tabela `modules` já têm os 9 módulos cadastrados com `status` (`active`/`locked`). Ligar um módulo = ingerir dados + trocar status + criar tela.
- O `SOURCE_CATALOG` (`packages/sources/src/catalog.ts`, espelhado na migration `0001`) **já mapeia cada módulo para as fontes reais** com `status`, `accessKind`, `reliability`, `commercialRisk`. Boa parte da pesquisa de fontes já estava feita — este plano confirma, corrige e prioriza.
- `evidence` + `raw_records` dão rastreabilidade nativa (quote, source_url, hash, confidence). É o diferencial vendável ("decisão rastreável") e já funciona para qualquer fonte.
- Padrões operacionais maduros já existem: cache 15 min (KV), `source_runs` para telemetria, upsert idempotente por `(source_id, external_id)`, `?all=1` para histórico, rate-limit `sleep()` entre chamadas, secrets injetados automaticamente.

> **Conclusão de engenharia:** o custo de um módulo novo NÃO é a infra (já existe). É (1) escrever o conector + RPC de upsert para aquele `kind`, e (2) desenhar a tela + a "promessa de valor". Itens 1 são quase mecânicos. O esforço real está na tela e na curadoria do que entrega valor.

---

## PARTE 1 — Os módulos, fonte por fonte

Legenda de esforço: **Baixo** = conector + RPC + tela simples reusando o padrão (~1 sprint). **Médio** = paginação/auth/geo ou volume grande (~2–3 sprints). **Alto** = dados em arquivo bruto, geo pesado, ou expectativa de completude difícil de cumprir.

---

### 1.1 Licitações → PNCP ✅ LIGAR PRIMEIRO

| Item | Avaliação |
|---|---|
| **Fonte** | Portal Nacional de Contratações Públicas (PNCP), Gov. Federal. Em produção desde jan/2024; é a fonte oficial unificada da Lei 14.133/21. |
| **API existe?** | **Sim, REST + Swagger.** `https://pncp.gov.br/api/consulta/swagger-ui/index.html`. Endpoints de consulta: contratações **por data de publicação**, contratações **com período de propostas em aberto**, atas de registro de preço, contratos, e itens do PCA (Plano de Contratações Anual). |
| **Grátis / aberta?** | **Sim, 100% aberta.** Consulta sem cadastro, sem token, sem login. (Só as APIs de *manutenção* — inserir/retificar — exigem auth, e essas não nos interessam.) |
| **Rate limit** | Não documentado oficialmente como número rígido; trata-se de portal público de consulta. Usar paginação + rate-limit educado (mesmo padrão do `ingest-receita-catalog`). Já está no catálogo como `commercialRisk: low`. |
| **O que entrega de valor** | Editais ABERTOS em todo o Brasil filtráveis por UF/órgão/modalidade/objeto; preços praticados; concorrentes (quem ganhou contratos parecidos); calendário de propostas. Entidade `bidding_opportunity` já tem `pncpId`, `agencyName`, `openingDate`. |
| **Esforço** | **BAIXO.** É praticamente um clone do conector da Receita: JSON oficial, estável, paginado, sem auth. Maior fonte de valor B2G por menor esforço de toda a lista. |
| **Decisão** | **Módulo nº 2 — começar por aqui.** Reusa 90% do que já existe. |

Fontes: [Swagger PNCP](https://pncp.gov.br/api/consulta/swagger-ui/index.html) · [PNCP Dados Abertos](https://www.gov.br/pncp/pt-br/acesso-a-informacao/dados-abertos) · [Manual das APIs de Consultas PNCP](https://www.gov.br/pncp/pt-br/central-de-conteudo/manuais/versoes-anteriores/ManualPNCPAPIConsultasVerso1.0.pdf) · complementar: [Compras.gov.br Dados Abertos](https://dadosabertos.compras.gov.br/)

---

### 1.2 Empresas / CNPJ → BrasilAPI + cnpj.ws (e minha-receita self-host) ✅ LIGAR CEDO

| Item | Avaliação |
|---|---|
| **Fontes** | Dado primário é da **Receita Federal** (base pública de CNPJ). Vários gateways: **BrasilAPI** (comunitário, sem auth na maioria), **cnpj.ws** (API pública grátis), **minha-receita / OpenCNPJ** (self-host da base completa). |
| **API existe?** | **Sim, várias.** • cnpj.ws público: `https://publica.cnpj.ws/cnpj/{CNPJ}` (GET, sem auth). • BrasilAPI: `https://brasilapi.com.br/api/cnpj/v1/{CNPJ}`. • minha-receita: API web auto-hospedável da base inteira da RFB (repo arquivado em jan/2026, migrou p/ Codeberg, mas o dump da RFB segue público e o código funciona). |
| **Grátis / aberta?** | **Sim**, mas com teto. cnpj.ws público: **3 consultas/min por CNPJ** (GET). BrasilAPI: grátis, sem cadastro, mas rate-limit comunitário não garantido para volume. minha-receita self-host: **sem limite**, você roda a base. |
| **Rate limit** | É o gargalo. Para **enriquecimento pontual** (dossiê sob demanda), os gateways grátis bastam com cache agressivo. Para **volume** (cruzar todos os arrematantes/fornecedores), **baixar o dump aberto da RFB e hospedar (minha-receita/OpenCNPJ)** — é a jogada certa e elimina rate-limit. |
| **O que entrega de valor** | Razão social, nome fantasia, **sócios/QSA**, CNAEs, porte, natureza jurídica, situação cadastral, endereço, capital social. Entidade `company` já tem `cnpj`, `legalName`, `tradeName`, `cnaeCodes`. **Cola tudo:** liga arrematante de leilão ↔ empresa ↔ contrato público (PNCP) ↔ processo (DataJud). É o "tecido conjuntivo" entre módulos. |
| **Esforço** | **BAIXO** para enriquecimento sob demanda via gateway (conector trivial + cache). **MÉDIO** se for hospedar o dump da RFB (ETL do ZIP gigante + job mensal). Recomendo começar pelo gateway e migrar para o dump quando o volume justificar. |
| **Decisão** | **Ligar logo, modo "enriquecimento", não modo "módulo cheio".** O maior valor de CNPJ é *enriquecer os outros módulos*, não uma tela isolada. Já há base: a coluna `entities.cnpj` e o índice `idx_entities_cnpj` existem; há planilha `leiloes_rfb_dashboard_enriquecido_cnpja.xlsx` em `docs/research` provando que o enriquecimento por CNPJ já foi validado manualmente. |

Fontes: [cnpj.ws docs](https://docs.cnpj.ws/referencia-de-api/api-publica/consultando-cnpj) · [BrasilAPI](https://brasilapi.com.br/) · [minha-receita (cuducos)](https://github.com/cuducos/minha-receita) · [OpenCNPJ](https://opencnpj.org/) · [Catálogo Conecta gov.br — Consulta CNPJ](https://www.gov.br/conecta/catalogo/apis/consulta-cnpj)

---

### 1.3 Jurídico → CNJ DataJud (+ DOU/INLABS) ⚠️ MÉDIO, alto valor

| Item | Avaliação |
|---|---|
| **Fonte** | **CNJ DataJud — Base Nacional de Processos Judiciais.** API pública oficial, >80 milhões de processos, regida pela Resolução CNJ 331/2020 (envio obrigatório por todos os tribunais). |
| **API existe?** | **Sim, REST sobre Elasticsearch.** Base: `https://api-publica.datajud.cnj.jus.br/` + alias do tribunal (ex.: `api_publica_tjsp`, `api_publica_trf1`). Método **POST** com body de query Elasticsearch (JSON) → permite filtros, agregações, ordenação. |
| **Grátis / aberta?** | **Sim, grátis.** Auth via **API Key pública** (a chave fica publicada na própria Wiki do DataJud, header `Authorization: APIKey <chave>`). Não é segredo nem cadastro individual — é uma chave compartilhada. |
| **Rate limit** | Não publicado como número fixo; é Elasticsearch público, então paginar bem (scroll/`search_after`) e não martelar. `commercialRisk: medium` no catálogo. |
| **O que entrega de valor** | **Metadados** de processos: número CNJ, tribunal, classe, assunto, movimentações, datas. Entidade `legal_process` já tem `cnjNumber`, `court`, `subject`. **Atenção:** é metadado, não a íntegra/teor — gerenciar expectativa do cliente. Cruzar com `company` (CNPJ) vira "monitor de risco jurídico de empresa". |
| **Risco / LGPD** | É o ponto sensível: dados de processos podem ter PII; alguns correm em segredo de justiça. Tratar com cuidado de escopo, deixar claro que é fonte oficial de metadados, e respeitar segredo. |
| **Esforço** | **MÉDIO.** A query é Elasticsearch (diferente do REST simples), o volume é enorme (80M+), e precisa de estratégia de ingestão incremental (não dá pra puxar tudo). Recomendo ingerir **sob demanda por CNPJ/parte** ou por tribunal+assunto, não varredura total. Complementar: **DOU via INLABS** (XML, exige cadastro/login) para publicações/intimações. |
| **Decisão** | **Fase 2.** Alto valor para o público advogado/compliance, mas exige cuidado técnico (ES) e jurídico (LGPD). |

Fontes: [DataJud Wiki — Acesso/API Key](https://datajud-wiki.cnj.jus.br/api-publica/acesso/) · [DataJud Wiki — Endpoints](https://datajud-wiki.cnj.jus.br/api-publica/endpoints/) · [API Pública DataJud (CNJ)](https://www.cnj.jus.br/sistemas/datajud/api-publica/) · DOU: [INLABS](https://inlabs.in.gov.br/)

---

### 1.4 INPI → Marcas/Patentes ⚠️ MÉDIO/ALTO (melhorou em 2026)

| Item | Avaliação |
|---|---|
| **Fonte** | INPI — marcas, patentes, desenhos industriais. Historicamente o ponto fraco: sem API REST transacional pública, busca atrás de portal. |
| **API existe?** | **Parcialmente, e mudou recentemente.** A **RPI (Revista da Propriedade Industrial)** sai semanalmente em **XML/TXT estruturado** por seção (Marcas, Patentes, etc.) desde 2017 — essa é a porta de entrada estável. Em **fev/2026 o INPI publicou dados abertos** (Decreto 8.777/2016) em formato legível por máquina, com **downloads em XML** (padrão ST.96) para análise. Não há ainda REST de busca em tempo real oficial robusto; terceiros (Infosimples etc.) vendem isso como serviço pago. |
| **Grátis / aberta?** | **A RPI (XML) e os dados abertos são grátis.** Busca em tempo real "amigável" só via terceiros pagos ou scraping (frágil, desencorajado). |
| **Rate limit** | N/A para arquivos (você baixa o XML da RPI/dados abertos). |
| **O que entrega de valor** | Status de processo de marca, classes de Nice, conflitos/colidências, prazos (oposição, recurso). Entidade `trademark` já tem `processNumber`, `niceClasses`, `status`. **Cruzar marca ↔ titular (CNPJ)** = "vigia de marca" para quem registra. |
| **Esforço** | **MÉDIO/ALTO.** Não é REST: é **ingestão de XML da RPI** semanal + parse ST.96 + montar índice próprio de busca (aproveitar pgvector/full-text que já existem). É mais ETL do que conector. O `accessKind` no catálogo está como `public_files`, correto. |
| **Decisão** | **Fase 2/3.** Tem demanda real (advogados de PI, agências), mas o esforço de ETL XML é maior. Ligar **depois** de PNCP/CNPJ/DataJud, aproveitando que a base de busca semântica já existe. |

Fontes: [Revista RPI (XML)](https://revistas.inpi.gov.br/rpi/) · [INPI Dados Abertos](https://www.gov.br/inpi/pt-br/acesso-a-informacao/dados-abertos) · [Portal de Serviços INPI](https://www.gov.br/inpi/pt-br/projetos-estrategicos/portal-de-servicos)

---

### 1.5 Ambiental → IBAMA (autos + embargos) ✅ BAIXO p/ dados tabulares

| Item | Avaliação |
|---|---|
| **Fonte** | **IBAMA — Dados Abertos** (plataforma CKAN: `https://dadosabertos.ibama.gov.br/`). Conjuntos: **Auto de Infração**, **Termos de Embargo** (com polígonos), apreensões, suspensões. |
| **API existe?** | **CKAN (datastore/REST) + downloads diretos.** CSV de autos: `.../dados/SIFISC/auto_infracao/auto_infracao/auto_infracao_csv.zip`. Embargos têm dataset próprio com **polígonos** (geo). CKAN expõe API de datastore para consulta. |
| **Grátis / aberta?** | **Sim, totalmente aberta**, sem token. `commercialRisk: low`. |
| **O que entrega de valor** | **Autos de infração por CNPJ/CPF** (nome do infrator, valor, coordenadas), **áreas embargadas** (polígono georreferenciado). Entidade `environmental_area` já tem `areaType` (`embargo`/`deforestation`/`fire`/…) e `geometryId`; a coluna `entities.geometry` (PostGIS) e o índice GIST já existem. **Cruzar embargo ↔ CNPJ** = due diligence ESG/agro/crédito. |
| **Esforço** | **BAIXO** para a parte **tabular** (autos de infração por CNPJ — é só CSV → upsert, cruza direto com `company`). **MÉDIO** para a parte **geo** (embargos com polígono, precisa carregar geometria no PostGIS e desenhar mapa na tela). Complementares fortes já no catálogo: INPE TerraBrasilis (PRODES/DETER), INPE Queimadas (focos de fogo, atualização horária), MapBiomas Alerta. |
| **Decisão** | **Fase 2 (versão tabular) — ótimo custo/benefício.** Comece por "autos de infração + embargos por CNPJ" (texto/tabela), deixe o mapa geoespacial completo (desmatamento/fogo por polígono) para a Fase 3, quando valer investir na tela de mapa. |

Fontes: [IBAMA Dados Abertos](https://dadosabertos.ibama.gov.br/) · [Dataset Auto de Infração](https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-auto-de-infracao) · [Dataset Termos de Embargo](https://dadosabertos.ibama.gov.br/dataset/termos-de-embargo) · complementares: [INPE TerraBrasilis](https://terrabrasilis.dpi.inpe.br/) · [INPE Queimadas](https://data.inpe.br/queimadas/dados-abertos/) · [MapBiomas Alerta](https://plataforma.alerta.mapbiomas.org/)

---

### 1.6 Política → Câmara/Senado (APIs) ✅ BAIXO · TSE (arquivos) ⚠️ MÉDIO

| Item | Avaliação |
|---|---|
| **Fontes** | **Câmara dos Deputados** (REST v2, ótima), **Senado Federal** (REST), **TSE** (CKAN/arquivos de eleições), Portal da Transparência (emendas/contratos, com token). |
| **API existe?** | • **Câmara: sim, REST v2 excelente** — `https://dadosabertos.camara.leg.br/api/v2/...` (deputados, despesas/CEAP `/{id}/despesas`, proposições, votações, frentes), JSON, paginado, [Swagger](https://dadosabertos.camara.leg.br/swagger/api.html). • **Senado: sim, REST** (matérias, tramitação, votações). • **TSE: CKAN RPC + arquivos** — candidatos, bens declarados, prestação de contas/doações em **arquivos por eleição** (não API transacional). |
| **Grátis / aberta?** | **Câmara e Senado: grátis, sem auth.** TSE: grátis, mas em arquivos (download + parse). Portal da Transparência exige **token** (cadastro). |
| **Rate limit** | Câmara/Senado: não publicado como número rígido; paginar e cachear. TSE: N/A (arquivos). |
| **O que entrega de valor** | Câmara: **gasto parlamentar (CEAP) por deputado**, votações, proposições — material pronto para jornalismo/transparência. TSE: candidatos, **doações de campanha**, bens declarados. Entidade `politician` já tem `party`, `state`, `office`. Cruzar deputado ↔ doador (CNPJ) ↔ contrato (PNCP) = ouro investigativo. |
| **Esforço** | **BAIXO** para Câmara/Senado (REST limpo, igual aos outros conectores). **MÉDIO** para TSE (ingestão de arquivos grandes por eleição). |
| **Decisão** | **Fase 2/3.** Câmara/Senado são fáceis e dão uma tela rica rápido; TSE entra depois (arquivos). Público (cidadão/jornalista) tem **menor disposição a pagar B2B** que licitações/empresas — por isso valor estratégico, mas prioridade comercial menor. |

Fontes: [Câmara Dados Abertos (Swagger)](https://dadosabertos.camara.leg.br/swagger/api.html) · [Senado Dados Abertos](https://www12.senado.leg.br/dados-abertos) · [TSE Dados Abertos](https://dadosabertos.tse.jus.br/) · [TSE Candidatos 2024](https://dadosabertos.tse.jus.br/dataset/candidatos-2024) · [Portal da Transparência API](https://api.portaldatransparencia.gov.br/)

---

### 1.7 Municípios → IBGE + Siconfi + cruzamento ✅ BAIXO (referência) / ⚠️ é agregação

| Item | Avaliação |
|---|---|
| **Fontes** | **IBGE** (localidades + agregados/SIDRA), **Tesouro/Siconfi** (dados fiscais de municípios), + reuso de PNCP/Transparência/TSE filtrados por município. |
| **API existe?** | **IBGE: sim, REST grátis** — `https://servicodados.ibge.gov.br/api/` (Localidades 1.0 = malha de municípios/UF com `ibge_code`; Agregados 3.0/SIDRA = população, PIB, séries). **Siconfi: API REST** (receitas/despesas/dívida de entes). |
| **Grátis / aberta?** | **Sim, todas abertas**, sem token. |
| **O que entrega de valor** | "Raio-X do município": dados de referência (IBGE) + saúde fiscal (Siconfi) + licitações locais (PNCP) + repasses (Transferegov) + perfil político (TSE). Entidade `municipality` já tem `ibgeCode`, `state`; coluna `entities.ibge_code` + índice já existem. |
| **Esforço** | **BAIXO** para a camada de **referência IBGE** (carregar a malha municipal é trivial e já habilita filtros geográficos em TODOS os módulos). O "raio-x completo" é **MÉDIO** porque é majoritariamente **agregação/cruzamento** dos outros módulos numa tela, não uma fonte nova. |
| **Decisão** | **Carregar IBGE (referência) na Fase 1 como infra transversal** — barato e destrava filtro por município em leilões/licitações/ambiental. O **módulo "Municípios" como produto** fica para a Fase 3 (depende de já ter PNCP, empresas, política ingeridos para cruzar). |

Fontes: [IBGE API docs](https://servicodados.ibge.gov.br/api/docs/) · [IBGE Agregados/SIDRA v3](https://servicodados.ibge.gov.br/api/docs/agregados?versao=3) · [Tesouro Siconfi API](https://apidatalake.tesouro.gov.br/docs/siconfi/) · [Transferegov Dados Abertos](https://www.gov.br/transferegov/pt-br/ferramentas-gestao/dados-abertos)

---

### 1.8 Quadro-resumo de priorização (valor × esforço)

| # | Módulo | Fonte principal | API aberta? | Rate limit | Esforço | Valor B2B | **Ordem** |
|---|---|---|---|---|---|---|---|
| 1 | **Licitações** | PNCP (REST oficial) | ✅ sem auth | educado | **Baixo** | 🔥 Alto | **1º** |
| 2 | **Empresas/CNPJ** | BrasilAPI/cnpj.ws + dump RFB | ✅ (3/min grátis) | gargalo→self-host | Baixo→Médio | 🔥 Alto (cola tudo) | **2º** |
| 3 | **Ambiental** | IBAMA CKAN (autos/embargos) | ✅ sem auth | n/a | Baixo (tab.)/Médio (geo) | Alto (ESG/agro/crédito) | **3º** |
| 4 | **Jurídico** | CNJ DataJud (ES) + DOU | ✅ API Key pública | cuidar volume | **Médio** | 🔥 Alto (advogados) | 4º |
| 5 | **Política** | Câmara/Senado REST · TSE arquivos | ✅ sem auth | educado | Baixo (Câmara)/Médio (TSE) | Médio (B2C) | 5º |
| 6 | **INPI** | RPI XML + dados abertos 2026 | ✅ arquivos | n/a | **Médio/Alto** (ETL XML) | Médio (PI) | 6º |
| 7 | **Municípios** | IBGE + Siconfi + cruzamento | ✅ sem auth | n/a | Baixo (ref.)/Médio (produto) | Médio | 7º (ref. já na F1) |

**Fáceis e de alto retorno (ligar primeiro):** Licitações (PNCP), Empresas (CNPJ enriquecimento), Ambiental tabular (IBAMA por CNPJ).
**Difíceis / cuidado:** Jurídico (Elasticsearch + LGPD + completude), INPI (ETL de XML, sem REST de busca), camada geo do Ambiental (polígonos/mapas).

---

## PARTE 2 — UX pedida pelo dono

### 2.1 Botão de "modo ajuda" com tooltips em cada botão

**O que já existe e ajuda:** `apps/web/src/components/jargao-tooltip.tsx` é um popover acessível pronto (foco, `aria-describedby`, fecha no Esc/clique-fora, funciona em touch). É a base perfeita — não reinventar.

**Como fazer limpo e reusável (proposta, sem implementar):**

1. **`HelpModeContext`** (`apps/web/src/lib/help-mode.tsx`): um provider com `{ helpOn: boolean, toggle() }`, persistido em `localStorage` (mesmo padrão de `lib/onboarding.ts`). Envolve o `AppShell`.
2. **Botão de toggle no topbar** (ao lado do `ThemeToggle` em `App.tsx`): um ícone `HelpCircle` que liga/desliga o modo. Quando ligado, fica destacado (cor de marca) e o app ganha a classe `data-help="on"` no root.
3. **Componente `<HelpHint hint="…">` (wrapper)** que envolve qualquer botão/ícone:
   - Quando `helpOn` é `false`: renderiza o filho sem nada (custo zero).
   - Quando `helpOn` é `true`: mostra um balão no **hover** (desktop) e no **toque longo / primeiro toque** (mobile), reusando a mecânica do `Jargao`. Idealmente também aplica um leve outline/badge "?" nos elementos com dica, pra sinalizar "isto tem ajuda".
4. **Acessibilidade/mobile:** no mobile não há hover, então no `helpOn` o **primeiro toque mostra a dica e o segundo executa** (ou toque-e-segure). Reaproveitar `onTouchEnd` + `e.preventDefault()` já usado no `Jargao`. Respeitar `prefers-reduced-motion`.
5. **Catálogo de dicas centralizado** (`apps/web/src/data/help-hints.ts`): `Record<string, string>` com a dica por chave (ex.: `"upgrade"`, `"alertas"`, `"score-ring"`), igual ao `GLOSSARIO_TERMOS`. Mantém os textos fora do JSX e fáceis de revisar.

**Por que assim:** custo zero quando desligado, um único componente reusável, textos centralizados, reaproveita 100% da acessibilidade já testada do `Jargao`. **Esforço: Baixo (~3–5 dias).**

### 2.2 Onboarding no 1º login (mobile)

**Estado atual (bom ponto de partida):** `apps/web/src/app/onboarding/page.tsx` já é um tour de **4 passos** (objetivo → canal de alerta → "como funciona um leilão" → pronto), responsivo, com barra de progresso e persistência via `lib/onboarding.ts` (`localStorage: fonteia.onboarded`). É acionado em `App.tsx` quando `!onboarded`. **Já está acima da média.**

**Evolução proposta (sem reescrever):**

1. **Tour contextual pós-onboarding (coach marks):** o onboarding atual é uma tela cheia *antes* do app. Falta o "me mostre onde fica cada coisa" *dentro* do cockpit. Propor um **tour leve de 3–4 balões** que aponta para: (a) o radar/score, (b) o botão "Perguntar" (FAB), (c) "Alertas", (d) "Fontes". Pode ser o **mesmo `<HelpHint>`** do item 2.1 disparado em sequência na primeira visita — **reuso total**, sem lib externa.
2. **Persistir no servidor, não só no `localStorage`:** hoje `hasOnboarded()` é por-dispositivo; quem troca de celular repete o tour ou some o estado. Gravar `onboarded` e as `prefs` (goal/channel) no perfil do usuário (Supabase) — a tabela já dá suporte a metadados; usar as prefs para **personalizar o radar de verdade** (hoje são salvas mas pouco usadas).
3. **Resumível e pulável (já é):** manter "Pular" sempre visível (já está). Adicionar um jeito de **rever o tour** depois (ex.: dentro de Conta → "Refazer apresentação"), que hoje não existe.
4. **Mobile específico:** o card já tem CSS responsivo dedicado (≤560/≤460/≤360px). O ganho real no mobile é o **coach-mark** apontando o FAB "Perguntar" e a bottom-nav, que são os elementos que o usuário de celular não descobre sozinho.

**Esforço: Baixo/Médio (~1 sprint)** — a maior parte (tela de onboarding) já existe; o trabalho é o tour contextual (reusa HelpHint) + persistência no servidor.

### 2.3 "Deixar o site mais bonito" — 8 melhorias concretas de polish

Com base no que já existe (design system com tokens CSS `--brand`/`--accent`/`--glass`, componentes `ScoreRing`, `Spark`, `AreaChart`, `CountUp`, topbar com `backdrop-filter`):

1. **Skeletons no lugar de "Carregando…":** os fallbacks de `Suspense` em `App.tsx` e o carregamento de lote mostram texto cru. Trocar por **skeleton shimmer** dos cards/listas (placeholders cinza animados). É o upgrade de percepção de qualidade com maior retorno visual por menor esforço.
2. **Microinterações consistentes:** já há animações boas no FAB e drawer. Padronizar **hover/press** (leve `translateY`, sombra) em todos os botões e cards de lote, sempre com `prefers-reduced-motion`. Hoje está irregular entre telas.
3. **Empty states ilustrados:** "lote não encontrado", lista de alertas vazia, busca sem resultado — hoje são `<p class="muted">`. Dar a cada um um **ícone grande + frase + CTA** (ex.: "Nenhum alerta ainda → Criar meu primeiro alerta"). Transforma beco-sem-saída em ação.
4. **Hierarquia tipográfica + respiro:** revisar `clamp()` de títulos e o espaçamento vertical entre seções do dashboard. Mais "ar" (espaço em branco) deixa o produto premium sem mudar conteúdo.
5. **Score com semântica de cor + legenda:** o `ScoreRing`/`riscoBadge` já existem; garantir **escala de cor consistente** (verde→âmbar→vermelho) e um mini-tooltip "o que é este score" (reusa HelpHint). Score é o herói visual do produto — vale caprichar.
6. **Imagens dos lotes com tratamento:** o contrato já traz `imageUrls[]`. Padronizar **aspect-ratio fixo + object-fit + placeholder/blur no load + fallback** quando não há imagem (hoje pode quebrar layout). Grade de lotes com imagem consistente muda totalmente a percepção.
7. **Dark mode auditado:** há `ThemeToggle` e `theme-context`. Fazer uma passada conferindo **contraste de todos os tokens no escuro** (bordas, `--glass`, sombras que somem no dark). Muitos SaaS têm dark "quebrado" em detalhes — corrigir isso sinaliza cuidado.
8. **Polish mobile do app shell:** a bottom-nav e o FAB já estão ótimos; afinar **safe-area** em telas com notch, alvos de toque ≥44px em todos os ícones do topbar, e garantir que nada fique atrás da bottom-nav (já tratado, revalidar). Bônus: um leve **haptic/press feedback** visual nos itens da bottom-nav.

**Esforço total do polish: Médio (~1–2 sprints)**, mas itens 1, 3 e 6 sozinhos já dão o maior salto percebido e podem ir primeiro.

---

## PARTE 3 — Plano faseado e priorizado

### Fase 1 — "Dá pra executar JÁ, sem depender de chave" (próximas ~3–5 semanas)

Tudo aqui usa **fontes abertas sem auth** + reuso direto do padrão da Receita. Zero bloqueio externo.

| Item | Depende de chave? | Esforço |
|---|---|---|
| **Módulo Licitações (PNCP)** — conector + edge function + RPC `ingest_pncp` (kind `bidding_opportunity`) + tela de editais abertos por UF | ❌ Não | Baixo |
| **Camada de referência IBGE** (malha de municípios → habilita filtro geográfico em todos os módulos) | ❌ Não | Baixo |
| **Modo Ajuda + HelpHint** (item 2.1) reusando o `Jargao` | ❌ Não | Baixo |
| **Polish visual rápido**: skeletons, empty states, imagens de lote (itens 2.3 #1/#3/#6) | ❌ Não | Baixo/Médio |
| **Enriquecimento CNPJ sob demanda** (BrasilAPI/cnpj.ws + cache) ligado ao detalhe do arrematante | ❌ Não (grátis, com cache p/ não bater no 3/min) | Baixo |

**Resultado da Fase 1:** sai de 1 para **2 módulos vendáveis** (Leilões + Licitações), com CNPJ enriquecendo ambos, filtro por município, e um app visivelmente mais polido e auto-explicativo. **Nenhuma credencial externa necessária.**

### Fase 2 — "Precisa de chave/auth ou ETL maior" (~6–10 semanas)

| Item | Depende de | Esforço |
|---|---|---|
| **Módulo Ambiental (IBAMA tabular)** — autos de infração + embargos **por CNPJ** (sem mapa ainda) | Nada (CKAN aberto) | Baixo/Médio |
| **Módulo Empresas "cheio"** — hospedar dump da RFB (minha-receita/OpenCNPJ) p/ tirar o gargalo de rate-limit e ter tela própria de dossiê | Self-host do dump (sem chave de 3º) | Médio |
| **Módulo Jurídico (DataJud)** — conector Elasticsearch + ingestão **sob demanda por parte/CNPJ** + tela de processos | **API Key pública** do CNJ (publicada na Wiki) + cuidado LGPD | Médio |
| **Módulo Política (Câmara/Senado)** — conector REST + tela de gasto parlamentar/votações | Nada (aberto) | Baixo (Câmara) |
| **Onboarding evoluído** — tour contextual (coach marks) + persistência no servidor (item 2.2) | Nada | Baixo/Médio |
| **DOU/INLABS** (complemento jurídico) | **Cadastro/login** no INLABS | Médio |
| **Portal da Transparência** (sanções, despesas — reforça Empresas/Política) | **Token** (cadastro CGU) | Médio |

### Fase 3 — "Difícil / agregação / geo pesado" (depois)

| Item | Por que fica por último |
|---|---|
| **Ambiental geoespacial** (desmatamento/fogo por polígono, mapa) — INPE TerraBrasilis/Queimadas, MapBiomas | Precisa de tela de mapa + carga PostGIS pesada |
| **Módulo INPI** (RPI XML + dados abertos 2026 + índice de busca de marcas) | ETL de XML ST.96, sem REST de busca pronto |
| **Módulo Municípios como produto** ("raio-x" completo) | É agregação dos módulos anteriores — só faz sentido depois deles ingeridos |
| **Módulo API** (vender os dados normalizados via API/webhooks) | Monetização adicional; depende de ter vários módulos com dados |
| **TSE (arquivos por eleição)** | Ingestão de arquivos grandes; valor mais B2C |

---

## Resumo executivo (recomendação de por onde começar)

A boa notícia técnica: **a arquitetura já está pronta para escalar.** A tabela `entities` é genérica (kind + JSONB + geometry + embedding), os `ENTITY_KINDS` e os 9 módulos já estão tipados e cadastrados, e o `SOURCE_CATALOG` já mapeia cada módulo às fontes reais. Ligar um módulo não é construir infra nova — é copiar o padrão conector → edge function → RPC de upsert → tela, trocando o `kind`. O custo real é a tela e a curadoria de valor, não o encanamento.

Por isso a recomendação é direta: **comece pelo módulo de Licitações (PNCP)**. É a maior fonte de valor B2B (empresas que vendem para governo pagam) pelo menor esforço — a API é REST oficial, aberta, sem auth, estável, e o conector é quase um clone do da Receita. Em paralelo, ligue o **enriquecimento por CNPJ** (BrasilAPI/cnpj.ws grátis, com cache para respeitar 3 req/min), porque CNPJ é o tecido que costura todos os módulos entre si — e isso já foi validado manualmente nas planilhas em `docs/research`. Junto, entregue **Ambiental tabular (IBAMA por CNPJ)** logo depois, que também é aberto e de baixo esforço, abrindo o público ESG/agro/crédito.

Deixe para a Fase 2 o **Jurídico (DataJud)** — alto valor, mas exige query Elasticsearch, controle de volume (80M+ processos) e cuidado com LGPD/segredo de justiça — e o **INPI** para a Fase 3, porque é ETL de XML da RPI sem REST de busca pronto. A camada **IBGE** vale carregar já na Fase 1 como infra transversal barata, pois destrava filtro geográfico em todos os módulos.

No produto, três frentes de baixo custo e alto retorno: (1) o **modo ajuda com tooltips** reaproveitando o componente `Jargao` que já existe e é acessível; (2) **evoluir o onboarding** (que já é bom) com um tour contextual dentro do app e persistência no servidor; e (3) **polish visual** priorizando skeletons, empty states com CTA e tratamento das imagens de lote, que dão o maior salto de percepção de qualidade.

Tudo da Fase 1 — Licitações, IBGE, enriquecimento CNPJ, modo ajuda e o polish — **executa sem depender de nenhuma chave externa**. Comece por aí.
