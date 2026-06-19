# Fonte.ia — Relatório de Inovação e Benchmark 2026

> Produzido em junho/2026 com pesquisa web ativa. Fontes citadas inline.
> Escopo: benchmark competitivo + ideias priorizadas + stack recomendada + quick wins vs apostas.

---

## 1. Benchmark Competitivo

### 1.1 Jogadores brasileiros

#### Jusbrasil
O maior player jurídico do Brasil consolidou em 2025 a fusão entre pesquisa processual e IA generativa com o **JusIA** — assistente que raciocina em linguagem jurídica, integra jurisprudência, gera peças e analisa múltiplos documentos com memória de sessão. Em abril/2026 expandiu o JusIA para todos os planos pagos sem custo adicional; o plano Premium (topo) inclui produção ilimitada de peças, raciocínio profundo e insights processuais proativos. Preço inicial: R$ 1,90 no 1º mês — posicionamento agressivo de volume.

**O que a Fonte.ia pode aprender:** JusIA não fabrica; quando falta dado, declara explicitamente. É exatamente o princípio de rastreabilidade que já é nosso. A diferença: Jusbrasil está no jurídico puro; nós cruzamos jurídico + financeiro + político + ambiental no mesmo grafo.

**Nossa diferenciação:** "Raio-X de empresa" que começa no CNPJ, sobe para sócios (QSA), olha os processos CNJ, as licitações PNCP, as marcas INPI e os contratos com o governo — tudo rastreável. Jusbrasil não faz isso.

Fonte: [Jusbrasil PRO](https://www.jusbrasil.com.br/pro) · [JusIA planos](https://ia.jusbrasil.com.br/planos)

---

#### Escavador
Plataforma de pesquisa jurídica com 500M+ processos e cobertura de 440 tribunais + 175 Diários Oficiais. Produto estrela: o **EscavAI** — IA que resume histórico processual, status atual e próximos passos de um processo ou parte. Oferece Painel de Monitoramento e Legal API empresarial. Crescimento declarado de 50% ao ano. Preço inicial: R$ 9,90/mês com API a partir de R$ 29,90.

**O que a Fonte.ia pode aprender:** A API do Escavador é explicitamente vendida como infra para background check, compliance e due diligence B2B — não apenas para advogados. É o nosso mercado direto. O Escavador, porém, monitora somente o passado processual; não conecta ao presente comercial (licitações ativas, marcas vigentes, infrações IBAMA).

**Nossa diferenciação:** temporal. Escavador olha o passado judicial. Nós olhamos o presente operacional (licitação ativa, edital aberto, marca em uso, sanção vigente). Combinados, completamos o dossiê.

Fonte: [Escavador Business](https://www.escavador.com/business) · [EscavAI API](https://www.escavador.com/business/api) · [Startups.com.br](https://startups.com.br/alem-da-faria-lima/time-diverso-e-ia-sao-as-armas-do-escavador-para-crescer-50-ao-ano/)

---

#### Neoway (LWSA)
Maior empresa de Data Analytics da América Latina com 40M+ empresas e 200M+ pessoas no banco. Foco em B2B2C: marketing intelligence, prospecção, compliance e prevenção de fraude. Produtos: enriquecimento de CRM via API, segmentação por comportamento (online + offline), validação biométrica.

**O que a Fonte.ia pode aprender:** Neoway vende "capacidade de investimento" e "risco de inadimplência" estimados — são KPIs sintéticos calculados sobre os dados públicos + privados. A Fonte.ia pode derivar KPIs similares 100% de dados públicos: nível de atividade CNPJ, volume de contratos ganhos, histórico de sanções, status tributário.

**Onde perdemos:** Neoway tem dados privados (score de crédito, comportamento de compra) que nunca teremos. Nossa aposta: a camada pública é suficiente para o caso de uso B2B (advogado, jornalista, comprador de leilão); não tentamos competir em CRM ou marketing automation.

Fonte: [Neoway B2B Intelligence](https://www.neoway.com.br/en/solutions/b2b-intelligence) · [GetApp](https://www.getapp.com/business-intelligence-analytics-software/a/neoway/)

---

#### Cortex Intelligence
Especialista em Go-to-Market intelligence B2B para América Latina (Brasil, México, Argentina). Produto: identificação de ICP, prospecção com dados de intenção, enriquecimento de CRM. Posicionamento: "inteligência de vendas", não compliance ou due diligence.

**O que a Fonte.ia pode aprender:** Cortex capturou dados de múltiplas fontes públicas e privadas e os transformou em "score de propensão de compra" — abstração que o comprador entende imediatamente. Nós podemos fazer o mesmo para licitações: "score de chance de ganhar" baseado em histórico de fornecimento, sanções e porte.

Fonte: [Cortex Intelligence](https://www.cortex-intelligence.com/en/b2b-sales-intelligence)

---

#### JOTA
Portal de inteligência institucional para quem atua onde o Estado regula. Produto estrela: análise de risco regulatório — interpretação de decisões do STF/STJ com impacto para os negócios. Projeto "Siga o Dinheiro" (parceria com Base dos Dados) monitorou despesas eleitorais 2022 com dados abertos. Público: grandes empresas, escritórios de advocacia e lobbistas.

**O que a Fonte.ia pode aprender:** JOTA transforma texto jurídico árido em "o que isso significa para o seu negócio" — é a camada de interpretação que monetiza dado público. A diferença: JOTA é editorial (jornalismo); nós somos infraestrutura (dados + grafo + IA sob demanda).

**Sinergia possível:** A Fonte.ia poderia ser a fonte de dados que alimenta análises tipo JOTA para qualquer usuário, não apenas grandes empresas com plano Enterprise.

Fonte: [JOTA Quem Somos](https://portal.jota.info/quem-somos) · [Base dos Dados + JOTA](https://basedosdados.org/case-studies/jota)

---

### 1.2 Jogadores globais relevantes

#### Sayari Graph (EUA)
Plataforma de risco comercial com 500M+ empresas resolvidas, 11.7B registros primários, 1.8B registros de comércio exterior, cobertura de 250+ jurisdições. Diferencial: mapeamento de beneficiários finais (UBO) automatizado através de estruturas com 20+ shells em 15 países; cada conexão tem citação da fonte primária — legalmente defensável. Integrou LLM em 2025 para queries em linguagem natural ("mostre todos os fornecedores no Xinjiang ligados aos meus parceiros Tier 3"). ARR superou US$ 100M no início de 2026.

**Por que importa para a Fonte.ia:** O design de rastreabilidade deles (cada aresta do grafo tem fonte + data + jurisdição) é idêntico ao nosso princípio de `evidence`. A diferença de escala (250 países vs Brasil) é a nossa vantagem: profundidade nacional vs superfície global.

**Feature que deveríamos copiar:** "Automated traversal" — o usuário informa o CNPJ e o sistema percorre automaticamente o grafo de sócios até encontrar o beneficiário final pessoa física. Isso é buildável com o Cérebro já existente.

Fonte: [Sayari Graph](https://sayari.com/platform/graph/) · [Sayari 2025 Mid-Year](https://sayari.com/resources/blg-2025-mid-year-recap-products-keep-pace-with-change/)

---

#### OpenCorporates
Maior banco de dados aberto de empresas: 220M+ registros em 140+ jurisdições. Totalmente open data para projetos não-comerciais. Pontos fracos: sem UBO, sem dados financeiros, sem scoring de risco, sem sanções. Planos comerciais a partir de GBP 2.250/ano (Essentials) até GBP 12.000/ano (Basic).

**Por que importa:** OpenCorporates prova que "dado corporativo público + interface limpa" tem valor comercial mesmo sem IA. Nós temos dados mais ricos (processos, licitações, sanções, políticos) e não dependemos de dezenas de jurisdições — apenas o Brasil, mas com profundidade que eles não têm.

Fonte: [OpenCorporates API](https://blog.opencorporates.com/2025/02/13/getting-started-with-the-opencorporates-api/) · [Zephira pricing guide](https://zephira.ai/opencorporates-pricing-explained-2026-plans-api-limits-licensing-and-what-it-means-in-production/)

---

#### Palantir AIP
Plataforma de IA operacional para governo e enterprise. Diferencial: "Ontology" — réplica digital da organização com objetos, links e ações representando o mundo real. Contratos governamentais de US$ 1B+ em 2026. Crescimento de 63% YoY no Q3/2025.

**Lição para a Fonte.ia:** A Ontology da Palantir é essencialmente o que o Cérebro deveria se tornar — não um grafo de visualização, mas um grafo de ação: "dado que empresa X ganhou Y contratos com o órgão Z, e tem sócio W com processo ativo, o risco de due diligence é..." A diferença: Palantir vende para governos; nós vendemos para PMEs que querem enxergar o estado como a Palantir vê.

Fonte: [Palantir AIP](https://www.kavout.com/market-lens/is-palantir-s-ai-platform-now-indispensable-for-government-and-enterprise)

---

#### Zavia.ai / The KYB (alternativas ao Sayari)
Zavia.ai: UBO discovery automatizado, conectado a 100+ países via registros governamentais, com monitoramento contínuo. Preço: US$ 99/mês — contra o mínimo de £94.815/ano do Sayari. The KYB: pipeline KYB automatizado, 250+ jurisdições, monitoramento em tempo real.

**Lição:** Existe mercado para "Sayari acessível" — UBO discovery sem preço enterprise. A Fonte.ia pode ocupar o nicho "Sayari do Brasil" com preço de startups: R$ 197–597/mês vs £7.900/mês do Sayari.

Fonte: [Zavia.ai Sayari alternatives 2026](https://zavia.ai/top-sayari-alternatives-in-2026-best-platforms-for-ubo-discovery-kyb-risk-intelligence/)

---

### 1.3 Mercado adjacente: alertas de licitações

Já existe um mercado fragmentado no Brasil: LicitaGov, Alerta Licitação, Licita Já, Siga Pregão, Oportunidados — todos vendem alertas de editais por e-mail/WhatsApp. O PNCP tornou-se obrigatório desde 2024, unificando a fonte. Esses players **não cruzam licitações com o Cérebro** (histórico de contratos do fornecedor, sanções, porte, distância geográfica). Essa é a lacuna.

Fonte: [LicitaGov](https://licitagov.org/) · [ConLicitação](https://conlicitacao.com.br/conheca-as-principais-ferramentas-de-alerta-de-licitacao/)

---

## 2. Ideias de Features Inovadoras

Cada feature inclui: job-to-be-done, dados já disponíveis, esboço técnico e potencial de receita. Priorizadas por impacto × esforço.

---

### F1. Dossiê Empresarial Automatizado (PRIORIDADE MÁXIMA)
**Impacto: 9 | Esforço: 5**

**Job:** "Preciso saber com quem estou fazendo negócio (ou processando, ou arrematando) antes de assinar qualquer coisa."

**Dados disponíveis já:** CNPJ (razão social, sócios/QSA, natureza jurídica, situação, CNAE, endereço), processos CNJ (partes, natureza, valor, tribunal), licitações PNCP (contratos ganhos, órgãos contratantes, valores), marcas INPI, sanções (CEIS, CNEP, transparência), políticos vinculados via QSA (Câmara), infrações IBAMA por CNPJ.

**Ideia concreta:** Um usuário cola um CNPJ (ou nome de empresa) e a Fonte.ia gera em segundos um **Dossiê Empresarial** com:
- Identidade confirmada (Receita Federal, fonte oficial, data + hash)
- Sócios e estrutura societária com travessias automáticas (sócio tem CNPJ? exploda recursivamente até PF)
- Processos agrupados por natureza (trabalhista, fiscal, consumidor, criminal) com valor total em risco
- Contratos públicos ganhos (volume R$, órgãos, histórico de adimplência declarado)
- Sanções ativas (CEIS/CNEP) com link para fonte oficial
- Marcas registradas INPI vigentes
- Score sintético de risco (0–100) com breakdown rastreável por dimensão

**Esboço técnico:**
1. Endpoint `GET /api/dossie?cnpj=XX` em Supabase Edge Function `fonteia`
2. Consulta paralela ao D1 Bridge: empresas + licitacoes + politicos + sancoes + marcas + jurídico
3. Travessia do Cérebro via API existente (cerebro-api.ts): CNPJ → sócios → CNPJs dos sócios → processos cruzados
4. Prompt Claude Haiku estruturado (tool_use + JSON schema) para síntese narrativa + score
5. Output: JSON rastreável + PDF client-side (jsPDF ou react-pdf, sem servidor)
6. Cache R2 por CNPJ (TTL 24h) para não re-buscar o mesmo dossiê a cada requisição

**Potencial:** Feature âncora do plano Corporativo R$ 597. Pode ser vendida à parte para advogados e despachantes como "pacote avulso" (R$ 29,90/dossiê).

---

### F2. Travessia Automática de Beneficiários Finais (UBO Brasileiro)
**Impacto: 9 | Esforço: 6**

**Job:** "Preciso saber quem REALMENTE controla essa empresa — não o sócio intermediário, a holding."

**Dados disponíveis:** QSA do CNPJ.ws já nos dá sócios; sócios PJ têm seus próprios CNPJs no banco; sócios PF aparecem em processos CNJ e vínculos políticos.

**Ideia concreta:** O usuário informa um CNPJ e o sistema traça automaticamente a cadeia societária até encontrar apenas pessoas físicas, com profundidade configurável (2–5 níveis). Resultado: grafo visual no Cérebro com evidência em cada aresta (data QSA + hash). Alerta se algum sócio tem sanção ou processo relevante.

**Esboço técnico:** BFS recursivo no Cérebro usando a aresta `QSA` já mapeada. Limite de depth + detecção de ciclos (holdings circulares existem no Brasil). Visualização no canvas force-graph já existente com highlight de "PF final" vs "holding intermediária". Esforço real: a lógica de travessia, o rate-limit do CNPJ.ws para CNPJs não cacheados, e o UI de depth selector.

**Diferenciador direto:** Sayari faz isso para 250 países mas custa £94k/ano. A Fonte.ia faz para o Brasil por R$ 597/mês.

---

### F3. Monitor de Risco Ativo (Watchdog)
**Impacto: 8 | Esforço: 4**

**Job:** "Quero ser avisado quando algo muda nas empresas que monitoro — novo processo, novo contrato, nova sanção."

**Dados disponíveis:** Todos os módulos já têm data de ingestão. Um simples `WHERE updated_at > last_check` na query já captura mudanças.

**Ideia concreta:** Usuário salva uma lista de CNPJs (ou nomes, ou CPFs de políticos) para monitoramento. Um Cron Supabase roda diariamente e compara o estado atual com o estado cacheado. Qualquer delta (novo processo, sanção, contrato, mudança de situação cadastral) dispara alerta por e-mail via Resend com link direto para o detalhe na plataforma.

**Esboço técnico:**
1. Tabela `watchlist` no Supabase Postgres com RLS por user_id
2. Cron Edge Function `monitor-watchlist` (diária): para cada CNPJ monitorado, busca estado atual no D1 + compara com snapshot anterior armazenado em KV (Cloudflare KV com chave `watch:{cnpj}:{user_id}`)
3. Se delta > 0: grava notificação em tabela `notifications` + dispara Resend via webhook
4. Frontend: página "Meu Radar" listando todos os monitorados + histórico de alertas

**Monetização:** Free = monitora até 3 entidades; Pro = 20; Corporativo = ilimitado + WhatsApp.

---

### F4. "Siga o Dinheiro" — Mapa de Influência Governo-Empresa
**Impacto: 8 | Esforço: 5**

**Job:** "Quero entender se este político favorece esta empresa ou setor nas suas votações e contratos."

**Dados disponíveis:** Câmara (deputados + despesas CEAP + votações), licitações/contratos PNCP, CNPJ (fornecedores), já conectados no Cérebro via "deputado↔fornecedor".

**Ideia concreta:** Dada uma empresa (CNPJ) ou um político (CPF/nome), mostrar:
- Empresas que receberam contratos do governo no mesmo período em que o político votou a favor de projetos que as beneficiaram
- Volume de contratos por partido (quem contrata de quem)
- Grafo interativo no Cérebro: nó empresa → arestas de contratos → nós de órgãos públicos → votações relacionadas → nós de políticos

**Esboço técnico:** No Cérebro, já existe a aresta `CEAP_FORNECEDOR` (deputado → empresa que recebeu gasto de gabinete). Expandir para `CONTRATO_EMPRESA` (órgão → empresa com valor) e `VOTACAO_PROPOSICAO` (deputado → proposta). A UI de "Siga o Dinheiro" filtra e destaca estas conexões. A IA (Claude Haiku) pode narrar o padrão encontrado com fontes.

**Diferenciador:** JOTA faz isso editorialmente para casos selecionados. A Fonte.ia faz sob demanda, para qualquer entidade, com fontes abertas.

---

### F5. Análise de Edital com IA (Leilões + Licitações)
**Impacto: 8 | Esforço: 4**

**Job:** "Tenho um edital de 80 páginas. Quero saber: posso participar? Quais os riscos? O que fazer antes do prazo?"

**Dados disponíveis:** Edge Function `fonteia` já tem a feature `edital` implementada (conforme CLAUDE.md). A base de lotes de leilão já tem links para PDFs oficiais.

**Ideia concreta:** Usuário faz upload de um edital (ou cola o URL do DOU/PNCP) e recebe em < 30s:
1. Checklist de elegibilidade (PF/PJ, certidões exigidas, capacidade técnica mínima)
2. Pontos de atenção jurídicos (cláusulas incomuns, prazos críticos, penalidades)
3. Estimativa de custo de participação (caução exigida, custos de visita, prazo de pagamento)
4. Para leilões: score de risco do bem (ocupado? débitos? matrícula disponível?)
5. Tudo com citação de parágrafo do edital (não alucina — cita ou silencia)

**Esboço técnico:**
- PDF upload → R2 → extração de texto via Cloudflare Workers AI (modelo `@cf/openai/whisper` para áudio; para PDF usar pdf-parse em Worker) ou Supabase Edge Function com pdf-lib
- Chunking + embedding no pgvector existente (768d Gemini)
- Prompt Claude Sonnet com tool_use para extração estruturada (checklist JSON) + narrativa
- Output renderizado com links internos para os trechos do edital

**Monetização:** Feature Pro+Corporativo. Pode cobrar créditos por análise (modelo híbrido).

---

### F6. GraphRAG sobre o Cérebro Governamental
**Impacto: 9 | Esforço: 7**

**Job:** "Tenho uma pergunta complexa que atravessa múltiplas fontes: 'Quais empreiteiras de Minas Gerais ganharam mais contratos federais após 2022 e têm processos trabalhistas em andamento?'"

**Por que vector RAG puro falha aqui:** Essa pergunta requer multi-hop (empresa → contratos → órgão → estado × processos → natureza), não busca semântica de um chunk.

**Ideia concreta:** Implementar GraphRAG sobre o Cérebro: o sistema converte a pergunta em linguagem natural em uma série de traversals no grafo + queries SQL, coleta os contextos relevantes, e usa Claude para sintetizar a resposta com citação de nó/aresta.

**Esboço técnico:**
1. Microsoft GraphRAG (open-source MIT, disponível em PyPI) é pesado demais para o stack Cloudflare/Supabase. Alternativa leve: **LightRAG** (Python, MIT, HKU) ou implementação própria simples.
2. Na prática, o MVP não precisa de GraphRAG completo: o Cérebro já tem o grafo; falta um "query planner" que decompõe a pergunta em passos (1. busca empresa por estado, 2. filtra por contratos, 3. cruza com processos).
3. Implementação: Claude com tool_use onde as ferramentas são `query_cerebro(type, filters)`, `traverse(node_id, edge_type, depth)`, `aggregate(nodes[], metric)`. O LLM decide a sequência de chamadas.
4. Resultado: resposta com grafo de evidências renderizado no Cérebro.

**Dependência:** Requer que o D1 Bridge exponha queries de travessia eficientes. Hoje o d1-bridge serve bulk; precisaria de endpoints de grafo focados.

Fonte: [Microsoft GraphRAG](https://www.microsoft.com/en-us/research/project/graphrag/) · [LightRAG](https://medium.com/@claudiubranzan/from-llms-to-knowledge-graphs-building-production-ready-graph-systems-in-2025-2b4aff1ec99a)

---

### F7. Busca por Linguagem Natural no D1 (FTS5 + Semântica)
**Impacto: 7 | Esforço: 3**

**Job:** "Quero achar lotes de leilão (ou licitações, ou empresas) descrevendo o que procuro em português, não preenchendo 5 filtros."

**Técnica:** O Cloudflare D1 suporta FTS5 nativamente (SQLite Full Text Search) — virtualmente sem custo. Para as 217k entidades, um índice FTS5 em D1 já resolve 80% dos casos de busca sem embeddings. Para os 20% mais semânticos (sinônimos, contexto), o pgvector 768d do Supabase cobre.

**Ideia concreta:** Barra de busca unificada: "caminhonete leilão SP 2024" → query FTS5 no D1 Bridge; se poucos resultados, fallback para pgvector; resultado integrado com ranking RRF (Reciprocal Rank Fusion).

**Esboço técnico:**
- D1: `CREATE VIRTUAL TABLE entities_fts USING fts5(title, description, cnpj, municipio, ...)`
- D1 Bridge Worker: endpoint `/search?q=&mode=hybrid` — primeiro FTS5, depois RRF com scores de pgvector
- Supabase: função `match_entities` já existe (pgvector); adicionar score FTS5 como sinal extra no reranking

Fonte: [Cloudflare D1 FTS5](https://www.threads.com/@gagansuie/post/DFTomkxPgN3) · [Supabase Hybrid Search](https://supabase.com/docs/guides/ai/hybrid-search)

---

### F8. Score de Oportunidade para Licitações (para fornecedores)
**Impacto: 7 | Esforço: 4**

**Job:** "Sou uma empresa e quero saber quais editais abertos eu tenho chance real de ganhar, não só os que casam com meu CNAE."

**Dados disponíveis:** PNCP (editais abertos, órgão, objeto, valor estimado, exigências), histórico de contratos do usuário (se fornecido), histórico de contratos de concorrentes por CNAE + UF.

**Ideia concreta:** O usuário cadastra o CNPJ da empresa. A plataforma busca editais abertos no PNCP que casam com o CNAE e UF, e para cada um calcula um "Score de Fit": similaridade do objeto com o histórico de contratos ganhos, distância geográfica, valor vs capacidade declarada, ausência de sanções, tempo hábil restante.

**Esboço técnico:** Edge Function + query D1 + heurísticas parametrizadas + Claude Haiku para narrativa do score. O diferencial é a **personalização por CNPJ cadastrado**: o sistema aprende o perfil do fornecedor e melhora os matches ao longo do tempo.

---

### F9. Relatório de Contexto para Compradores de Leilão (Imóveis)
**Impacto: 7 | Esforço: 5**

**Job:** "Quero arrematar este imóvel da Receita Federal. Me diga tudo que preciso saber antes de dar um lance."

**Dados disponíveis:** Leilões da Receita já no banco; cruzamento com CNPJ/CPF do antigo proprietário (processos CNJ, sanções, débitos declarados no edital); município/IBGE para contexto de valorização.

**Ideia concreta:** Página de detalhe do lote com seção "Due Diligence Rápida":
- Histórico processual do bem (ação de origem do leilão, outras penhoras conhecidas)
- Situação do município (IBGE: IDH, população, crescimento, infraestrutura)
- Valor de mercado estimado (avaliação oficial do edital vs média de UF, via dados IBGE)
- Checklist do comprador (certidão de ônus reais, IPTU, ocupação, prazo para retirada)
- Riscos declarados do edital (com citação + hash)

**Nota:** Este feature usa dados que JÁ TEMOS. O trabalho é de UX (montar a página) mais do que de ingestão.

---

### F10. API Pública para Desenvolvedores (Plano Data API)
**Impacto: 6 | Esforço: 5**

**Job:** "Quero integrar dados da Fonte.ia no meu sistema — CRM, plataforma jurídica própria, sistema de compliance."

**Dados disponíveis:** Todo o banco D1 + Supabase já estruturado.

**Ideia concreta:** Plano "Data API" (R$ 1.200–2.400/mês ou por volume) que expõe endpoints REST para: enriquecimento de CNPJ, consulta de processos por CPF/CNPJ, histórico de contratos públicos, sanções, marcas, score de risco. Limite por minuto + chave de API por tenant.

**Por que agora:** Escavador já vende isso e cobrava R$ 29,90+/mês só pelo endpoint de processos. Nós temos mais camadas de dados. A API pode gerar receita recorrente de clientes que não usam o frontend.

**Esboço técnico:** Gateway de API via Cloudflare Workers com rate limiting nativo (CF Rate Limiting), chave de API por tenant gravada no KV, billing por consumo via Stripe metered usage (já disponível).

Fonte: [Stripe Usage-Based Billing](https://stripe.com/billing/usage-based-billing)

---

## 3. Stack Técnica Recomendada

### 3.1 IA e LLM

#### Claude Haiku 3.5 (Anthropic) — JÁ EM USO
Para síntese de dossiês, scoring narrativo, análise de edital. Custo mais baixo do trio Haiku/Sonnet/Opus. Com `tool_use` + JSON schema, garante output estruturado sem alucinações nos campos rastreáveis. Licença: API comercial. Risco de integração: baixo (já integrado).

#### Gemini Embedding 2 (Google) — JÁ EM USO (768d)
Custo: US$ 0,20 por 1M tokens. 768 dimensões é o sweet spot: 4× menos armazenamento e 4× mais rápido em similarity search do que 3.072d, com qualidade similar. Licença: API comercial. Não migrar — está funcionando e é custo-eficiente.

Fonte: [Gemini Embedding 2 pricing](https://tokencost.app/blog/gemini-embedding-2-pricing)

#### Cloudflare Workers AI — RECOMENDADO PARA CASOS ESPECÍFICOS
Custo: US$ 0,30/1M tokens para Llama 3.1 8B e Mistral 7B; free tier de 10k req/dia. Útil para classificação de categorias, extração simples de entidades, pré-processamento de texto antes de chamar Claude. Não substituir Claude para síntese complexa — a qualidade não é comparável. Risco: custo de egress (US$ 0,09/GB) pode superar custo de inferência em volume. Licença: comercial paga.

Fonte: [Cloudflare Workers AI 2026](https://markaicode.com/pricing/cloudflare-workers-pricing-breakdown/)

---

### 3.2 Busca e Indexação

#### Cloudflare D1 FTS5 — RECOMENDADO (quick win)
Nativo no SQLite/D1, sem custo adicional, sem serviço externo. Suporta queries de proximidade, ranking BM25, tokenização UTF-8. Para 217k registros é suficiente sem índice separado. Criar uma virtual table FTS5 no D1 é a maior alavancagem de busca com menor esforço no stack atual.

Implementação: `CREATE VIRTUAL TABLE entities_fts USING fts5(title, description, cnpj, municipio, content=entities, content_rowid=rowid)` + trigger de sincronização.

#### Hybrid Search (FTS5 + pgvector) com RRF — RECOMENDADO
O Supabase já documenta hybrid search com Reciprocal Rank Fusion — combina BM25 (keyword) + cosine similarity (semântico) para melhor recall. A função `match_entities` existente pode ser estendida com o sinal FTS5 do D1. Sem custo adicional de infra.

Fonte: [Supabase Hybrid Search](https://supabase.com/docs/guides/ai/hybrid-search)

---

### 3.3 GraphRAG e Grafo

#### LightRAG (HKU) — RECOMENDADO PARA EXPLORAÇÃO
Open-source MIT, dual-level retrieval (grafo + texto). Mais leve que Microsoft GraphRAG para corpora menores. Porém: requer Python runtime — incompatível direto com Deno/Edge Functions. Alternativa: rodar LightRAG em um serviço Python separado (Cloud Run ou Supabase Edge Function com Python quando disponível) e expor como API interna.

**Avaliação honesta:** Para o MVP de GraphRAG, implementação própria com Claude tool_use (ferramentas que fazem queries no D1 e no Cérebro) é mais rápida e não requer infra Python. Reserve LightRAG para quando o volume de queries justificar.

Fonte: [GraphRAG 2026 Buyer's Guide](https://medium.com/@tongbing00/graphrag-in-2026-a-practical-buyers-guide-to-knowledge-graph-augmented-rag-43e5e72d522d)

---

### 3.4 Alertas e Eventos

#### Supabase Database Webhooks + Resend — RECOMENDADO (já disponível)
Supabase Database Webhooks disparam on INSERT/UPDATE/DELETE e chamam uma Edge Function via `pg_net`. Resend tem free tier de 3.000 e-mails/mês e API simples. Para o Monitor de Risco (F3), a combinação é: trigger no Postgres → webhook → Edge Function `notify` → Resend. Custo zero no free tier.

**Limitação real:** `pg_net` é at-most-once (sem garantia de entrega se o endpoint estiver fora). Para alertas críticos, adicionar uma tabela `notification_queue` com processamento idempotente.

Fonte: [Supabase CDC Options](https://www.stacksync.com/blog/supabase-cdc-options-triggers-webhooks-realtime-compared)

#### WhatsApp Business API (Meta) — APOSTAR NO Q3
Para o futuro: alertas de licitações e leilões por WhatsApp são o padrão do mercado brasileiro (LicitaGov e concorrentes já oferecem). O custo por mensagem conversa do Meta é ~US$ 0,006 (BR, marketing) a ~US$ 0,03 (service). Integração via API oficial + webhook validado — não via serviços cinzas que violam os ToS.

---

### 3.5 PDF e Documentos

#### react-pdf + pdf-lib — RECOMENDADO
Para dossiês exportáveis em PDF, ambas as bibliotecas rodam client-side (sem servidor, sem custo de compute). react-pdf renderiza JSX como PDF; pdf-lib permite manipulação programática. Licença: MIT. Risco: formatação complexa requer testes em dispositivos; fontes customizadas aumentam o bundle.

Para extração de PDF de editais: `pdf-parse` (Node/Deno) + chunking manual. O modelo Cloudflare Workers AI pode ajudar na extração inicial (mais barato que Claude para parsing bruto). Claude entra apenas na síntese final.

---

### 3.6 Monitoramento e Observabilidade

#### Sentry (free tier) — RECOMENDADO
Free tier: 5k erros/mês, performance tracing, session replay. Integra com Vite/React em 2 linhas. Para uma plataforma com clientes pagantes, ter rastreamento de erros é não-negociável.

#### Cloudflare Analytics (nativo) — JÁ DISPONÍVEL
Workers Analytics Engine (gratuito no plano pago do CF) para métricas custom: queries/usuário, latência do D1 Bridge, hits de cache. Sem código extra significativo.

---

### 3.7 Pagamentos e Billing

#### Stripe metered usage — RECOMENDADO PARA API B2B
O plano atual usa Stripe com assinaturas fixas (R$ 197 / R$ 597). Para a API B2B (F10), adicionar **Usage-Based Billing** via Stripe Meters — o SDK registra events de uso (1 evento = 1 chamada de API) e a Stripe calcula e cobra automaticamente no ciclo mensal. Não requer infra adicional, apenas adicionar `stripe.billing.meterEvents.create(...)` no gateway de API.

Fonte: [Stripe Usage-Based Billing](https://stripe.com/billing/usage-based-billing) · [Stripe Billing Advanced](https://docs.stripe.com/billing/subscriptions/usage-based/advanced/about)

---

## 4. Quick Wins vs Apostas

### Quick Wins — Este Mês (Junho/Julho 2026)

| Feature | Esforço estimado | Impacto imediato |
|---|---|---|
| **FTS5 no D1** (F7 parcial) | 1 dia | Busca funcional sem embeddings; UX 10× melhor |
| **Monitor simples (F3)** | 2–3 dias | Retenção: usuários voltam quando há alerta |
| **Dossiê básico via UI** (F1, sem PDF) | 3–4 dias | Feature de conversão Pro→Corporativo |
| **Checklist due diligence imóvel** (F9) | 2 dias | Diferenciação no módulo leilões já no ar |
| **Sentry para rastreamento de erros** | 4 horas | Qualidade mínima para produto com pagantes |

O Quick Win mais valioso é o **Monitor de Risco (F3)**. Alertas criam um loop de retenção — o usuário que recebe um alerta relevante não cancela. É a feature com maior impacto no churn sem exigir novos dados.

---

### Apostas — Próximo Trimestre (Q3 2026)

| Feature | Por que agora | Pré-requisito |
|---|---|---|
| **Dossiê Empresarial completo (F1)** | Feature âncora do Corporativo; diferenciação vs Escavador/Jusbrasil | Estabilidade de todos os módulos de dados |
| **UBO Traversal (F2)** | Único "Sayari do Brasil" acessível; defensável | Latência do CNPJ.ws para travessias profundas |
| **Busca GraphRAG simples (F6, MVP)** | Queries multi-hop impossíveis no RAG vetorial | D1 Bridge com endpoints de grafo |
| **Análise de edital com upload (F5)** | Licitações + leilões: feature "uau" para advogados | Extração confiável de texto de PDF |
| **Plano Data API (F10)** | Receita B2B sem dependência de UI | Rate limiting + billing metered Stripe |

A aposta de maior ROI é o **Dossiê Empresarial (F1)** — porque usa TODOS os dados já ingeridos, cria o caso de upgrade para Corporativo, e não tem equivalente no Brasil com essa abrangência de fontes.

---

## 5. Posicionamento Estratégico — Síntese

O que os competidores fazem bem e nós não fazemos ainda:

1. **Escavador:** Histórico processual profundo + API de background check. Nossa lacuna: não temos API de due diligence vendida diretamente. Solução: F1 + F10.

2. **Jusbrasil:** IA jurídica que gera peças processuais. Nossa lacuna: não fazemos geração de documentos. Não devemos tentar — é um produto diferente. Nosso fosso: cruzamento inter-domínios.

3. **Sayari:** Travessia automática de UBO em 250 países. Nossa lacuna: travessia de QSA no Brasil não está exposta como feature. Solução: F2.

4. **LicitaGov e alertas de licitações:** Alertas de editais por WhatsApp. Nossa lacuna: não temos WhatsApp ainda. Solução: Q3.

O que nenhum concorrente faz que a Fonte.ia pode fazer:

- **Grafo unificado público brasileiro**: empresa aparece nas licitações, nos processos, nas marcas, nas sanções, nos gastos do deputado, nas infrações ambientais — tudo no mesmo lugar, tudo rastreável com evidência.
- **Rastreabilidade como produto**: cada dado tem link + data + hash. Isso transforma o produto em evidência jurídica utilizável — os competidores mostram dados; a Fonte.ia mostra dados com proveniência auditável.
- **Preço acessível para PMEs**: R$ 597/mês contra £94k/ano do Sayari ou preços enterprise da Neoway. O mercado-alvo (advogados de pequenos escritórios, despachantes, jornalistas, compradores de leilão individuais) não tem acesso a essas ferramentas hoje.

O posicionamento que converte: **"O melhor sistema de inteligência sobre empresas e governo do Brasil — que qualquer pessoa pode pagar e que nunca inventa."**

---

## Fontes Principais

- [Neoway B2B Intelligence](https://www.neoway.com.br/en/solutions/b2b-intelligence)
- [Neoway GetApp 2026](https://www.getapp.com/business-intelligence-analytics-software/a/neoway/)
- [Sayari Graph Platform](https://sayari.com/platform/graph/)
- [Sayari 2025 Mid-Year Recap](https://sayari.com/resources/blg-2025-mid-year-recap-products-keep-pace-with-change/)
- [Top Sayari Alternatives 2026 — Zavia.ai](https://zavia.ai/top-sayari-alternatives-in-2026-best-platforms-for-ubo-discovery-kyb-risk-intelligence/)
- [OpenCorporates API Getting Started](https://blog.opencorporates.com/2025/02/13/getting-started-with-the-opencorporates-api/)
- [OpenCorporates Pricing 2026 — Zephira.ai](https://zephira.ai/opencorporates-pricing-explained-2026-plans-api-limits-licensing-and-what-it-means-in-production/)
- [Jusbrasil PRO](https://www.jusbrasil.com.br/pro)
- [JusIA Planos](https://ia.jusbrasil.com.br/planos)
- [Escavador Business](https://www.escavador.com/business)
- [Escavador API](https://api.escavador.com/v2/docs/)
- [Cortex Intelligence B2B](https://www.cortex-intelligence.com/en/b2b-sales-intelligence)
- [JOTA Quem Somos](https://portal.jota.info/quem-somos)
- [JOTA + Base dos Dados](https://basedosdados.org/case-studies/jota)
- [Palantir AIP](https://www.kavout.com/market-lens/is-palantir-s-ai-platform-now-indispensable-for-government-and-enterprise)
- [Microsoft GraphRAG](https://www.microsoft.com/en-us/research/project/graphrag/)
- [GraphRAG 2026 Buyer's Guide](https://medium.com/@tongbing00/graphrag-in-2026-a-practical-buyers-guide-to-knowledge-graph-augmented-rag-43e5e72d522d)
- [Supabase Hybrid Search](https://supabase.com/docs/guides/ai/hybrid-search)
- [Cloudflare D1 FTS5](https://www.threads.com/@gagansuie/post/DFTomkxPgN3)
- [Cloudflare Workers AI Pricing](https://markaicode.com/pricing/cloudflare-workers-pricing-breakdown/)
- [Gemini Embedding 2 Pricing](https://tokencost.app/blog/gemini-embedding-2-pricing)
- [Stripe Usage-Based Billing](https://stripe.com/billing/usage-based-billing)
- [Supabase CDC Options](https://www.stacksync.com/blog/supabase-cdc-options-triggers-webhooks-realtime-compared)
- [LicitaGov Alertas](https://licitagov.org/)
- [ConLicitação ferramentas](https://conlicitacao.com.br/conheca-as-principais-ferramentas-de-alerta-de-licitacao/)
- [Escavador crescimento 50%](https://startups.com.br/alem-da-faria-lima/time-diverso-e-ia-sao-as-armas-do-escavador-para-crescer-50-ao-ano/)
- [Anthropic Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
