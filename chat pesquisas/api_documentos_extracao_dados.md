# Como APIs públicas com documentos funcionam

## Resposta direta

Sim. Quando uma API, catálogo ou página pública expõe documentos ou links para documentos, sua plataforma pode:

1. Listar os documentos.
2. Coletar metadados.
3. Baixar arquivos.
4. Extrair texto, tabelas e dados estruturados.
5. Transformar tudo em JSON, banco de dados, relatórios e alertas.

Mas a API nem sempre entrega o dado mastigado. Muitas vezes ela só aponta onde está o documento.

---

## O que uma API pode entregar

Uma API pública relacionada a documentos pode entregar:

- Nome do documento
- Órgão responsável
- Data de publicação
- Tipo de documento
- Número de processo
- Número de edital
- Número de contrato
- Anexos
- Links para PDF, CSV, XLSX, ZIP, XML, JSON ou HTML
- Metadados de atualização
- Status do processo ou publicação

Depois disso, sua plataforma baixa o arquivo e processa.

---

## Os 4 cenários principais

### 1. API que já entrega os dados mastigados

Esse é o melhor cenário.

Exemplo:

```http
GET /contratacoes
```

Resposta:

```json
{
  "numeroCompra": "90001/2026",
  "orgao": "Ministério X",
  "valor": 250000,
  "fornecedor": "Empresa Y",
  "cnpj": "00.000.000/0001-00"
}
```

Nesse caso, você nem precisa baixar PDF. A API já entrega os dados em formato estruturado.

**Nível de dificuldade:** baixo  
**Valor para plataforma:** alto  
**Exemplo de uso:** contratos, compras públicas, empresas, despesas, editais estruturados.

---

### 2. API que entrega metadados + link do documento

Esse cenário é muito comum.

Exemplo:

```json
{
  "titulo": "Edital de Leilão nº 01/2026",
  "data": "2026-06-12",
  "urlDocumento": "https://site.gov.br/arquivos/edital.pdf"
}
```

Fluxo da plataforma:

```text
Consulta API
↓
Pega link do PDF
↓
Baixa o PDF
↓
Extrai texto e tabelas
↓
Usa parser, regex ou IA
↓
Transforma em dados estruturados
↓
Salva no banco
```

Esse é um ótimo cenário para plataforma de inteligência pública.

**Nível de dificuldade:** médio  
**Valor para plataforma:** muito alto  
**Exemplo de uso:** editais, atas, contratos, anexos, relatórios públicos.

---

### 3. API que entrega catálogo de arquivos

Exemplo: dados.gov.br, portais CKAN e portais de dados abertos.

Resposta típica:

```json
{
  "nome": "Relação de Empresas",
  "formato": "CSV",
  "url": "https://dados.gov.br/dataset/arquivo.csv"
}
```

A plataforma pode baixar:

- CSV
- XLSX
- ZIP
- PDF
- XML
- JSON
- HTML

Depois, processa cada formato com o extrator correto.

**Nível de dificuldade:** médio  
**Valor para plataforma:** alto  
**Exemplo de uso:** bases de CNPJ, compras, estatísticas, dados econômicos, dados setoriais.

---

### 4. Não tem API, mas tem página pública com documentos

Esse é o caso de muitos órgãos públicos, inclusive vários portais de leilão.

A página pública pode ter:

```text
Edital.pdf
Anexo I.pdf
Fotos.zip
Relação de lotes.html
Ata.pdf
Contrato.pdf
```

Mesmo sem API oficial, a plataforma pode usar um crawler/scraper controlado:

```text
Acessa a página pública
↓
Lê o HTML
↓
Encontra links de PDFs, ZIPs e anexos
↓
Baixa os documentos
↓
Extrai texto, tabelas e imagens
↓
Normaliza os dados
↓
Salva no banco
↓
Gera relatório
```

**Nível de dificuldade:** médio a alto  
**Valor para plataforma:** muito alto  
**Exemplo de uso:** leilões, editais antigos, anexos, páginas sem API.

---

## Formatos que sua plataforma precisa suportar

### PDF

Pode conter texto real ou imagem escaneada.

Ferramentas úteis:

- `pdfplumber`
- `pymupdf`
- `pypdf`
- `ocrmypdf`
- `tesseract`
- Google Document AI
- AWS Textract
- Azure Document Intelligence

### CSV

Formato mais fácil de processar.

Ferramentas úteis:

- `pandas`
- `csv`
- DuckDB
- Polars

### XLSX

Planilhas públicas.

Ferramentas úteis:

- `openpyxl`
- `pandas`
- LibreOffice headless, em casos específicos

### ZIP

Geralmente contém vários arquivos dentro.

Fluxo:

```text
Baixar ZIP
↓
Descompactar
↓
Identificar arquivos internos
↓
Processar PDF, CSV, XLSX, XML ou imagens
```

### XML

Muito comum em dados públicos e fiscais.

Ferramentas úteis:

- `lxml`
- `xmltodict`
- parsers nativos

### JSON

Melhor formato para API moderna.

Ferramentas úteis:

- parser nativo da linguagem
- validação com schema

### HTML

Páginas públicas sem API.

Ferramentas úteis:

- `BeautifulSoup`
- `Playwright`
- `Cheerio`
- `Puppeteer`

---

## O que dá para extrair de um edital de leilão

De um edital público, sua plataforma pode extrair:

- Número do edital
- Órgão responsável
- Cidade
- UF
- Data de publicação
- Data de visitação
- Data do leilão
- Horário de abertura
- Local de retirada
- Regras de participação
- Documentos exigidos
- Lotes
- Descrição dos bens
- Valor mínimo
- Incremento mínimo
- Condições de pagamento
- Prazo de retirada
- Penalidades
- Telefones
- E-mails
- Endereços
- CNPJ ou CPF, quando publicado legalmente
- Links dos anexos
- Fotos dos lotes, quando disponíveis

---

## O que dá para extrair de contratos públicos

De contratos e aditivos:

- Contratante
- Contratada
- CNPJ da contratada
- Objeto do contrato
- Valor
- Vigência
- Data de assinatura
- Número do processo
- Modalidade da contratação
- Fiscal do contrato
- Fonte orçamentária
- Aditivos
- Reajustes
- Prorrogações
- Sanções
- Arquivos relacionados

---

## O que dá para extrair de planilhas públicas

De CSV/XLSX:

- Empresas
- CNPJs
- Endereços
- CNAEs
- Valores
- Datas
- Órgãos
- Municípios
- UFs
- Situação
- Códigos de itens
- Descrição de produtos/serviços
- Quantidades
- Preços unitários
- Preços totais

---

## Fluxo ideal da plataforma

```text
1. Fonte pública
   API, CKAN, site de órgão, portal de leilão, PNCP, dados.gov.br etc.

2. Coletor
   Busca novos registros e documentos.

3. Downloader
   Baixa PDF, CSV, XLSX, ZIP, XML, JSON e HTML.

4. Armazenamento bruto
   Guarda o arquivo original sem mexer.

5. Extrator
   Extrai texto, tabelas, imagens e metadados.

6. OCR
   Usado quando o PDF é imagem escaneada.

7. IA estruturadora
   Transforma documento bagunçado em JSON limpo.

8. Banco de dados
   Salva entidades como empresas, editais, lotes, contratos, órgãos e valores.

9. Motor de busca
   Permite buscar por CNPJ, palavra-chave, setor, cidade, órgão e valor.

10. Relatório para cliente
    Gera resumo, oportunidade, risco, alerta e recomendação.
```

---

## Exemplo prático: leilão da Receita Federal

### Entrada

Página pública com edital:

```text
https://exemplo.gov.br/leiloes/edital-01-2026.pdf
```

### Processo

```text
Acessa página do leilão
↓
Encontra edital PDF
↓
Baixa edital
↓
Extrai texto
↓
Identifica lotes
↓
Pega valores mínimos
↓
Pega datas
↓
Pega regras
↓
Classifica oportunidades
↓
Gera relatório
```

### Saída para o cliente

```text
Leilão Receita Federal - São Paulo

Data: 25/06/2026
Órgão: Receita Federal
Tipo: Mercadorias apreendidas
Total de lotes: 73
Lotes interessantes: 14

Maior oportunidade:
Lote 22
Valor mínimo: R$ 18.500
Margem estimada: 35% a 80%

Riscos:
- Retirada em prazo curto
- Necessidade de transporte próprio
- Pagamento à vista
- Possível lote misto com itens de revenda difícil

Documentos exigidos:
- CPF ou CNPJ
- Certificado digital
- Regularidade fiscal, quando aplicável
```

---

## Estrutura de banco recomendada

### Tabela `sources`

```sql
CREATE TABLE sources (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  base_url TEXT,
  government_level TEXT,
  agency TEXT,
  access_type TEXT,
  status TEXT,
  created_at TIMESTAMP DEFAULT now()
);
```

### Tabela `documents`

```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY,
  source_id UUID REFERENCES sources(id),
  title TEXT,
  document_type TEXT,
  original_url TEXT,
  file_path TEXT,
  file_hash TEXT,
  published_at DATE,
  downloaded_at TIMESTAMP,
  extraction_status TEXT,
  created_at TIMESTAMP DEFAULT now()
);
```

### Tabela `document_extractions`

```sql
CREATE TABLE document_extractions (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  raw_text TEXT,
  structured_json JSONB,
  confidence NUMERIC,
  extracted_at TIMESTAMP DEFAULT now()
);
```

### Tabela `entities`

```sql
CREATE TABLE entities (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  entity_type TEXT,
  name TEXT,
  cnpj TEXT,
  cpf_hash TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT now()
);
```

### Tabela `opportunities`

```sql
CREATE TABLE opportunities (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  title TEXT,
  category TEXT,
  estimated_value NUMERIC,
  minimum_bid NUMERIC,
  risk_score NUMERIC,
  opportunity_score NUMERIC,
  summary TEXT,
  created_at TIMESTAMP DEFAULT now()
);
```

---

## Pipeline técnico recomendado

```text
Scheduler
↓
Source connector
↓
Document discovery
↓
Download queue
↓
File storage
↓
Parser selector
↓
Text extraction
↓
Table extraction
↓
OCR fallback
↓
AI structuring
↓
Validation
↓
Database persistence
↓
Search indexing
↓
Report generation
↓
User notification
```

---

## Regras de extração

### Para PDFs normais

```text
Usar parser textual primeiro.
Se o texto vier limpo, não usar OCR.
```

### Para PDFs escaneados

```text
Detectar baixa quantidade de texto.
Rodar OCR.
Salvar texto extraído.
Marcar confiança menor.
```

### Para tabelas

```text
Tentar extrair com pdfplumber/Camelot.
Se falhar, usar IA visual ou OCR tabular.
```

### Para ZIP

```text
Baixar.
Descompactar.
Processar cada arquivo interno separadamente.
Manter vínculo com o documento original.
```

### Para HTML

```text
Extrair título.
Extrair links.
Extrair datas.
Extrair tabelas.
Detectar PDFs e anexos.
Salvar snapshot da página.
```

---

## Cuidados obrigatórios

### 1. LGPD

Dados públicos não significam uso livre sem critério.

Cuidado especial com:

- CPF
- CNH
- dados de saúde
- dados judiciais
- dados de menores
- dados biométricos
- endereço residencial
- informações sensíveis

### 2. Robots.txt e termos de uso

Antes de raspar página pública, verificar:

- robots.txt
- termos de uso
- limites de requisição
- existência de API oficial
- exigência de autenticação

### 3. Rate limit

Nunca fazer scraping agressivo.

Use:

- filas
- cache
- intervalo entre requisições
- identificação do user-agent
- logs
- retry com backoff

### 4. Arquivo original

Sempre guardar o arquivo bruto original.

Motivos:

- auditoria
- reprocessamento
- validação
- prova de origem
- melhoria futura do parser

### 5. Versionamento

O mesmo edital ou contrato pode mudar.

Salvar:

- data da coleta
- hash do arquivo
- versão
- URL original
- diferenças entre versões

---

## Modelo de JSON final para edital

```json
{
  "document_type": "auction_notice",
  "source": "Receita Federal",
  "title": "Edital de Leilão nº 01/2026",
  "published_at": "2026-06-12",
  "auction_date": "2026-06-25",
  "agency": "Receita Federal",
  "city": "São Paulo",
  "state": "SP",
  "lots": [
    {
      "lot_number": "22",
      "description": "Mercadorias apreendidas diversas",
      "minimum_bid": 18500,
      "estimated_margin_percent": {
        "min": 35,
        "max": 80
      },
      "risk_notes": [
        "Retirada em prazo curto",
        "Pagamento à vista",
        "Necessidade de transporte próprio"
      ]
    }
  ],
  "required_documents": [
    "CPF ou CNPJ",
    "Certificado digital",
    "Regularidade fiscal quando aplicável"
  ],
  "contacts": {
    "emails": [],
    "phones": []
  },
  "source_url": "https://exemplo.gov.br/leiloes/edital-01-2026.pdf"
}
```

---

## Conclusão

A API normalmente não extrai o documento por você.

Ela faz uma destas coisas:

1. Entrega o dado pronto.
2. Entrega o link do documento.
3. Entrega um catálogo de arquivos.
4. Nem existe, e você precisa coletar a página pública.

A plataforma robusta precisa suportar tudo:

```text
API + PDF + CSV + XLSX + ZIP + XML + JSON + HTML
```

O jogo real não é só “ter API”.

O jogo é transformar informação pública bagunçada em inteligência comercial, alerta, ranking, score e relatório pronto para decisão.

Essa é a diferença entre um buscador público e um produto vendável.
