# InfoSimples — Pacote Compliance & Idoneidade

_Última atualização: jun/2026. Documento técnico interno — não publicar._

---

## 1. Visão geral

O Pacote Compliance & Idoneidade é um conjunto de 9 consultas por CNPJ expostas na aba "Certidões & Idoneidade" do Dossiê da Fonte.ia. Cada consulta verifica uma dimensão de regularidade da empresa: cadastral, fiscal, trabalhista, previdenciária e de sanções. O resultado de cada certidão aparece como um semáforo — **regular / atenção / irregular** — produzindo uma visão consolidada de risco em segundos.

O fornecedor é a **InfoSimples**, um agregador pago que acessa sites de governo em nome do cliente (Receita Federal, TST, CEF, Transparência, TCU, MTE) e devolve os dados estruturados via API. A Fonte.ia o usa porque a grande maioria dessas fontes não oferece API oficial aberta: o único caminho programático é scraping ou um agregador pago confiável.

**Regra de ouro do pacote: premium sob demanda, nunca em massa.** As consultas só disparam quando um usuário de plano pago abre o Dossiê e solicita uma certidão — nunca em lote, nunca em background, nunca para usuários gratuitos. Cache de 60 dias compartilhado entre clientes derruba o custo marginal à medida que a base cresce.

---

## 2. Catálogo de consultas wired

Cada linha abaixo corresponde a um `kind` aceito pelo parâmetro `?kind=` da Edge Function `infosimples-proxy`. A coluna "endpoint InfoSimples" é o caminho POST a ser adicionado em `LOOKUPS` no momento da implementação de cada certidão.

| kind | Consulta InfoSimples | O que responde | Uso no produto |
|---|---|---|---|
| `receita-federal-cnpj` | Receita Federal — Cadastro CNPJ | Situação cadastral, data abertura, natureza jurídica, atividades, endereço, QSA | Cabeçalho do Dossiê; alimenta sócios no Cérebro |
| `receita-federal-simples` | Receita Federal — Simples Nacional | Enquadramento (SN/MEI), data de opção, situação | Regime tributário no Dossiê |
| `receita-federal-pgfn` | Receita Federal / PGFN — CND Federal | Certidão Negativa de Débitos federais (ou Positiva com Efeitos), validade | Semáforo fiscal federal |
| `tst-cndt` | TST — CNDT | Certidão Negativa de Débitos Trabalhistas; validade | Semáforo trabalhista |
| `caixa-fgts` | Caixa Econômica — CRF/FGTS | Certificado de Regularidade do FGTS; validade | Semáforo previdenciário/FGTS |
| `transparencia-ceis` | Portal Transparência — CEIS | Cadastro de Empresas Inidôneas e Suspensas; sanções, órgão, vigência | Semáforo sanções federais |
| `transparencia-cnep` | Portal Transparência — CNEP | Cadastro Nacional de Empresas Punidas; atos lesivos, multas | Semáforo anticorrupção |
| `tcu-inidoneo` | TCU — Inidôneos | Lista de inidôneos e suspensos do TCU | Semáforo TCU |
| `mte-trabalho-escravo` | MTE — Lista Suja | Cadastro de Empregadores com trabalho análogo ao escravo | Semáforo trabalhista grave |

O `kind` `inpi-marcas-cnpj` (marcas INPI por titular) já está wired e em produção; não faz parte do Pacote Compliance, mas compartilha a mesma infraestrutura.

---

## 3. Arquitetura & fluxo

O fluxo é sequencial e cada etapa é um gate de segurança. Falha em qualquer gate retorna erro sem gastar crédito.

```
┌─────────────────────────────────────────────────────────────────┐
│ apps/web  (Dossiê → aba "Certidões & Idoneidade")               │
│   fetch /functions/v1/infosimples-proxy                         │
│   headers: apikey: <publishable>                                │
│            Authorization: Bearer <sessão do usuário>           │
│   params:  ?kind=<kind>&cnpj=<14 dígitos>                       │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ supabase/functions/infosimples-proxy  (Deno Edge Function)      │
│                                                                 │
│  Gate 1 ─ apikey válida (header apikey = publishable key)       │
│  Gate 2 ─ INFOSIMPLES_TOKEN presente? → não: 200 configured:false │
│  Gate 3 ─ getVerifiedUserId (JWT de sessão válido)              │
│  Gate 4 ─ RPC my_plan → plano 'pro' ou 'corporativo'           │
│  Gate 5 ─ kind registrado em LOOKUPS                            │
│  Gate 6 ─ SUPABASE_URL + SERVICE_ROLE_KEY disponíveis          │
│                                                                 │
│  Cache-first ─ readCache(provider, kind, key) → TTL 60 dias    │
│    hit fresco  → resposta imediata, source: "cache", custo 0   │
│    miss / expirado → continua                                   │
│                                                                 │
│  Rate-limit usuário ─ userDayCount ≥ DAILY_PER_USER? → 429     │
│  Trava mensal ─ monthlyLiveCount ≥ MONTHLY_CAP? → 429 (fail-closed) │
│                                                                 │
│  callInfosimples(def.endpoint, token, params)                   │
│    → POST form-urlencoded; timeout configurável                 │
│    code 200/201 = sucesso; outro = erro de negócio              │
│                                                                 │
│  writeCache → external_lookups (upsert, service_role)           │
│  normalize  → { status, titulo, resumo, itens, siteReceipts }  │
│                                                                 │
│  Resposta: { ok, configured, source, kind, ...payload }         │
└──────────────┬──────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────┐
│ Supabase Postgres — tabela external_lookups                     │
│   índice único: (provider, lookup_kind, lookup_key)             │
│   campos: payload JSONB, fetched_at, source, requested_by       │
│   compartilhada entre todos os usuários/tenants                 │
└─────────────────────────────────────────────────────────────────┘
```

O contrato de resposta normalizada que o front consome é estável independentemente do kind:

```json
{
  "ok": true,
  "configured": true,
  "source": "cache" | "live",
  "kind": "<kind>",
  "status": "regular" | "atencao" | "irregular",
  "titulo": "Certidão Negativa de Débitos Trabalhistas",
  "resumo": "Sem débitos em <data>. Válida até <data>.",
  "itens": [...],
  "siteReceipts": [...],
  "cachedAt": "<ISO8601>"
}
```

Cada `LookupDef.normalize` no código é responsável por produzir esse shape a partir do envelope bruto da InfoSimples.

---

## 4. Custo & monetização

A InfoSimples opera em modelo pré-pago com franquia mínima de **R$100/mês** (saldo expira em 12 meses sem recarga). O preço por consulta cai com o volume:

| Volume mensal de consultas | Preço unitário |
|---|---|
| 1 – 500 | R$ 0,20 |
| 501 – 2.000 | R$ 0,10 |
| 2.001 – 10.000 | R$ 0,08 |
| 10.001 – 100.000 | R$ 0,05 |
| 100.001+ | R$ 0,05 (negociar contrato) |

Algumas consultas têm sobretaxa de R$0,02–0,18 dependendo da fonte (ex.: certidões que exigem acesso a sistemas autenticados de governo). Verifique a tabela atualizada em infosimples.com antes de projetar custos.

**Custo de um Dossiê completo (9 certidões, primeiro acesso):**

- Faixa 1–500: 9 × R$0,20 = **R$1,80** por empresa (pior caso)
- Faixa 10k+: 9 × R$0,05 = **R$0,45** por empresa
- Segundo acesso, mesma empresa, dentro de 60 dias: **R$0,00** (cache)

O cache é compartilhado entre todos os clientes por `(provider, lookup_kind, lookup_key)`. Se dois usuários em clientes diferentes consultam o mesmo CNPJ na mesma semana, o segundo acesso é grátis. Esse é o principal mecanismo de contenção de custo: empresas populares (grandes fornecedores, empreiteiras conhecidas) são consultadas gratuitamente pela maioria dos usuários.

**Cenários de custo mensal estimado:**

| Cenário | Consultas live/mês | Custo InfoSimples |
|---|---|---|
| Lançamento (10 clientes corporativos, 20 dossiês novos/mês) | ~180 | ~R$36 + franquia R$100 → total R$100 |
| Crescimento (50 clientes, 200 dossiês novos/mês) | ~1.800 | ~R$180 + franquia → total R$180 |
| Escala (200 clientes, 1.000 dossiês novos/mês) | ~6.000 (cache absorve ~70%) | ~R$480 |
| Teto default (400 live/mês — MONTHLY_CAP) | 400 | ≤ R$80 |

O Pacote Compliance justifica posicioná-lo como diferencial do plano **corporativo (R$597/mês)**. A diferença de receita por cliente entre o plano individual (R$197) e o corporativo (R$400) cobre com folga o custo de InfoSimples mesmo no pior cenário, desde que o cache funcione.

---

## 5. Trava de gasto & governança

Três secrets controlam o comportamento financeiro sem redeploy de código:

| Secret | Default | Efeito |
|---|---|---|
| `INFOSIMPLES_MONTHLY_CAP` | 400 | Teto de chamadas live por mês. Ao atingir, todas as consultas retornam 429 até o próximo ciclo. |
| `INFOSIMPLES_DAILY_PER_USER` | 20 | Limite de chamadas live por usuário nas últimas 24h. Acima disso, o usuário recebe 429. |
| `INFOSIMPLES_CACHE_TTL_DAYS` | 60 | Frescor do cache. Resultados mais velhos que esse valor são tratados como miss. |

**Semântica fail-closed vs. fail-open:**

A contagem mensal (`monthlyLiveCount`) é **fail-closed**: se o banco não responder, a função assume estouro e recusa a chamada. Nunca gastamos crédito sem conseguir contabilizar. O contrário vale para o rate-limit por usuário (`userDayCount`): é **fail-open**, porque a trava mensal global já protege o custo, e penalizar o usuário por instabilidade de infra seria ruim demais.

Para ajustar os limites sem redeploy: acesse Supabase Dashboard → Edge Functions → `infosimples-proxy` → Secrets. Alterações entram em vigor na próxima requisição.

---

## 6. Ativação (runbook)

A função nasce **dormente**: sem `INFOSIMPLES_TOKEN`, ela responde `{ ok: true, configured: false, source: "disabled" }` e o front mantém o comportamento atual (exibe dados da base ingerida). Nenhum custo incorre.

**Para ligar:**

1. Obtenha o token em infosimples.com (conta pré-paga, recarga mínima R$100).
2. Configure o secret via um dos dois caminhos (equivalentes em comportamento):
   - **Edge Secret (recomendado):** Supabase Dashboard → Settings → Edge Functions → Secrets → adicionar `INFOSIMPLES_TOKEN=<valor>`.
   - **Vault:** `INSERT INTO vault.secrets (name, secret) VALUES ('INFOSIMPLES_TOKEN', '<valor>')` via SQL ou MCP `execute_sql`. A função tenta o Vault se a env var estiver ausente.
3. Verifique: `GET /functions/v1/infosimples-proxy/health` com header `apikey: <publishable>`. A resposta deve conter `"configured": true` e listar os `kinds` disponíveis.
4. Opcionalmente ajuste `INFOSIMPLES_MONTHLY_CAP` e `INFOSIMPLES_DAILY_PER_USER` conforme o volume esperado.

**Atenção:** ativar a integração incorre na franquia mínima de **R$100/mês** a partir do primeiro mês com uso, independentemente do volume de consultas. Essa decisão é do dono do produto.

Para desligar sem alterar código: remova ou limpe o secret `INFOSIMPLES_TOKEN`. A função volta ao modo dormente imediatamente.

---

## 7. Rastreabilidade & LGPD

Cada chamada live ao InfoSimples retorna `site_receipts[]` no envelope — um array com as evidências de que a consulta foi feita no site oficial (URL, timestamp, hash da resposta bruta). Esses recibos são gravados junto ao payload em `external_lookups.payload.siteReceipts` e devem ser exibidos no Dossiê como atributo de fonte: "Dados via InfoSimples / [nome do órgão], consultado em [data]". Isso mantém a rastreabilidade exigida pelo princípio de evidência da plataforma — toda informação aponta para a fonte oficial.

**LGPD:** todas as 9 consultas do pacote operam sobre CNPJ (pessoa jurídica), não sobre CPF (pessoa física). Dados cadastrais de PJ em fontes oficiais são públicos por natureza (Lei 14.129/21, Portal da Transparência). Consultas por CPF — que a InfoSimples também oferece — envolvem dados sensíveis de pessoa natural e só devem ser avaliadas com parecer jurídico prévio e justificativa de legítimo interesse documentada. A arquitetura atual do proxy (`sanitizeCnpj` rejeita qualquer coisa diferente de 14 dígitos) já impede, por construção, que consultas de CPF passem pelos kinds do pacote compliance.

---

## 8. Roadmap de expansão

Cada nova consulta é +1 entrada no objeto `LOOKUPS` em `supabase/functions/infosimples-proxy/index.ts`. Não há mudança de arquitetura; o esforço é escrever o `build` (como montar a chave de cache e os params) e o `normalize` (como transformar `data[]` no contrato do front).

Consultas relevantes para fases seguintes, agrupadas por domínio:

**Judicial**
- `tjsp-processos-cnpj` — processos cíveis/criminais no TJSP por CNPJ
- `trf1-processos-cnpj` a `trf6-processos-cnpj` — processos federais por região
- `cnj-improbidade` — Cadastro Nacional de Condenados por Ato de Improbidade Administrativa

**Patrimônio & registros**
- `detran-restricoes-veiculo` — gravames, alienação fiduciária, recall (por placa/chassi)
- `arisp-matricula` — matrícula de imóvel no ARISP/SP (por número de matrícula)
- `jucesp-ficha-nire` — ficha cadastral e NIRE na Junta Comercial de SP
- `jucesp-socios` — quadro de sócios atualizado via Junta (complementa QSA da Receita)

**Ambiental & regulatório**
- `ibama-auto-infracao` — autos de infração ambiental por CNPJ
- `anatel-outorga` — outorgas e autorizações de telecomunicações

Prioridade de implementação sugerida: judicial (maior demanda de escritórios de advocacia e fundos que já usam o produto) > registros imobiliários (leilões de imóveis — módulo core) > ambiental (diferencial para o módulo ambiental já planejado).
