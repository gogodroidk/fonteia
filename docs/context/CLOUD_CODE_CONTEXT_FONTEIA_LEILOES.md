# Contexto Permanente para Cloud Code - Fonte.ia Leiloes

Este arquivo e o contexto de trabalho para agentes de codigo no projeto **Fonte.ia by Olli**.

Use este documento antes de qualquer alteracao relevante no frontend, no modulo de Leiloes, na camada de dados, na experiencia de IA, no design ou no fluxo de produto.

## Como usar este arquivo

Quando iniciar uma sessao no Cloud Code, Codex, Claude Code ou outro agente, use uma instrucao como:

```txt
Leia primeiro `docs/context/CLOUD_CODE_CONTEXT_FONTEIA_LEILOES.md` e siga esse contexto como fonte principal para planejar e executar as proximas tarefas do Fonte.ia. Nao migre a stack, nao recomece o projeto e nao quebre o deploy atual.
```

## Resumo executivo

O Fonte.ia e um SaaS de inteligencia em dados publicos brasileiros.

O primeiro modulo comercial e **Leiloes**, com foco em pessoas leigas, revendedores, compradores de oportunidade, advogados e escritorios que precisam entender rapidamente se um lote merece investigacao.

A promessa do produto nao e apenas listar leiloes. A promessa e transformar dados oficiais, edital, prazo, valor minimo, elegibilidade, risco e evidencia em uma decisao clara.

Frase guia:

```txt
Leiloes judiciais sem achismo.
```

Subpromessa:

```txt
O Fonte.ia cruza dados oficiais, edital, prazo, valor minimo e evidencias para mostrar quais lotes merecem sua atencao.
```

O produto deve fazer o usuario pensar:

```txt
Agora eu entendi esse lote.
```

E depois:

```txt
Quero salvar esse alerta antes de perder a oportunidade.
```

## Estado atual do projeto

O projeto ja possui:

- Monorepo com pnpm + Turborepo.
- Frontend em React 19 + Vite + TypeScript.
- Supabase configurado.
- Cloudflare servindo `apps/web/dist` como SPA.
- Landing page.
- Login.
- Onboarding.
- Cockpit.
- Busca.
- Conta.
- Planos.
- Paginas legais.
- Cookie banner.
- PWA.
- Catalogo de fontes.
- Modulos visiveis e travados.
- Modulo Leiloes ativo.
- Estrutura de evidencia rastreavel.
- Conector inicial da Receita Federal SLE.
- Score inicial de oportunidade.
- Fallback de dados na ordem API, Supabase e sample.

## Stack atual

Nao trocar esta stack sem autorizacao explicita.

```txt
pnpm
Turborepo
React 19
Vite
TypeScript
Supabase
Cloudflare Workers / assets SPA
Lucide React
Pacotes internos @fonteia/*
```

Arquivos importantes ja existentes:

```txt
package.json
pnpm-workspace.yaml
turbo.json
wrangler.jsonc
apps/web/package.json
apps/web/src/App.tsx
apps/web/src/app/page.tsx
apps/web/src/app/landing/page.tsx
apps/web/src/app/search/page.tsx
apps/web/src/app/leiloes/lot-detail-page.tsx
apps/web/src/data/fonteia-client.ts
apps/web/src/data/leiloes.ts
apps/web/src/auth/auth-context.tsx
apps/web/src/auth/supabase-client.ts
packages/domain/src/modules.ts
packages/domain/src/evidence.ts
packages/sources/src/catalog.ts
packages/sources/src/connectors/receita-leiloes.ts
packages/scoring/src/leiloes.ts
packages/ai/src/answer-engine.ts
packages/ai/src/prompts.ts
apps/api/src/routes/ask.ts
apps/api/src/routes/leiloes.ts
```

## Regra principal

Nao recomece o projeto do zero.

Nao migre para Next.js.

Nao quebrar:

- login;
- Supabase;
- Cloudflare;
- onboarding;
- landing;
- paginas legais;
- PWA;
- build atual do web;
- deploy atual.

O objetivo e evoluir o MVP atual para um SaaS vendavel, confiavel e premium.

## Diagnostico objetivo

### O que esta bom

A arquitetura geral esta boa. O monorepo separa apps, packages e services.

A tese do produto e forte: dados publicos, fonte oficial, decisao inteligente.

A estrutura de evidencia esta no caminho certo. Cada afirmacao importante deve apontar fonte, data, link, quote, hash quando houver e nivel de confianca.

O modulo Leiloes ja existe e e o melhor ponto de entrada comercial.

O catalogo de fontes ja mapeia status, confiabilidade, risco comercial e modulos.

A Receita Federal SLE ja possui conector inicial, mas e fonte fragil por usar endpoint operacional nao documentado.

O score de oportunidade ja existe, mas ainda e simplificado.

### O que esta fraco

O visual ainda parece MVP, nao SaaS premium.

O `App.tsx` concentra responsabilidade demais: auth, onboarding, shell, sidebar, roteamento manual, alertas e paginas.

A rota de detalhe do lote depende de estado local `selectedLot`. Se atualizar a pagina, o detalhe pode se perder.

A busca e a IA ainda usam comportamento de demo quando a API nao esta disponivel.

O fallback para sample pode mascarar falhas de dados reais.

O dashboard ainda parece painel inicial, nao cockpit de decisao.

A tela de lote ainda parece ficha tecnica, nao raio-x de decisao.

A API Node existe, mas o deploy principal atual serve o frontend estatico.

## Principios de produto

### 1. Dados reais primeiro

Se o dado for real, mostrar claramente:

- fonte;
- data de coleta;
- status da fonte;
- link original;
- evidencia;
- hash quando existir;
- confianca.

Se o dado for demo, mostrar aviso explicito.

Nunca permitir que o usuario confunda amostra com dado real.

### 2. Leigo primeiro

O usuario quer responder perguntas simples:

```txt
Vale a pena?
Qual o risco?
Quanto custa?
Pessoa fisica pode participar?
Ate quando?
Onde esta a prova?
Qual e o proximo passo?
```

A interface deve responder isso sem exigir leitura tecnica.

### 3. Produto de decisao

O dashboard nao deve ser apenas lista de lotes.

Ele deve mostrar:

- oportunidades quentes;
- prazos proximos;
- lotes baratos;
- lotes que permitem PF;
- lotes com risco alto;
- fontes sincronizadas;
- acoes recomendadas.

### 4. Evidencia sempre visivel

Toda afirmacao importante deve ter fonte.

A interface deve reforcar:

```txt
Isso veio daqui.
```

### 5. Nao inflar o projeto

Nao implementar todos os modulos agora.

Nao criar features gigantes.

Nao adicionar dependencias desnecessarias.

Nao colocar 3D pesado agora.

Prioridade absoluta: tornar Leiloes vendavel.

## Direcao visual

O visual deve comunicar:

```txt
SaaS premium
Confianca juridica
Dados oficiais
Clareza para leigos
Pouca animacao
Alto contraste
Cards limpos
Dashboard forte
```

Evitar:

```txt
Template generico
Excesso de gradiente
3D pesado
Animacao sem funcao
Tela parecida com cassino
Texto tecnico demais
Dashboard falso demais
```

Referencias permitidas para orientar design:

```txt
shadcn/ui como base conceitual de design system
Tremor ou Recharts para dashboard e graficos
Aceternity UI para hero, cards e secoes premium
Magic UI para blocos de landing
Spline apenas futuramente e de forma pontual
```

Nao instalar tudo sem necessidade. Primeiro organizar o produto.

## Objetivo principal da proxima etapa

Transformar o MVP atual em um **Fonte.ia Leiloes Alpha vendavel**.

Fluxo principal que precisa ficar bom:

```txt
landing -> login -> onboarding -> cockpit de leiloes -> abrir lote -> entender score/risco/evidencia -> criar alerta -> voltar para oportunidades
```

## Plano de execucao

### Fase 1: rota real para detalhe de lote

Problema atual:

```txt
/app/lote
```

depende de estado local.

Objetivo:

```txt
/app/leiloes/:lotId
```

Exemplo:

```txt
/app/leiloes/200100-1-2026-136
```

Requisitos:

- Clicar em um lote navega para `/app/leiloes/{lotId}`.
- Atualizar a pagina nao perde o lote.
- URL direta funciona.
- Lote inexistente mostra erro amigavel.
- Loading mostra skeleton.
- Se carregar sample, mostrar aviso de demo.

Arquivos provaveis:

```txt
apps/web/src/App.tsx
apps/web/src/lib/use-pathname.ts
apps/web/src/app/leiloes/lot-detail-page.tsx
apps/web/src/data/fonteia-client.ts
```

Criterio de aceite:

```txt
Usuario consegue abrir um lote por URL direta e o app busca o lote por ID.
```

### Fase 2: camada central de API

Problema atual:

Chamadas `fetch` estao espalhadas pelo frontend.

Objetivo:

Criar camada unica de acesso a dados.

Criar:

```txt
apps/web/src/lib/api-client.ts
apps/web/src/features/leiloes/leiloes-api.ts
```

Funcoes desejadas:

```ts
listLeilaoLots()
getLeilaoLotById(lotId: string)
getLeilaoLotScore(lotId: string)
```

Padrao de retorno:

```ts
source: "api" | "supabase" | "sample"
isDemo: boolean
message: string
```

Requisitos:

- Resolver `VITE_API_URL` em um lugar so.
- Tratar erro HTTP.
- Tratar erro de rede.
- Nao engolir falhas silenciosamente.
- Padronizar fallback API -> Supabase -> sample.
- Sempre indicar origem dos dados.

Criterio de aceite:

```txt
Telas importantes nao fazem fetch cru sem passar pela camada central.
```

### Fase 3: modo demo explicito

Problema:

Sample/demo pode parecer dado real.

Objetivo:

Criar aviso visual claro.

Criar:

```txt
apps/web/src/components/demo-data-banner.tsx
```

Texto sugerido:

```txt
Modo demonstracao: estes dados sao amostras e nao devem ser usados para decisao real. Conecte a API ou aguarde sincronizacao da fonte oficial.
```

Usar em:

- dashboard;
- lista de lotes;
- detalhe do lote;
- busca/IA;
- dossie/exportacao.

Criterio de aceite:

```txt
Usuario nunca confunde dado sample com dado real.
```

### Fase 4: cockpit de Leiloes

Objetivo:

Transformar dashboard em central de decisao.

Layout desejado:

```txt
Topo:
- titulo: Radar de Leiloes
- subtitulo simples
- status da ultima coleta
- fonte em uso

KPIs:
- lotes monitorados
- prazos proximos
- pessoa fisica permitida
- ticket medio
- oportunidades com score alto
- fontes verificadas

Area principal:
- lista ou tabela de oportunidades
- filtros
- ordenacao

Area lateral:
- status da fonte
- evidencias
- alertas
- proximas acoes
```

Tabela/lista minima:

```txt
Lote
Cidade
Valor minimo
Prazo
PF/PJ
Score
Risco
Fonte
Acao
```

Filtros minimos:

```txt
Buscar por edital/cidade
Valor maximo
PF permitido
Risco
Prazo proximo
Score minimo
```

Arquivos provaveis:

```txt
apps/web/src/app/page.tsx
apps/web/src/features/leiloes/components/leiloes-dashboard.tsx
apps/web/src/features/leiloes/components/leilao-lot-table.tsx
apps/web/src/features/leiloes/components/leilao-kpi-card.tsx
apps/web/src/features/leiloes/components/leilao-filters.tsx
```

Criterio de aceite:

```txt
Dashboard deve parecer uma ferramenta de decisao, nao apenas uma lista bonita.
```

### Fase 5: tela de lote como raio-x

Objetivo:

Transformar detalhe do lote em tela matadora.

A tela precisa responder rapidamente:

```txt
Vale a pena investigar?
Por que?
Qual o risco?
Qual o prazo?
Pessoa fisica pode participar?
Quanto posso pagar?
Onde esta a prova?
Qual o proximo passo?
```

Estrutura recomendada:

```txt
Header:
- voltar
- edital
- lote
- cidade
- status da fonte
- criar alerta
- exportar dossie

Resumo:
- texto simples explicando se o lote parece bom, medio ou arriscado

Cards principais:
- score de oportunidade
- score de risco
- valor minimo
- lance maximo sugerido
- prazo
- elegibilidade PF/PJ

Checklist:
- verificar retirada
- verificar custos extras
- verificar restricoes do edital
- comparar preco de mercado
- confirmar prazo na fonte oficial

Evidencias:
- fonte oficial
- URL
- data de coleta
- quote
- hash
- confianca

Perguntas rapidas:
- vale a pena?
- pessoa fisica pode participar?
- qual o risco?
- ate quando posso propor?
- qual valor maximo sugerido?
```

Componentes sugeridos:

```txt
apps/web/src/features/leiloes/components/lot-decision-summary.tsx
apps/web/src/features/leiloes/components/lot-risk-panel.tsx
apps/web/src/features/leiloes/components/lot-metrics-grid.tsx
apps/web/src/features/leiloes/components/lot-checklist.tsx
apps/web/src/features/leiloes/components/lot-evidence-card.tsx
apps/web/src/features/leiloes/components/lot-quick-questions.tsx
```

Exemplos de copy:

Ruim:

```txt
Elegibilidade: PF e PJ
```

Melhor:

```txt
Pessoa fisica pode participar deste lote.
```

Ruim:

```txt
Risco: alto
```

Melhor:

```txt
Risco alto: prazo curto ou valor elevado exige validacao manual antes de qualquer proposta.
```

Criterio de aceite:

```txt
Um leigo entende o lote em ate 10 segundos.
```

### Fase 6: IA guiada e honesta

Objetivo:

Evitar chat generico ruim.

Comecar com perguntas guiadas.

Perguntas rapidas:

```txt
Esse lote vale a pena?
Quais riscos eu devo verificar?
Pessoa fisica pode participar?
Qual e o prazo?
Qual e o lance maximo sugerido?
Quais evidencias sustentam isso?
```

Ao clicar, enviar:

```txt
question
lotId
module=leiloes
```

Se IA real nao estiver conectada:

```txt
IA em modo demonstracao. Esta resposta mostra o formato esperado, mas ainda nao usa o motor real.
```

Se nao houver evidencia:

```txt
Nao ha evidencia suficiente para responder com seguranca.
```

Regras:

- Nao inventar.
- Nao dar parecer juridico.
- Nao automatizar lance.
- Nao fingir ser orgao publico.
- Toda resposta factual real precisa de evidencia.

Criterio de aceite:

```txt
Nenhuma resposta parece real se estiver em demo. Toda resposta real tem evidencia.
```

### Fase 7: status de fontes

Objetivo:

Dar transparencia.

Criar componente:

```txt
apps/web/src/components/source-health-card.tsx
```

Mostrar:

```txt
Receita Federal SLE
Status: operacional fragil
Ultima coleta: data/hora
Registros encontrados
Registros novos
Fonte oficial: sim
Endpoint documentado: nao
```

Texto sugerido:

```txt
Esta fonte e oficial, mas o endpoint usado e operacional e nao documentado. O Fonte.ia usa cache e evidencia para reduzir risco.
```

Criterio de aceite:

```txt
Usuario sabe de onde veio o dado e se a fonte esta estavel ou fragil.
```

### Fase 8: alertas uteis

Objetivo:

Transformar o botao de alerta em algo mais real.

Tipos minimos:

```txt
Prazo de proposta
Sessao do leilao
Mudanca no lote
Novo lote parecido
```

Canais no MVP:

```txt
No app
E-mail em breve
WhatsApp em breve
```

Nao prometer WhatsApp real se nao existir.

Se alerta ainda for simulado, mostrar como alpha/demo.

Criterio de aceite:

```txt
Botao de alerta nao pode parecer recurso final se ainda for simulado.
```

### Fase 9: landing mais vendedora

Problema:

Landing atual fala de dados publicos e IA de forma boa, mas ainda generica.

Nova narrativa:

```txt
Leiloes judiciais sem achismo.
```

Subheadline:

```txt
O Fonte.ia cruza dados oficiais, edital, prazo, valor minimo e evidencias para mostrar quais lotes merecem sua atencao.
```

CTAs:

```txt
Ver oportunidades
Criar conta gratis
```

Estrutura:

```txt
1. Hero com dashboard real
2. Dor do usuario
3. Como o Fonte.ia resolve
4. Exemplo visual de lote
5. Evidencia rastreavel
6. Para quem e
7. Planos
8. FAQ
9. CTA final
```

Dor:

```txt
Editais sao confusos.
Dados estao espalhados.
Prazos passam rapido.
Riscos ficam escondidos.
Leigos dependem de achismo.
```

Solucao:

```txt
Radar de lotes
Score de oportunidade
Resumo simples
Fonte oficial
Alertas de prazo
Dossie exportavel
```

Criterio de aceite:

```txt
Landing vende Leiloes primeiro. Plataforma modular aparece como expansao, nao como confusao.
```

### Fase 10: design system local

Objetivo:

Preparar UI premium sem bagunca.

Componentes base sugeridos:

```txt
apps/web/src/components/ui/button.tsx
apps/web/src/components/ui/card.tsx
apps/web/src/components/ui/badge.tsx
apps/web/src/components/ui/input.tsx
apps/web/src/components/ui/select.tsx
apps/web/src/components/ui/tabs.tsx
apps/web/src/components/ui/modal.tsx
apps/web/src/components/ui/table.tsx
apps/web/src/components/ui/skeleton.tsx
apps/web/src/components/ui/empty-state.tsx
apps/web/src/components/ui/error-state.tsx
```

Componentes de produto:

```txt
EvidenceCard
SourceStatusBadge
RiskBadge
ScoreRing
MetricCard
AuctionLotCard
AuctionLotTable
DemoDataBanner
SourceHealthCard
```

Criterio de aceite:

```txt
Componentes repetidos deixam de ser recriados manualmente em cada tela.
```

## Ordem de commits recomendada

### Commit 1

```txt
refactor(web): add leiloes route by lot id
```

Inclui:

- rota `/app/leiloes/:lotId`;
- navegacao por ID;
- carregamento de lote por ID;
- loading/error/not found.

### Commit 2

```txt
refactor(web): centralize api client and data fallback
```

Inclui:

- `api-client.ts`;
- `leiloes-api.ts`;
- fallback padronizado;
- origem dos dados explicita.

### Commit 3

```txt
feat(web): add demo data warning states
```

Inclui:

- `DemoDataBanner`;
- uso no dashboard;
- uso no detalhe;
- uso na busca/IA.

### Commit 4

```txt
feat(leiloes): redesign cockpit dashboard
```

Inclui:

- KPIs;
- filtros;
- tabela/lista;
- cards de status.

### Commit 5

```txt
feat(leiloes): redesign lot decision page
```

Inclui:

- resumo de decisao;
- checklist;
- metricas;
- evidencias;
- perguntas rapidas.

### Commit 6

```txt
feat(web): improve landing for leiloes conversion
```

Inclui:

- nova headline;
- nova secao de dor;
- demo visual de lote;
- prova de evidencia;
- CTA mais direto.

### Commit 7

```txt
chore(web): improve ui primitives and visual consistency
```

Inclui:

- componentes base;
- skeletons;
- empty states;
- error states;
- padronizacao visual.

## Nao fazer agora

Nao migrar para Next.js.

Nao implementar todos os modulos.

Nao criar aplicativo mobile completo agora.

Nao colocar Spline/3D pesado agora.

Nao automatizar lance.

Nao pedir login gov.br.

Nao prometer parecer juridico.

Nao esconder modo demo.

Nao instalar muitas bibliotecas visuais.

Nao transformar o produto em apenas um chat bonito.

## Testes e validacao

Rodar quando possivel:

```bash
pnpm --filter @fonteia/web... build
pnpm --filter @fonteia/web typecheck
pnpm test
```

Se houver limitacao local por Windows, node_modules ou sandbox, documentar claramente.

Testes minimos desejados:

```txt
carregar dashboard
renderizar lotes
abrir detalhe por ID
mostrar demo banner quando source=sample
mostrar evidencia
renderizar estado vazio
renderizar estado de erro
```

## Definicao de pronto

O MVP melhorado estara pronto quando:

- usuario acessa o dashboard e entende os melhores lotes;
- usuario filtra oportunidades;
- usuario abre um lote por URL persistente;
- tela do lote mostra score, risco, prazo, valor, PF/PJ e evidencia;
- usuario sabe se dados sao reais ou demo;
- busca/IA nao inventa resposta sem fonte;
- alerta e claro sobre o que faz e o que ainda nao faz;
- landing vende Leiloes com clareza;
- visual parece SaaS serio;
- build do frontend passa;
- deploy Cloudflare continua funcionando.

## Prompt padrao para Cloud Code

Use este prompt quando quiser que o agente comece a trabalhar:

```txt
Leia `docs/context/CLOUD_CODE_CONTEXT_FONTEIA_LEILOES.md` antes de qualquer alteracao.

Depois analise a estrutura atual do projeto e comece pela Fase 1: rota real para detalhe de lote.

Antes de editar codigo, liste:
1. arquivos que pretende alterar;
2. riscos de quebrar deploy;
3. plano de commits pequenos;
4. como vai validar.

Nao migrar para Next.js.
Nao recomeçar o projeto.
Nao quebrar Supabase, login, onboarding, landing, paginas legais ou Cloudflare.

Prioridade:
rota real do lote -> camada de dados clara -> demo explicito -> cockpit util -> tela de lote forte -> IA honesta -> visual premium.
```

## Prompt para continuar depois de uma etapa

```txt
Continue seguindo `docs/context/CLOUD_CODE_CONTEXT_FONTEIA_LEILOES.md`.

Revise o que ja foi implementado, compare com a definicao de pronto e execute a proxima fase ainda nao concluida.

Mantenha commits pequenos, nao instale dependencias desnecessarias e nao esconda dados demo como se fossem reais.
```

## Prioridade absoluta

```txt
rota real do lote -> dados claros -> cockpit util -> tela de lote forte -> IA honesta -> visual premium
```

Nao fazer perfumaria antes de resolver o fluxo principal.
