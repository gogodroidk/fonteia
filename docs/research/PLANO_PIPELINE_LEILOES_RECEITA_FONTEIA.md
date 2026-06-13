# Plano de Implementação — Pipeline de Leilões da Receita Federal na Fonte.ia

## 1. Objetivo

Implementar dentro da **Fonte.ia by Olli** um pipeline robusto para coletar, estruturar, armazenar, analisar e exibir dados públicos dos **leilões oficiais da Receita Federal**, começando pelo Sistema de Leilão Eletrônico da Receita Federal, o SLE.

A plataforma deve transformar editais, lotes, PDFs, anexos, laudos e imagens públicas em informações claras para usuários leigos, com rastreabilidade, evidência oficial e posterior uso de IA via RAG.

Regra central:

```txt
Fonte oficial → Coleta pública → Evidência preservada → Dados estruturados → Relatório claro → IA com fonte
```

---

## 2. Contexto do produto

A **Fonte.ia** é um SaaS de inteligência de dados públicos brasileiros.

A plataforma deve transformar fontes oficiais, como Receita Federal, PNCP, CNPJ e tribunais, em decisões rastreáveis com IA.

Stack atual esperada:

- Monorepo com `pnpm` + Turborepo
- Frontend com React 19 + Vite + TypeScript
- Supabase com Postgres, Auth, Storage e pgvector
- Cloudflare Workers hospedando o site
- GitHub com deploy automático
- Banco já com dados reais de amostra
- IA planejada para usar evidências, sem inventar

Módulo inicial deste plano:

```txt
Leilões Oficiais da Receita Federal
```

---

## 3. Posicionamento correto

A Receita Federal não deve ser tratada inicialmente como “leilão judicial”.

Posicionamento correto do módulo:

```txt
Inteligência em leilões oficiais da Receita Federal
```

Depois, a Fonte.ia pode expandir para:

```txt
Leilões judiciais
Leilões extrajudiciais
Leilões da Receita Federal
PNCP
Ativos públicos
Dados de CNPJ
Tribunais
```

Não misturar tudo no início. Primeiro deve funcionar muito bem em uma fonte oficial.

---

## 4. O que será capturado

O pipeline deve capturar somente dados públicos.

### 4.1 Editais

Dados esperados:

- Número do edital
- Ano
- Órgão ou unidade responsável
- Região fiscal
- Título
- Status
- Data de início de propostas
- Data final de propostas
- Data da sessão de lances
- URL oficial
- HTML bruto
- Hash do conteúdo
- Data da coleta

### 4.2 Lotes

Dados esperados:

- Número do lote
- Título
- Descrição
- Categoria
- Subcategoria
- Valor de avaliação
- Lance mínimo
- Cidade
- Estado
- Local de retirada
- Tipo de participante permitido
- Restrições
- Status
- URL oficial
- HTML bruto
- Hash do conteúdo
- Data da coleta

### 4.3 Arquivos

Arquivos esperados:

- PDF do edital
- Relação de lotes
- Laudos
- Anexos
- Imagens públicas
- Fotos de lotes, quando existirem

Para cada arquivo:

- URL original
- Caminho no Supabase Storage
- MIME type
- Tamanho
- SHA-256
- Texto extraído
- Indicação se OCR foi usado
- Número de páginas, quando aplicável

---

## 5. Limites legais e operacionais

### Permitido

- Coletar páginas públicas
- Coletar editais públicos
- Baixar PDFs públicos
- Baixar anexos públicos
- Baixar imagens públicas
- Organizar dados públicos
- Gerar relatórios auxiliares
- Mostrar fonte oficial

### Proibido

- Acessar área logada do e-CAC
- Burlar login
- Burlar captcha
- Coletar dados confidenciais de participantes
- Coletar propostas privadas
- Coletar dados não públicos
- Simular lances
- Receber pagamento de arrematação
- Se apresentar como Receita Federal

Texto recomendado no produto:

```txt
A Fonte.ia não é a Receita Federal.
A Fonte.ia não realiza lances.
A Fonte.ia não recebe pagamento de arrematação.
A Fonte.ia organiza informações públicas e gera análise auxiliar.
A participação em leilões ocorre exclusivamente nos canais oficiais da Receita Federal.
```

---

## 6. Arquitetura geral

```txt
Receita Federal / SLE público
        ↓
Coletor automático
        ↓
Editais, lotes, PDFs, anexos, fotos
        ↓
Supabase Storage + Supabase Postgres
        ↓
Parser de PDF + normalizador
        ↓
Evidence chunks + pgvector
        ↓
Busca estruturada + busca semântica
        ↓
Relatório mastigado para o cliente
        ↓
IA com evidência oficial
```

---

## 7. Onde cada parte deve rodar

| Parte | Local recomendado |
|---|---|
| Frontend | Cloudflare Workers |
| Banco | Supabase Postgres |
| Arquivos | Supabase Storage |
| Busca semântica | Supabase pgvector |
| Scraper leve via fetch | Supabase Edge Function ou GitHub Actions |
| Scraper com navegador | GitHub Actions, Render, Railway, Fly.io ou Apify |
| IA | Supabase Edge Function chamando modelo externo |
| Alertas | Job server-side + Resend |

Recomendação para MVP:

```txt
GitHub Actions + Playwright + Supabase
```

Motivos:

- simples
- barato
- versionado
- fácil de debugar
- suporta Playwright melhor que Edge Function
- evita colocar scraper pesado no Cloudflare Worker

---

## 8. Regra técnica principal

Não colocar scraper pesado dentro do Cloudflare Worker.

Cloudflare Worker deve cuidar de:

- site
- APIs leves
- rotas simples
- autenticação client-side com Supabase

O pipeline pesado deve ficar fora:

- Playwright
- download de PDF
- OCR
- extração de texto
- hash
- normalização pesada

---

## 9. Estrutura de banco de dados

Criar migrations Supabase para as tabelas abaixo.

### 9.1 `auction_sources`

Guarda as fontes de dados.

Campos sugeridos:

```txt
id
name
slug
base_url
source_type
is_active
created_at
updated_at
```

Exemplo:

```txt
Receita Federal SLE
receita-federal-sle
https://www25.receita.fazenda.gov.br/sle-sociedade/portal/editais-disponiveis
official_auction
true
```

### 9.2 `auction_notices`

Guarda editais.

Campos sugeridos:

```txt
id
source_id
external_id
notice_number
notice_year
organ
region
title
status
proposal_start_at
proposal_end_at
bidding_starts_at
bidding_ends_at
official_url
raw_html
content_hash
first_seen_at
last_seen_at
created_at
updated_at
```

Índices recomendados:

```txt
source_id
notice_number
notice_year
status
proposal_end_at
bidding_starts_at
content_hash
```

Constraint recomendada:

```txt
unique(source_id, notice_number, notice_year)
```

### 9.3 `auction_lots`

Guarda lotes.

Campos sugeridos:

```txt
id
notice_id
external_id
lot_number
title
description
category
subcategory
estimated_value
minimum_bid
currency
location_city
location_state
pickup_location
allowed_bidders
restrictions
status
official_url
raw_html
content_hash
first_seen_at
last_seen_at
created_at
updated_at
```

Índices recomendados:

```txt
notice_id
lot_number
category
location_state
estimated_value
minimum_bid
status
content_hash
```

Constraint recomendada:

```txt
unique(notice_id, lot_number)
```

### 9.4 `auction_files`

Guarda PDFs, anexos, laudos e outros arquivos.

Campos sugeridos:

```txt
id
notice_id
lot_id
file_type
original_url
storage_bucket
storage_path
mime_type
file_size
sha256
extracted_text
ocr_used
page_count
created_at
updated_at
```

Índices recomendados:

```txt
notice_id
lot_id
file_type
sha256
```

Constraint recomendada:

```txt
unique(sha256)
```

### 9.5 `auction_lot_images`

Guarda imagens públicas dos lotes.

Campos sugeridos:

```txt
id
notice_id
lot_id
original_url
storage_bucket
storage_path
mime_type
file_size
sha256
width
height
created_at
updated_at
```

### 9.6 `evidence_chunks`

Guarda trechos usados pela IA e pelos relatórios.

Campos sugeridos:

```txt
id
source_type
source_id
notice_id
lot_id
file_id
chunk_text
page_number
official_url
sha256
embedding
created_at
```

Observações:

- `embedding` deve usar pgvector.
- Cada chunk deve manter ligação com o arquivo ou página de origem.
- A IA só deve responder usando esses chunks.

### 9.7 `ingestion_runs`

Guarda cada execução do coletor.

Campos sugeridos:

```txt
id
source
status
started_at
finished_at
notices_found
notices_created
notices_updated
lots_found
lots_created
lots_updated
files_downloaded
errors_count
metadata
```

Status possíveis:

```txt
running
success
partial_success
failed
```

### 9.8 `ingestion_errors`

Guarda erros detalhados.

Campos sugeridos:

```txt
id
run_id
source
step
url
error_message
error_stack
metadata
created_at
```

### 9.9 `saved_searches`

Guarda buscas salvas pelo usuário.

Campos sugeridos:

```txt
id
user_id
name
query
filters
is_active
created_at
updated_at
```

### 9.10 `auction_alerts`

Guarda alertas gerados para o usuário.

Campos sugeridos:

```txt
id
user_id
saved_search_id
lot_id
status
sent_at
created_at
```

---

## 10. Estrutura do pacote de ingestão

Criar um pacote separado:

```txt
packages/ingest-receita/
```

Estrutura sugerida:

```txt
packages/ingest-receita/
  src/
    index.ts
    config.ts
    logger.ts

    adapters/
      receita-sle.adapter.ts

    scrapers/
      discover-notices.ts
      fetch-notice-detail.ts
      fetch-lots.ts
      fetch-lot-detail.ts
      discover-files.ts

    parsers/
      parse-html.ts
      parse-pdf.ts
      normalize-lot.ts
      normalize-notice.ts

    storage/
      download-file.ts
      upload-to-supabase.ts
      hash-file.ts

    db/
      supabase-admin.ts
      upsert-notice.ts
      upsert-lot.ts
      upsert-file.ts
      insert-evidence-chunks.ts

    jobs/
      run-full-ingestion.ts
      run-single-notice.ts
```

---

## 11. Dependências sugeridas

```txt
playwright
cheerio
pdf-parse
mime-types
zod
@supabase/supabase-js
dotenv
tsx
pino
```

Possíveis dependências futuras:

```txt
pdfjs-dist
tesseract.js
openai
@anthropic-ai/sdk
```

Não começar com OCR. OCR só deve entrar depois, quando houver PDF escaneado.

---

## 12. Fluxo do coletor

### 12.1 Descobrir editais

Função:

```ts
discoverReceitaNotices()
```

Retorno esperado:

```ts
type ReceitaNoticeSummary = {
  externalId: string
  noticeNumber: string
  noticeYear: string
  organ?: string
  region?: string
  title?: string
  proposalEndAt?: string
  biddingStartsAt?: string
  officialUrl: string
}
```

Critério de pronto:

- encontra editais reais
- salva no Supabase
- não duplica edital
- atualiza quando dado muda
- guarda HTML bruto
- calcula hash

### 12.2 Buscar detalhes do edital

Função:

```ts
fetchReceitaNoticeDetail(noticeUrl)
```

Deve capturar:

- título
- unidade responsável
- datas
- regras
- links de PDF
- links de anexos
- links dos lotes
- HTML bruto

Critério de pronto:

- dado entra em `auction_notices`
- arquivos detectados entram na fila de download
- mudanças futuras atualizam registro
- hash muda se conteúdo oficial mudar

### 12.3 Buscar lotes

Funções:

```ts
fetchReceitaLots(noticeUrl)
fetchReceitaLotDetail(lotUrl)
```

Cada lote deve virar registro em `auction_lots`.

Classificação inicial por regra:

```txt
veiculo
celular
informatica
eletronico
joia
bebida
sucata
maquinario
mercadoria_mista
outro
```

Exemplos de regra simples:

```txt
Se descrição contém "veículo", "placa", "chassi" → veiculo
Se contém "iphone", "smartphone", "celular" → celular
Se contém "notebook", "computador", "monitor" → informatica
Se contém "vinho", "whisky", "bebida" → bebida
```

### 12.4 Descobrir arquivos

Função:

```ts
discoverAuctionFiles(noticeHtml, lotHtml)
```

Deve encontrar:

- links `.pdf`
- links de imagens
- anexos
- laudos
- arquivos relacionados ao edital
- arquivos relacionados ao lote

### 12.5 Baixar arquivos

Funções:

```ts
downloadAuctionFile(url)
calculateSha256(file)
uploadAuctionFileToSupabase(file)
extractTextFromPdf(file)
```

Destino no Supabase Storage:

```txt
auction-files/
  receita-federal/
    2026/
      edital-001/
        edital.pdf
        anexos/
        lotes/
          lote-402/
            laudo.pdf
            foto-1.jpg
```

Regra:

- nunca salvar só o link
- sempre baixar e preservar cópia quando permitido publicamente
- sempre calcular SHA-256
- sempre manter URL original

---

## 13. Criação de evidências

Depois de extrair texto dos PDFs e páginas, quebrar em chunks.

Exemplo:

```txt
chunk 1: regras gerais
chunk 2: forma de pagamento
chunk 3: retirada
chunk 4: lote específico
chunk 5: restrições
```

Cada chunk deve conter:

```txt
chunk_text
official_url
file_id
notice_id
lot_id
page_number
sha256
created_at
```

Regra:

```txt
Sem evidência, a IA não responde.
```

Resposta padrão quando faltar evidência:

```txt
Não encontrei evidência suficiente nos documentos coletados para responder com segurança.
```

---

## 14. API interna para o frontend

Criar endpoints ou funções server-side para:

```txt
GET /api/auctions
GET /api/auctions/:id
GET /api/auctions/:id/lots
GET /api/lots/:id
GET /api/lots/:id/evidence
GET /api/search
GET /api/ingestion/status
```

O frontend deve conseguir mostrar:

- editais disponíveis
- lotes
- filtros
- detalhe do lote
- PDFs oficiais
- evidências
- status da última coleta

---

## 15. Telas necessárias no frontend

### 15.1 Lista de leilões

Mostrar:

- edital
- órgão
- região
- status
- data final de propostas
- data da sessão
- quantidade de lotes

### 15.2 Busca de lotes

Filtros mínimos:

```txt
categoria
estado
cidade
valor mínimo
valor máximo
data do leilão
tipo de participante
palavra-chave
fonte
risco
oportunidade
```

### 15.3 Detalhe do lote

Mostrar:

- título
- descrição
- valor
- edital relacionado
- local
- datas importantes
- restrições
- documentos oficiais
- evidências
- relatório mastigado

### 15.4 Status da coleta

Mostrar para admin:

```txt
Última coleta
Editais encontrados
Editais novos
Lotes encontrados
Lotes novos
Arquivos baixados
Erros
```

---

## 16. Relatório sem IA

Antes da IA, criar relatório por template.

Função:

```ts
generateLotReport(lotId)
```

Estrutura:

```txt
Resumo do lote
Valor
Local
Datas importantes
Quem pode participar
Riscos detectados
Documentos oficiais
Checklist antes do lance
Fontes oficiais
```

Exemplo:

```txt
Lote 402 — Honda Fit 2008

Resumo:
Veículo listado no edital X da Receita Federal.

Pontos importantes:
- Conferir laudo antes de qualquer proposta.
- Validar local de retirada.
- Verificar regras de transferência.
- Considerar custos extras além do lance.

Fontes:
- URL oficial do lote
- PDF do edital
- Laudo anexado
```

---

## 17. IA com RAG

A IA deve entrar depois da ingestão funcionar.

Criar Edge Function:

```txt
supabase/functions/auction-ai-report
```

Entrada:

```json
{
  "lotId": "..."
}
```

A função busca:

- lote
- edital
- arquivos
- evidence_chunks
- documentos relacionados

A IA deve responder:

```txt
Resumo
Oportunidade
Riscos
Pontos do edital
Checklist
Fontes usadas
```

Regras obrigatórias:

```txt
Não inventar.
Não usar conhecimento externo sem avisar.
Não estimar margem sem base.
Não criar custo de retirada se não estiver no edital.
Sempre citar fontes internas.
Se faltar evidência, dizer que falta evidência.
```

---

## 18. Alertas

Depois do MVP, implementar buscas salvas.

Exemplos:

```txt
Me avise quando aparecer iPhone em SP abaixo de R$ 5.000
Me avise veículo Honda até R$ 20.000
Me avise notebook em lote de informática
```

Fluxo:

```txt
Usuário salva busca
        ↓
Nova coleta roda
        ↓
Sistema compara novos lotes
        ↓
Se der match, cria alerta
        ↓
Depois envia e-mail via Resend
```

---

## 19. Automação com GitHub Actions

Criar workflow:

```txt
.github/workflows/ingest-receita.yml
```

Rodar:

```txt
a cada 4 horas
```

A action deve:

```txt
instalar dependências
instalar Playwright
rodar pnpm ingest:receita
registrar logs
falhar com mensagem clara se quebrar
```

Exemplo de scripts:

```json
{
  "scripts": {
    "ingest:receita": "tsx packages/ingest-receita/src/jobs/run-full-ingestion.ts",
    "ingest:receita:single": "tsx packages/ingest-receita/src/jobs/run-single-notice.ts",
    "ingest:receita:dry-run": "tsx packages/ingest-receita/src/jobs/run-full-ingestion.ts --dry-run",
    "test:ingest": "vitest packages/ingest-receita"
  }
}
```

---

## 20. Ordem correta de execução

```txt
1. Banco de dados
2. Tipos TypeScript
3. Coletor de editais
4. Coletor de detalhes do edital
5. Coletor de lotes
6. Download de arquivos
7. Parser de PDF
8. Criação de evidências
9. Frontend mostrando dados reais
10. Relatório sem IA
11. Busca e filtros
12. IA com RAG
13. Alertas
14. Pagamento
15. Visual premium
```

A ordem é importante.

Não começar pela IA.

Primeiro o produto precisa virar uma máquina confiável de ingestão.

---

## 21. Critério de pronto do MVP

O MVP estará pronto quando:

```txt
1. Coletar pelo menos 1 edital real da Receita.
2. Coletar todos os lotes desse edital.
3. Baixar pelo menos 1 PDF ou anexo.
4. Salvar arquivo no Supabase Storage.
5. Extrair texto do PDF.
6. Criar chunks de evidência.
7. Mostrar edital e lotes no frontend.
8. Abrir detalhe de um lote.
9. Mostrar fontes oficiais.
10. Gerar relatório por template.
11. Rodar sem quebrar o build atual do site.
```

---

## 22. Prompt mestre para o Codex

```txt
Você é um engenheiro sênior full-stack e data engineer trabalhando no projeto Fonte.ia by Olli.

Contexto do produto:
Fonte.ia é um SaaS de inteligência de dados públicos brasileiros. A plataforma transforma fontes oficiais em decisões rastreáveis com IA. O módulo inicial agora será Leilões Oficiais da Receita Federal.

Stack atual:
- Monorepo pnpm + Turborepo
- React 19 + Vite no frontend
- TypeScript
- Supabase com Postgres, Auth, Storage e pgvector
- Cloudflare Workers hospedando o site
- GitHub com deploy automático
- O frontend já está no ar
- O banco já tem alguns leilões reais de amostra
- A IA deve vir depois da ingestão funcionar

Objetivo:
Implementar um pipeline robusto de ingestão pública dos leilões da Receita Federal/SLE, coletando editais, lotes, PDFs, anexos e imagens públicas. A plataforma deve salvar os dados no Supabase, preservar evidências oficiais, calcular hash dos conteúdos e preparar os dados para busca, relatórios e IA com RAG.

Restrições obrigatórias:
- Não acessar área logada do e-CAC.
- Não burlar login, captcha ou restrições.
- Coletar apenas dados públicos.
- Não coletar dados confidenciais de participantes, propostas ou licitantes.
- Não quebrar o frontend atual.
- Não alterar o fluxo de deploy existente sem necessidade.
- Não colocar service role key no frontend.
- Toda escrita no banco deve acontecer em ambiente server-side.
- Salvar URL oficial, data de coleta, hash SHA-256 e HTML/texto bruto sempre que possível.

Tarefa 1 — Auditoria:
1. Inspecione a estrutura atual do repositório.
2. Identifique onde estão apps, packages, supabase, migrations e frontend.
3. Identifique como os leilões de amostra estão sendo lidos hoje.
4. Liste arquivos que serão alterados antes de alterar.
5. Não faça mudança grande sem organizar em fases.

Tarefa 2 — Banco de dados:
Criar migrations Supabase para:
- auction_sources
- auction_notices
- auction_lots
- auction_files
- auction_lot_images
- evidence_chunks
- ingestion_runs
- ingestion_errors
- saved_searches
- auction_alerts

As tabelas devem suportar:
- URL original
- HTML bruto
- texto extraído
- hash SHA-256
- data de coleta
- relação edital → lote → arquivo → evidência
- deduplicação por fonte, número do edital, ano e lote
- status da coleta

Tarefa 3 — Serviço de ingestão:
Criar um pacote separado:
packages/ingest-receita/

Estrutura sugerida:
src/index.ts
src/config.ts
src/logger.ts
src/adapters/receita-sle.adapter.ts
src/scrapers/discover-notices.ts
src/scrapers/fetch-notice-detail.ts
src/scrapers/fetch-lots.ts
src/scrapers/fetch-lot-detail.ts
src/scrapers/discover-files.ts
src/parsers/parse-html.ts
src/parsers/parse-pdf.ts
src/parsers/normalize-lot.ts
src/parsers/normalize-notice.ts
src/storage/download-file.ts
src/storage/upload-to-supabase.ts
src/storage/hash-file.ts
src/db/supabase-admin.ts
src/db/upsert-notice.ts
src/db/upsert-lot.ts
src/db/upsert-file.ts
src/db/insert-evidence-chunks.ts
src/jobs/run-full-ingestion.ts
src/jobs/run-single-notice.ts

Tarefa 4 — Coleta:
Implementar o adapter da Receita Federal/SLE.

O coletor deve:
1. Acessar a página pública de editais disponíveis.
2. Descobrir editais abertos ou recentes.
3. Capturar número, ano, órgão, datas e URL oficial.
4. Entrar nos detalhes de cada edital.
5. Descobrir lotes.
6. Capturar detalhes de cada lote.
7. Descobrir PDFs, anexos, laudos e imagens públicas.
8. Salvar HTML bruto.
9. Fazer upsert no Supabase.
10. Registrar logs em ingestion_runs e ingestion_errors.

Use fetch quando possível. Use Playwright quando a página depender de renderização JavaScript. Use cheerio para parse de HTML.

Tarefa 5 — Arquivos:
Implementar download de PDFs, anexos e imagens públicas.

Para cada arquivo:
- baixar arquivo
- calcular SHA-256
- identificar MIME type
- salvar no Supabase Storage
- criar registro em auction_files
- extrair texto se for PDF
- salvar texto extraído
- criar chunks de evidência

Bucket sugerido:
auction-files

Estrutura sugerida:
receita-federal/{ano}/edital-{numero}/...
receita-federal/{ano}/edital-{numero}/lote-{numero}/...

Tarefa 6 — Normalização:
Criar normalizadores para:
- edital
- lote
- arquivo
- evidência

Classificar lote inicialmente por regra simples:
- veiculo
- celular
- informatica
- eletronico
- joia
- bebida
- sucata
- maquinario
- mercadoria_mista
- outro

Extrair quando possível:
- marca
- modelo
- ano
- placa
- chassi
- valor de avaliação
- lance mínimo
- cidade
- estado
- local de retirada
- restrições
- PF/PJ
- datas importantes

Não inventar dados. Se não encontrar, deixar null.

Tarefa 7 — API interna:
Criar endpoints ou funções server-side para o frontend consumir:
- listar editais
- listar lotes
- filtrar lotes
- abrir detalhe do lote
- ver arquivos oficiais
- ver evidências
- ver status da última coleta

Tarefa 8 — Frontend:
Integrar os dados reais no painel existente.

Criar ou adaptar telas para:
- lista de leilões da Receita
- busca de lotes
- filtros
- detalhe do lote
- documentos oficiais
- evidências
- status de coleta

Manter o design simples. Não gastar tempo com visual premium agora. O foco é funcionar.

Tarefa 9 — Relatório sem IA:
Criar uma primeira versão de relatório por template, sem IA, com:
- resumo do lote
- datas importantes
- valor
- local
- documentos disponíveis
- riscos detectados por regra
- checklist antes do lance
- fontes oficiais

Tarefa 10 — Preparar IA, mas não depender dela:
Preparar estrutura para RAG com evidence_chunks e pgvector.
Não ativar IA como dependência principal do MVP.
A IA só deve ser ligada depois que a ingestão estiver funcionando.

Tarefa 11 — Automação:
Criar GitHub Action para rodar o coletor periodicamente, por exemplo a cada 4 horas.
A action deve:
- instalar dependências
- rodar Playwright se necessário
- executar run-full-ingestion
- registrar logs
- falhar com mensagem clara se algo quebrar

Tarefa 12 — Qualidade:
Criar scripts:
- pnpm ingest:receita
- pnpm ingest:receita:single
- pnpm ingest:receita:dry-run
- pnpm test:ingest

Critério de pronto do MVP:
1. Coletar pelo menos 1 edital real da Receita.
2. Coletar todos os lotes desse edital.
3. Baixar pelo menos 1 PDF ou anexo.
4. Salvar arquivo no Supabase Storage.
5. Extrair texto do PDF.
6. Criar chunks de evidência.
7. Mostrar edital e lotes no frontend.
8. Abrir detalhe de um lote.
9. Mostrar fontes oficiais.
10. Rodar sem quebrar o build atual do site.

Antes de codar:
Faça uma análise do repositório e apresente o plano de arquivos que serão criados/alterados. Depois implemente por fases, validando cada fase.
```

---

## 23. Prompts por fase

### Fase 1 — Banco

```txt
Agora execute a Fase 1 do pipeline da Receita Federal.

Foco exclusivo:
- criar migrations Supabase
- criar tabelas de ingestão
- criar tipos TypeScript correspondentes
- não implementar scraper ainda
- não alterar frontend ainda
- não mexer em design
- não ligar IA

Entregue:
1. migrations SQL
2. tipos TypeScript
3. explicação curta das tabelas
4. comandos para aplicar
5. validação de que o build do frontend não foi quebrado
```

### Fase 2 — Coletor inicial

```txt
Agora execute a Fase 2 do pipeline da Receita Federal.

Foco exclusivo:
- criar packages/ingest-receita
- implementar coletor inicial dos editais públicos
- usar fetch quando possível e Playwright quando necessário
- salvar editais em auction_notices
- registrar ingestion_runs e ingestion_errors
- criar script pnpm ingest:receita:dry-run
- não baixar PDFs ainda
- não alterar frontend ainda
- não ligar IA

Critério de pronto:
- dry-run lista editais encontrados
- ingestão real salva editais no Supabase
- não duplica registros
- registra URL, hash e data de coleta
- logs são claros
```

### Fase 3 — Lotes

```txt
Agora execute a Fase 3 do pipeline da Receita Federal.

Foco exclusivo:
- coletar detalhes de cada edital
- descobrir lotes
- coletar detalhe de cada lote
- salvar lotes em auction_lots
- preservar HTML bruto
- calcular hash de cada lote
- classificar categoria por regras simples
- não baixar PDFs ainda
- não ligar IA

Critério de pronto:
- pelo menos 1 edital real tem todos os lotes coletados
- lotes aparecem corretamente no banco
- não há duplicação
- mudanças atualizam registros existentes
```

### Fase 4 — Arquivos

```txt
Agora execute a Fase 4 do pipeline da Receita Federal.

Foco exclusivo:
- descobrir PDFs, anexos, laudos e imagens públicas
- baixar arquivos
- calcular SHA-256
- salvar no Supabase Storage
- criar registros em auction_files e auction_lot_images
- extrair texto de PDFs
- não usar OCR ainda
- não ligar IA

Critério de pronto:
- pelo menos 1 PDF real baixado
- arquivo salvo no Supabase Storage
- hash salvo no banco
- texto extraído salvo em auction_files
- erro de PDF não derruba a ingestão inteira
```

### Fase 5 — Evidências

```txt
Agora execute a Fase 5 do pipeline da Receita Federal.

Foco exclusivo:
- criar evidence_chunks
- quebrar texto de PDFs e HTML em blocos úteis
- ligar chunks a edital, lote e arquivo
- preparar coluna embedding com pgvector
- não gerar embeddings ainda se a chave de IA não existir
- criar relatório por template sem IA

Critério de pronto:
- cada lote com arquivo/documento tem evidências
- relatório do lote mostra fontes oficiais
- se faltar evidência, o sistema informa claramente
```

### Fase 6 — Frontend

```txt
Agora execute a Fase 6 do pipeline da Receita Federal.

Foco exclusivo:
- integrar dados reais no frontend
- criar telas de lista de editais
- criar busca de lotes
- criar detalhe do lote
- mostrar documentos oficiais
- mostrar evidências
- mostrar relatório por template
- manter design simples
- não gastar tempo com visual premium agora

Critério de pronto:
- usuário logado consegue ver editais reais
- usuário consegue buscar lotes
- usuário consegue abrir um lote
- usuário consegue ver fonte oficial e documentos
- build do frontend passa
```

### Fase 7 — Automação

```txt
Agora execute a Fase 7 do pipeline da Receita Federal.

Foco exclusivo:
- criar GitHub Action para ingestão periódica
- rodar a cada 4 horas
- configurar comandos pnpm
- garantir logs úteis
- não expor secrets no frontend
- documentar variáveis necessárias

Critério de pronto:
- workflow existe
- workflow pode ser executado manualmente
- workflow roda em cron
- logs mostram editais, lotes, arquivos e erros
```

---

## 24. Variáveis de ambiente necessárias

```txt
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=auction-files
RECEITA_SLE_BASE_URL=https://www25.receita.fazenda.gov.br/sle-sociedade/portal
INGESTION_USER_AGENT=FonteiaBot/1.0 contato@fontebrasil.online
```

Futuras:

```txt
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
RESEND_API_KEY=
```

Regra:

```txt
SUPABASE_SERVICE_ROLE_KEY nunca pode ir para o frontend.
```

---

## 25. Checklist final para o Codex

Antes de finalizar qualquer fase, verificar:

```txt
O build do frontend continua funcionando?
As migrations aplicam sem erro?
Os dados são salvos sem duplicar?
Existe log de erro?
Existe dry-run?
As URLs oficiais foram preservadas?
O hash foi salvo?
O HTML/texto bruto foi salvo?
O código não acessa e-CAC?
O código não depende de IA para funcionar?
```

---

## 26. Verdade operacional

O diferencial da Fonte.ia não é capturar site.

O diferencial é transformar um edital chato, um PDF longo e um lote mal explicado em uma decisão clara:

```txt
Vale olhar?
Qual é o risco?
Qual é o prazo?
Quem pode participar?
Onde está a fonte?
O que preciso conferir antes de dar lance?
```

Esse é o produto.

Primeiro fazer a máquina coletar.

Depois fazer a máquina explicar.

Por último, fazer a máquina ficar bonita.
