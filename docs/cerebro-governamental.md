# Fonte.ia — Cérebro Governamental (arquitetura & roadmap)

> Documento mestre. Consolida a visão (4 packs de pesquisa) cruzada com o **estado real do
> sistema** em jun/2026. Fonte da verdade para a evolução "dados → decisão".

## 1. Visão

Fonte.ia não é um buscador de dados públicos — é um **Cérebro Governamental**: coleta,
normaliza, conecta e **explica** dados públicos brasileiros para gerar **decisão, risco,
oportunidade, lead e relatório com fonte rastreável**.

> Frase de produto: *transforma dado público bruto em resposta, risco, oportunidade e ação — com fonte.*

Princípio cardinal: **vender decisão, não planilha.** Se não gera ação, é museu de dado.

## 2. Estado atual (o que JÁ está construído)

- **8 módulos com dado real + proveniência** (~15 mil entidades): leilões (Receita/SLE),
  licitações (PNCP), política (Câmara+Senado), municípios (IBGE), empresas/órgãos,
  ambiental (IBAMA), jurídico (proposições + processos CNJ), sanções (CEIS/CNEP).
- **Pipeline base do cérebro já existe:** `sources → raw_records → entities → evidence`.
- **IA** (Gemini): omnibox ⌘K + chat contextual + Raio-X de lote, com degrade honesto.
- **Billing** Stripe (checkout + webhook + portal), **RLS** por kind, **rate limit** (edge),
  embeddings pgvector, dashboard multi-módulo, nav mobile.
- **17+ edge collectors** com cron; token de terceiros no **Vault**.

## 3. O gap (onde está o dinheiro)

Temos o **cérebro (dados)**; falta o **corpo que vende (produtos de decisão)**. Hoje
entregamos listas por módulo. O dinheiro está em empacotar isso em respostas.

## 4. Modelo de dados: atual vs alvo

| Conceito (pack) | No Fonte.ia hoje | Ação |
|---|---|---|
| data_sources | ✅ `sources` | ok |
| raw_ingestions | ✅ `raw_records` | ok |
| entities | ✅ `entities` (kind, attributes, embedding, source_ids) | ok |
| evidence_chunks | ~ `evidence` (por registro, não chunk de PDF) | evoluir p/ documentos |
| documents | ⚠️ `documents` (vazia) | usar ao ligar PDFs (Marker) |
| relationships | ⚠️ `entity_links` (vazia) | **popular** (empresa→contrato→órgão) |
| events | ❌ não existe | **criar** — base de Lead com Motivo / Radar Vivo |
| reports | ❌ não existe | **criar** — persistir/compartilhar Raio-X |
| exports | ❌ não existe | **criar** — PDF/XLSX/CSV/JSON |
| ai_conversations | ❌ não existe | criar p/ histórico de chat |

**Resumo:** a base está sólida; faltam **events, reports, exports** e **popular
relationships**. Isso é o coração do "cérebro" + dos produtos vendáveis.

## 5. Produtos de decisão (priorizados)

**Onda 1 — Faz dinheiro (P0)**
- **Raio-X de Empresa** — CNPJ → relatório. *Hoje, honestamente:* cadastral (CNPJ.ws) +
  **sanções CEIS/CNEP** (join por CNPJ) + fontes + score. *Contratos PNCP e processos CNJ
  ainda não casam por CNPJ do fornecedor* (PNCP traz CNPJ do órgão; DataJud raramente traz
  CNPJ da parte) → entram quando enriquecermos o vínculo fornecedor. Não prometer o que não
  temos: seção vazia = "fonte ainda não conectada", nunca "em breve" fake.
- **IA Anti-Cilada de Leilão** — sobre o Raio-X de lote: preço máximo, margem, custos
  escondidos, checklist do edital (precisa Marker p/ PDF).
- **Exportação PDF/CSV** + **Selo de Fonte** (já temos `evidence` — exibir data/fonte/confiança).

**Onda 2 — Blindagem & retenção (P1)**
- Central de Privacidade (LGPD) · Onboarding IA por profissão + home de intenção ·
  Status de Fontes (já temos `sources`) · Radar Vivo (alertas) · Langfuse + AI Gateway + Turnstile.

**Onda 3 — Escala & viral (P2)**
- **Motor de eventos** (`events`) → Lead com Motivo · cards compartilháveis · rankings ·
  SEO programático (`/empresa/[cnpj]`, `/orgao/[slug]`, `/leiloes/...`) · API · Due Diligence Express.

**Onda 4 — Cérebro avançado (P3)**
- `relationships` em escala / grafo · LightRAG/GraphRAG · Modo Desconfiança · Metabase.

## 6. Regras de IA (obrigatórias)

Formato de resposta: **Resumo · Encontrado · Oportunidade · Atenção · Como usar no seu
negócio · Próximos passos · Fontes** + botões (Exportar / Monitorar / Gerar abordagem / Compartilhar).
Sempre: diferenciar fato/inferência/sugestão; mostrar fonte; nunca inventar; nunca acusar.

## 7. LGPD & linguagem segura

Foco em CNPJ/órgão/contrato/edital/leilão/processo público. **Nunca** CPF completo, endereço
residencial PF, dossiê de pessoa, score opaco. Linguagem: "sinal de atenção", "padrão incomum",
"requer validação" — **nunca** "fraude/laranja/fachada/esquema". Central de Privacidade
(correção/anonimização). Manter fonte+data+URL+hash. Não raspar fonte que proíbe (ex.: Reclame Aqui).

## 8. Monetização (escada-alvo)

Freemium viral (tráfego/cards) → **Pro R$197** (relatório, lead, monitoramento básico) →
**Business** (multiusuário, exportação, watchlists) → **Intelligence R$1.997** (API, webhooks,
massa, white-label) → Enterprise (SLA). + **créditos avulsos** (relatórios/consultas/API) para
usuário pesado não comer margem. *(Validar valores reais no Stripe antes de mexer na UI.)*

## 9. Roadmap sequenciado

1. **Raio-X de Empresa** (cadastral + CEIS/CNEP + fontes + PDF). ← spearhead
2. Selo de Fonte + Exportação.
3. Central de Privacidade + linguagem responsável da IA.
4. Home de intenção + onboarding por profissão.
5. Langfuse + AI Gateway + Turnstile (junto com saldo do Gemini).
6. `events` + Lead com Motivo + Radar Vivo.
7. Anti-Cilada de Leilão (Marker) · viral/SEO · API.

## 10. Dependências do dono

- **Saldo no Gemini** (pré-pago) → destrava IA + embeddings (93,6% pendentes).
- **Fonte do INPI** (sem API limpa) → módulo INPI hoje vazio.

## 11. Ferramental — adoção cirúrgica (não trocar o núcleo)

Núcleo = Supabase + Cloudflare. Adotar quando doer: **Langfuse/AI Gateway/Turnstile** (ao
ligar Gemini), **Marker** (editais/PDF), **dlt/Crawl4AI/Browser Run** (municípios sem API).
Pular por ora: LightRAG/Neo4j/Qdrant (só com volume), Airbyte/Kestra (pg_cron basta),
**Dify/n8n/Langflow = laboratório, nunca núcleo**, Metabase (depois).
