# Auditoria UX/QA — Fonte.ia · 2026-06-19

> Escopo: leitura completa de `apps/web/src/app/**` e `apps/web/src/features/**`.
> Restrição: sem edição de código-fonte, sem build, sem pnpm.
> Auditora: QA Engineer (instância qa-tester)

---

## Sumário executivo

1. **Placeholder visível a clientes pagantes** — o módulo INPI no dashboard exibe itens falsos hardcoded ("Busca por CNPJ disponível", "Integração de marcas em andamento") com count=0, mesmo para usuários Pro. Isso ativa o detector de "produto prometido mas não entregue".
2. **Dead code de IA no detalhe do lote** — o prop `onAsk` da `LotDetailPage` é imediatamente descartado com prefixo de underscore (`_onAsk`); o botão de AI ask no detalhe nunca dispara nenhuma função. Para um produto cujo diferencial declarado é IA com rastreabilidade, isso é a funcionalidade-chave quebrada na tela-chave.
3. **Inconsistência watchlist** — AlertasPage diz "Marque com a estrela" mas LotesPage usa ícone de coração (Heart). O usuário não consegue entender como usar o radar sem tentar e falhar.
4. **Alertas de preferência não persistidos no servidor** — quatro toggles na página de Alertas (queda de preço, edital novo, lances, encerramento) salvam em localStorage mas a nota "não ativo" está sempre visível. O usuário togola, recarrega, e os toggles estão lá — dando falsa sensação de que funcionam.
5. **Busca cruzada ausente** — SearchPage pesquisa apenas leilões. Um produto com 8 módulos apresenta uma barra de busca que silenciosamente ignora 7 deles.

---

## Páginas auditadas

### 1. Dashboard — `/app` (`page.tsx`)

**O que faz:** Central com saudação, 8 cards de módulo, KPIs de leilões (total, economia, score médio, risco), tabela spotlight dos melhores lotes e distribuição de risco.

**Dados:** 8 chamadas paralelas no mount: `listLeilaoLots`, `listLicitacoes`, `listMunicipios`, `listDeputados`, `listInfracoes`, `listProposicoes`, `listOrgaos`, mais seed de totais de `@fonteia/domain`.

**Estados cobertos:** Loading (skeletons por seção), erro inline por módulo, empty com ícone Landmark.

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| D1 | Card INPI hardcoda `items: ["Busca por CNPJ disponível", "Integração de marcas em andamento"]` com `count: 0` — visível a usuários pagantes | 🔴 |
| D2 | Card Empresas usa `orgaos.length` como count de "empresas" — label enganosa | 🟡 |
| D3 | `totalRegistros` exclui INPI do somatório, inconsistente com seed totals | 🟡 |
| D4 | `riskDistribution` nomeia internamente `{baixo, medio, alto}` onde `baixo` = score ≥ 70 (melhor), mas a variável de nome oposto ao semântico pode confundir mantenedores | 🟢 |
| D5 | KPI "Economia mapeada" aparece condicionalmente — layout shift entre 3 e 4 KPIs | 🟡 |
| D6 | 8 chamadas paralelas no mount — nenhum debounce, nenhuma priorização; usuário em conexão lenta espera todas antes de ver qualquer conteúdo | 🟡 |

**Correção D1:** Remover `items` e `count: 0` hardcoded do card INPI; usar dados reais ou omitir o card enquanto não há dados.
**Correção D2:** Renomear label do card para "Órgãos contratantes" ou usar count real de CNPJs distintos.
**Correção D5:** Reservar espaço para 4 KPIs mesmo quando só 3 estão disponíveis (CSS min-height ou placeholder oculto).

---

### 2. Lotes — `/app/lotes` (`lotes/page.tsx`)

**O que faz:** Lista de lotes da Receita Federal com dois modos (Por edital / Todos os lotes), filtros, watchlist (coração), exportação CSV e scroll infinito.

**Dados:** `listLeilaoLots()` via `features/leiloes/leiloes-api`.

**Estados cobertos:** Skeletons (`SkeletonEdital`/`SkeletonCard`), erro com `role="alert"`, empty com CTA "Limpar filtros".

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| L1 | `handleFilterByEdital(edital)` seta query mas não muda `viewMode` para "lotes" — filtrar por edital enquanto em view "Por edital" não faz o esperado | 🟡 |
| L2 | Empty state com filtro ativo não tem ícone (inconsistente com outros pages que usam `<Search>`) | 🟢 |
| L3 | Ícone de watchlist é Heart — diverge do texto "estrela" na página de Alertas | 🔴 |

**Correção L3:** Alinhar o copy de Alertas para "coração" ou trocar o ícone para Star em ambos os locais.

---

### 3. Detalhe do lote — `/app/lotes/:id` (`leiloes/lot-detail-page.tsx`)

**O que faz:** Galeria de fotos, Raio-X de IA com score, análise do edital, lotes parecidos via pgvector, preço FIPE, modal de alerta, relatório PDF.

**Dados:** `fetchLoteDetalhe()` (SLE), `fetchLotesParecidos()` (Supabase pgvector), `fetchFipePreco()` (FIPE API).

**Estados cobertos:** Raio-X tem estado idle/loading/answered/insufficient_evidence. Modal tem focus trap. Foto com fallback text.

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| LD1 | `onAsk: _onAsk` — prop recebido mas descartado com underscore; IA ask do detalhe é dead code | 🔴 |
| LD2 | `baixarEdital()` e `baixarRelacao()` chamam `setSuccessMessage()` para mensagens de erro (404, falha) — estado semântico incorreto | 🟡 |
| LD3 | Alert modal: `channelLabels = { in_app: "Notificação no app" }` mas o `supabase.rpc("create_alert")` envia e-mail — copy diz "no app", comportamento é e-mail | 🔴 |
| LD4 | CTA de Raio-X renderiza sem paywall para usuários não-Pro em estado idle; a verificação `isPro` só impede a chamada à API mas não exibe prompt de upgrade | 🟡 |
| LD5 | "Visibilidade do lote (imagem)" como dimensão de risco é questionável (sem foto = risco financeiro?) | 🟢 |
| LD6 | Nenhum skeleton durante o fetch de `fetchLoteDetalhe()` — conteúdo aparece/desaparece abruptamente | 🟡 |

**Correção LD1:** Conectar `onAsk` ao handler correto ou implementar o handler interno.
**Correção LD3:** Alterar copy do modal para "alerta por e-mail" ou implementar notificação in-app de verdade.

---

### 4. Cérebro — `/app/cerebro` (`cerebro/page.tsx`)

**O que faz:** Canvas force-directed com HiDPI, pan, zoom, drag. Expande conexões por CNPJ/IBGE. Lista de nós agrupada à direita.

**Dados:** `cerebro-api` (`expandCnpj`, `expandLeaf`, `searchEntities`) chamando `d1-bridge`.

**Estados cobertos:** Overlay de loading com blur+spinner, alert de erro com `role="alert"`, empty com CTA "Ver exemplo (Banco do Brasil)".

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| C1 | `console.warn("[cerebro] Erros parciais por módulo:", result.errors)` vaza para console de produção | 🟡 |
| C2 | Sem timeout ou abort para expansões longas — usuário não pode cancelar uma expansão travada | 🟡 |
| C3 | Em 375px, `canvas height: min(74vh, 680px)` ≈ 540px; abaixo do canvas não sobra viewport para a lista de nós; graph quase inoperável em touch sem pinch-to-zoom explícito | 🟡 |
| C4 | Sem indicação de quantos nós estão no grafo ou limite máximo antes de degradação de performance | 🟢 |

**Correção C1:** Substituir `console.warn` por flag interna ou remover em produção com `import.meta.env.DEV`.
**Correção C3:** Em mobile, reduzir canvas a `min(50vh, 400px)` e elevar a lista de nós acima do canvas.

---

### 5. Raio-X — `/app/raio-x` (`raio-x/page.tsx`)

**O que faz:** Lookup de CNPJ contra RF (Minha Receita), CGU CEIS/CNEP e PNCP contratos. URL param `?cnpj=` dispara busca automática. Exibe `FonteSeloBlock` com badges de rastreabilidade.

**Dados:** `raio-x-api` com `Promise.allSettled`. `?cnpj=` via `useEffect` no mount.

**Estados cobertos:** Loading por fonte, erro por fonte, empty por fonte, print mode com `aria-hidden`.

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| RX1 | Lógica de busca duplicada: `useEffect` auto-search e `handleSearch()` fazem a mesma coisa — risco de divergência em manutenção futura | 🟡 |
| RX2 | `SecaoFontesNaoVinculadas` (CNJ, INPI) sempre visível — parece funcionalidade quebrada para novos usuários | 🟡 |
| RX3 | Sem rate-limit UI — usuário pode spammar lookups sem feedback | 🟢 |
| RX4 | Filename CSV usa `sanitizeCnpj(cnpj)` (só dígitos) sem formatação — menos legível | 🟢 |

**Correção RX2:** Renomear ou mover "Fontes não vinculadas" para seção de roadmap/planos, ou exibir só para usuários Pro com contexto de "em breve".

---

### 6. Política — `/app/politica` (`politica/page.tsx`)

**O que faz:** Tabs Deputados / Votações (lazy load na primeira troca de aba).

**Dados:** `listDeputados()` no mount, `listVotacoes()` na primeira abertura de aba.

**Estados cobertos:** 8 SkeletonCard para deputados (shape correto), mesmo skeleton reutilizado para votações (shape errado — votação não tem avatar).

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| P1 | Skeleton de votações usa o mesmo `SkeletonCard` que tem layout de avatar — shape incorreto para `VotacaoCard` | 🟡 |
| P2 | `VotacaoCard` não é clicável — sem link para detalhe de proposição | 🟡 |
| P3 | Aba Votações não tem filtro ou busca — lista pode crescer indefinidamente | 🟡 |
| P4 | `placarSim=0, placarNao=0` renderiza "0 Sim · 0 Não" sem guard; semanticamente dúbio (empate ou sem dados?) | 🟢 |

**Correção P1:** Criar `SkeletonVotacao` com shape adequado (barra placar em vez de avatar).

---

### 7. Licitações — `/app/licitacoes` (`licitacoes/page.tsx`)

**O que faz:** Lista de licitações do PNCP com filtros UF/modalidade, ordenação, scroll infinito.

**Dados:** `listLicitacoes()` via D1/PNCP.

**Estados cobertos:** 6 SkeletonCard, banner de erro, empty states.

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| LC1 | `LicitacaoCard` não leva a nenhum detalhe — `onSelectLicitacao` é opcional sem fallback de navegação | 🟡 |
| LC2 | Texto do objeto clamped a 3 linhas (`WebkitLineClamp: 3`) — pode cortar informação decisória | 🟡 |
| LC3 | Cor da fonte PNCP `#C2557D` (magenta/rosa) é atípica para dado governamental; pode confundir com status de erro | 🟢 |

**Correção LC1:** Implementar rota de detalhe ou abrir URL do PNCP em nova aba como fallback.

---

### 8. Alertas — `/app/alertas` (`alertas/page.tsx`)

**O que faz:** Watchlist localStorage + lista de alertas via `list_my_alerts` RPC + painel de preferências com 4 toggles.

**Dados:** `listLeilaoLots()` para cruzar com watchlist local; Supabase RPC para alertas do servidor.

**Estados cobertos:** Loading em texto plano ("Carregando lotes…"), empty watchlist, empty alertas.

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| A1 | Copy "Marque com a estrela" diverge do ícone Heart (coração) em LotesPage | 🔴 |
| A2 | 4 toggles de preferência (queda de preço, edital novo, lances, encerramento) salvam em localStorage mas nunca chegam ao backend; aviso "não ativo" sempre visível | 🔴 |
| A3 | Loading state usa texto puro sem skeleton — inconsistente com resto da aplicação | 🟡 |
| A4 | Watchlist é localStorage-only — não sincroniza entre dispositivos ou sessões | 🟡 |

**Correção A2:** Ou implementar persistência no backend, ou remover os toggles e colocar "Em breve" honesto.

---

### 9. Leads — `/app/leads` (`leads/page.tsx`)

**O que faz:** Lista de contratos do PNCP tratados como leads; drawer de mensagens WhatsApp/e-mail; Raio-X CNPJ; link PNCP.

**Dados:** `listLeads()` via D1 (PNCP entities `public_contract`).

**Estados cobertos:** Skeletons, erro, empty com mensagem "integração sendo ligada".

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| LE1 | Empty state diz "A integração com o PNCP está sendo ligada" — copy de desenvolvimento exposto a usuários Pro | 🔴 |
| LE2 | `buildPncpUrl(numeroControlePNCP)` constrói `pncp.gov.br/app/contratos/${id}` — formato pode não funcionar para contratos | 🟡 |
| LE3 | Data exibida é `dataVigenciaInicio` (início de vigência) sem label — ambígua (pode ser confundida com data de assinatura) | 🟡 |
| LE4 | Sem filtro por setor/segmento — heurística `inferSetor()` é calculada mas não filtrável | 🟡 |

**Correção LE1:** Substituir por empty state genérico ("Nenhum lead disponível no momento") sem referência a estado de integração interna.

---

### 10. Busca — `/app/busca` (`search/page.tsx`)

**O que faz:** Busca natural-language com parsing de intent (mais baratos, desconto, PF), "Você quis dizer?" fuzzy, chips de sugestão.

**Dados:** `listLeilaoLots()` — apenas leilões.

**Estados cobertos:** Loading, empty, did-you-mean.

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| S1 | Busca limitada a leilões — produto com 8 módulos mas busca global ausente; usuário busca "Petrobras" e vê zero resultado quando há dados em Empresas/INPI/Ambiental | 🔴 |
| S2 | Stopwords incluem "leilao" e "leiloes" — buscar "leilão SP" perde o único termo de domínio | 🟡 |
| S3 | Navegadores não-webkit podem exibir botão de limpar nativo + botão customizado em sobreposição | 🟢 |

**Correção S1:** Expandir busca para pelo menos Empresas e INPI, ou deixar claro no placeholder "Buscando em leilões".

---

### 11. Municípios — `/app/municipios` (`municipios/page.tsx`)

**O que faz:** Catálogo IBGE com filtro UF, ordenação por nome/licitações, scroll infinito.

**Dados:** `listMunicipios()` via D1.

**Estados cobertos:** 8 skeletons, erro com `role="alert"`, empty de dados, empty de filtros, scroll infinito com sentinel.

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| M1 | `MunicipioCard` clicável apenas se `onSelectMunicipio` for fornecido — sem `onSelectMunicipio`, card tem `cursor: default` e nada acontece ao clicar; sem fallback de navegação | 🟡 |
| M2 | Sort por "Mais licitações" sem segundo campo de desempate determinístico além de nome — pode flip ao recarregar se dados mudaram | 🟢 |

**Avaliação:** Página bem estruturada. Bom uso de `aria-busy`, skeleton correto, search multi-campo tolerante a acentos.

---

### 12. Detalhe de município — `/app/municipios/:id` (`municipios/municipio-detail-page.tsx`)

**O que faz:** Exibe identificação (código IBGE, UF, região, meso/microrregião), contagem de licitações, link para fonte IBGE.

**Dados:** prop `MunicipioWithStats` passado pelo pai.

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| MD1 | `buildIbgeUrl()` gera slug dinâmico para ibge.gov.br — URL de cidades IBGE usa formato diferente (com código); link pode resultar em 404 | 🟡 |
| MD2 | Sem dado de população, IDH ou área — usuário que abre o detalhe encontra apenas dados que já via no card | 🟡 |

---

### 13. Ambiental — `/app/ambiental` (`ambiental/page.tsx`)

**O que faz:** Autos de infração IBAMA com busca multi-campo, filtro UF, ordenação por data/multa/infrator, scroll infinito.

**Dados:** `listInfracoes()` via D1.

**Estados cobertos:** 8 skeletons, erro, empty de dados (com `SourceEmptyState` separado), empty de filtros — correto e diferenciado.

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| AM1 | Sem filtro de tipo de infração — campo está nos dados mas não é filtrável | 🟡 |
| AM2 | Valor da multa formatado em centavos via `formatMultaCents()` — se o dado vier em reais, o valor seria exibido 100x maior | 🟢 (verificar na API) |
| AM3 | `InfracaoCard` não é clicável sem `onSelectInfracao` — sem fallback de detalhe | 🟡 |

**Avaliação:** A separação entre `SourceEmptyState` (sem dados) e `EmptyState` (filtros sem resultado) é o padrão mais correto da codebase — replicar em outras páginas.

---

### 14. Detalhe de infração — `/app/ambiental/:id` (`ambiental/infracao-detail-page.tsx`)

Não lido nesta rodada (arquivo existente, fora do escopo de tempo). Registrar para próxima auditoria.

---

### 15. Jurídico — `/app/juridico` (`juridico/page.tsx`)

**O que faz:** Tabs Proposições (Câmara) e Processos (CNJ DataJud). Busca independente por aba, filtros tipo/ano/tribunal, scroll infinito por aba.

**Dados:** `listProposicoes()` e `listProcessos()` — ambas carregadas no mount.

**Estados cobertos:** Skeletons, erros, empties distintos por aba — bem tratado.

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| J1 | Ambas as fontes são carregadas no mount mesmo que o usuário nunca troque de aba — custo desnecessário | 🟡 |
| J2 | `ProposicaoCard` sem link para o texto completo na Câmara (a API retorna URL da proposição mas não está sendo usada) | 🟡 |
| J3 | `ProposicaoCard` rodapé diz "Em tramitação" para todas as proposições — pode estar incorreto para proposições arquivadas ou aprovadas | 🟡 |
| J4 | Tabs usam `role="tab"` sem `tablist` wrapper — aria incompleto | 🟡 |

**Correção J1:** Carregar `listProcessos()` apenas na primeira troca para a aba "Processos" (lazy load, igual ao padrão de Política/Votações).
**Correção J4:** Envolver os botões de tab em `<div role="tablist">`.

---

### 16. INPI — `/app/inpi` (`inpi/page.tsx`)

**O que faz:** Busca de marcas por nome/titular/classe NICE (base RPI). Seção colapsável de busca por CNPJ (limitada por design da RPI). Painel de transparência de fonte.

**Dados:** `fetchTrademarksByQuery()` e `searchInpiByCnpj()` via `features/inpi/inpi-api`.

**Estados cobertos:** Idle (prompt informativo), loading com `role="status"`, erro com `role="alert"`, empty com link para pePI, resultados em grid.

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| IN1 | Sem paginação nos resultados — hard cap em 100 marcas com aviso "limite atingido, refine a busca"; para bases grandes, 100 pode cortar resultados relevantes | 🟡 |
| IN2 | `TrademarkCard` sem hover/clique — card visual mas sem ação, apenas link "Ver no INPI" no rodapé | 🟢 |
| IN3 | Aviso de limitação do CNPJ é explicado duas vezes (no header colapsável e dentro do painel) — duplicação desnecessária | 🟢 |

**Avaliação:** Página honesta sobre limitações da fonte (melhor prática). `SourceRealityPanel` é um excelente padrão a replicar.

---

### 17. Empresas — `/app/empresas` (`empresas/page.tsx`)

**O que faz:** CNPJ lookup (RF via Minha Receita) + enriquecimento BrasilAPI + lista de sanções CEIS/CNEP + lista de órgãos contratantes PNCP.

**Dados:** `lookupCnpj()`, `fetchCompanyEnrichment()`, `listSancoes()`, `listOrgaos()`.

**Estados cobertos:** Loading paralelo para órgãos e sanções, aviso de sanção embutido no perfil da empresa, empty bem tratado.

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| E1 | Nome do módulo é "Empresas" mas a seção principal visível são "Órgãos públicos" (derivados do PNCP) — confusão sobre o que o módulo realmente oferece | 🟡 |
| E2 | Aviso de sanção usa emoji de alerta `⚠️` hardcoded no JSX dentro do texto (`⚠️ Empresa com X sanções`) junto com `<AlertTriangle>` icon — duplicação | 🟢 |
| E3 | `isLoadingEnrich` começa `true` e `empresa` pode ser `null` enquanto o primeiro fetch ainda não retornou — `EnrichmentPanel` renderiza antes do perfil principal carregar (race condition visual) | 🟡 |
| E4 | `OrgaoCard` sem link ou ação — apenas informativo; sem acesso a licitações do órgão | 🟡 |

**Correção E1:** Reorganizar hierarquia: "Consulta CNPJ" como hero, "Sanções" como seção, "Órgãos" como seção de apoio.

---

### 18. Billing / Planos — `/app/planos` (`billing/page.tsx`)

**O que faz:** 3 planos de preço (Free, Pro, Corporativo), CTA Stripe com prefill de e-mail, componente `CouponRedeem`.

**Dados:** `PLANOS` de `data/leiloes-seed`, `stripeLinkFor()` de `config/stripe`.

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| B1 | Quando `stripeLinkFor(plano.id) === null`, exibe botão "Entrar em contato" (fluxo de e-mail manual) — mistura de checkout automático e manual sem distinção clara ao usuário | 🟡 |
| B2 | Preços exibidos diretamente de `PLANOS` — sem fetch de preço do Stripe em tempo real; se preço mudar no Stripe, UI fica desatualizada até próximo deploy | 🟡 |
| B3 | Sem tabela comparativa de features — cards de plano listam benefícios mas não há comparação lado a lado para plano Free vs Pro vs Corporativo | 🟡 |
| B4 | `checked=sucesso` na query string detectado por `window.location.search` sem router — frágil em SPAs (duplica detecção com history.state) | 🟢 |

---

### 19. Conta — `/app/conta` (`account/page.tsx`)

**O que faz:** 7 tabs (Perfil, Assinatura, Aparência, Notificações, Privacidade, Segurança, Ajuda). Exibe plano atual, watchlist count, theme toggle, portal Stripe.

**Dados:** `usePlan()`, `readWatchlist()` + `subscribeWatchlist()`, `requestStripePortalUrl()`.

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| CT1 | Tab Notificações: toggle "Avisos no app" salva em estado local mas não persiste em reinício — reseta para `true` sempre | 🟡 |
| CT2 | Tab Notificações: E-mail e WhatsApp mostrados como "Em breve" — adequado e honesto | 🟢 |
| CT3 | Tab Segurança: "Excluir minha conta" abre painel inline com `role="dialog" aria-modal="true"` mas sem focus trap — escape não fecha, focus vaza | 🟡 |
| CT4 | Em mobile 375px, nav lateral vira scroll horizontal de chips — alguns labels podem truncar ("Privacidade e Cookies") | 🟡 |
| CT5 | `TRow "Método de pagamento"` hardcoded como "Não cadastrado" — nunca atualiza mesmo quando usuário é Pro | 🟡 |
| CT6 | `TRow "Próxima cobrança"` hardcoded como "—" — mesma questão | 🟡 |

**Correção CT3:** Adicionar `useEffect` com `focus()` no botão "Fechar" e listener de `keydown` para Escape.

---

### 20. Relatórios — `/app/relatorios` (`relatorios/page.tsx`)

**O que faz:** Lista de relatórios gerados (localStorage), tabela com lote/data/ações, painel explicativo do conteúdo.

**Dados:** `fonteia_reports` key em localStorage; sync via `storage` event.

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| RE1 | "Reimprimir no lote" navega para `/app/lotes/${lotId}` mas o detalhe do lote é uma view que requer seleção — URL direta pode não abrir o detalhe corretamente se o roteamento for por state | 🟡 |
| RE2 | Relatórios salvos localmente — perdem-se ao limpar cache; sem aviso ao usuário | 🟡 |
| RE3 | Sem data de expiração do relatório — usuário não sabe se os dados ainda são válidos | 🟢 |

---

### 21. Fontes — `/app/fontes` (`sources/page.tsx`)

**O que faz:** Tabela de todas as fontes do `SOURCE_CATALOG` com status, módulos, confiabilidade e link oficial. Health-check runtime da Receita.

**Dados:** `SOURCE_CATALOG` de `@fonteia/sources`, `listLeilaoLots()` para health-check.

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| FO1 | Tabela sem scroll horizontal declarado explicitamente — em 375px, 5 colunas podem causar overflow horizontal da página | 🟡 |
| FO2 | `activeSourceId` hardcoded como `"receita-leiloes-sle"` — se o ID mudar no catálogo, o highlight fica errado silenciosamente | 🟢 |
| FO3 | Hero card diz "Hoje uma fonte oficial está conectada" — texto pode ficar desatualizado quando mais fontes forem conectadas | 🟡 |

**Avaliação:** Padrão de transparência excelente. A lógica de não marcar como "descontinuado" em caso de rede indisponível é correta e honesta.

---

### 22. Admin — `/app/admin` (`admin/page.tsx`)

**O que faz:** Dashboard admin com overview, users, data e fontes/módulos. Protegido por `useIsAdmin()` + revalidação na edge function.

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| AD1 | `admin-api` carrega overview para tabs "data" e "sources" também — uma chamada serve as 3 abas, mas se a tab "users" for ativada antes, "overview" não é carregado e "data"/"sources" ficam vazios até re-click | 🟡 |

**Avaliação:** Gate em 2 camadas (UI + servidor) está correto. `AccessRestricted` bem implementado.

---

### 23. Calculadora de Lance — `/ferramentas/calculadora-lance` (`ferramentas/calculadora-lance/page.tsx`)

**O que faz:** Calculadora de lance máximo para leilões (pública, sem auth). Campos de valor de mercado, comissão, tributos, custos. Captura de e-mail.

**Dados:** Puramente client-side. Captura de lead via `capture_lead` RPC do Supabase com chave pública.

**Problemas:**

| # | Problema | Severidade |
|---|---|---|
| CA1 | Chave pública do Supabase exposta no bundle para o RPC `capture_lead` — esperado por design mas a RPC deve ter RLS ou policy que impeça leitura de outros leads | 🟡 (verificar policy) |
| CA2 | `inputMode="decimal"` nos campos de valor — em Android, teclado numérico nem sempre inclui vírgula; placeholder "Ex.: 25000" usa ponto não-BRL | 🟢 |
| CA3 | Sem `<meta name="robots">` ou flag noindex — página aparece em resultados de busca (desejado para SEO) mas sem controle de duplicação | 🟢 |
| CA4 | CTA "Veja lotes reais abaixo de {lanceFmt} →" aparece mesmo para lance R$ 0 (quando vm > 0 mas custos > vm) — `!lanceNegativo` protege mas `lanceMaximo = 0` passa | 🟡 |

**Avaliação:** Melhor uso de `aria-live="polite" aria-atomic="true"` do projeto. Disclaimer honesto bem destacado. `<label htmlFor>` correto em todos os campos.

---

### 24. Detalhe de Deputado — `/app/politica/deputado/:id` (`politica/deputado-detail-page.tsx`)

Arquivo existente, não lido nesta rodada (fora da janela de tempo). Registrar para próxima auditoria.

---

## Top 15 correções priorizadas

| # | Página | Problema | Severidade | Esforço |
|---|---|---|---|---|
| 1 | Dashboard | Card INPI com itens placeholder hardcoded visíveis a usuários Pro | 🔴 | Baixo (remover 5 linhas) |
| 2 | Lot Detail | `onAsk: _onAsk` — prop descartado, IA ask é dead code | 🔴 | Médio (conectar handler) |
| 3 | Alertas | Copy "Marque com a estrela" diverge do ícone Heart no LotesPage | 🔴 | Baixo (alinhar copy) |
| 4 | Alertas | 4 toggles de preferência salvam em localStorage mas nunca chegam ao backend | 🔴 | Alto (implementar ou remover) |
| 5 | Lot Detail | Alert modal: copy "Notificação no app" mas comportamento é e-mail | 🔴 | Baixo (corrigir copy) |
| 6 | Busca | Search limitada a leilões num produto de 8 módulos | 🔴 | Alto (expandir ou declarar escopo no UI) |
| 7 | Leads | Empty state com "integração sendo ligada" exposto a usuários pagantes | 🔴 | Baixo (trocar copy) |
| 8 | Lot Detail | Sem paywall visível no CTA de Raio-X para usuários não-Pro em idle | 🟡 | Médio (adicionar prompt de upgrade) |
| 9 | Jurídico | `listProcessos()` carregado no mount mesmo sem usuário trocar aba | 🟡 | Baixo (lazy load como Política/Votações) |
| 10 | Jurídico | Tabs sem `role="tablist"` wrapper — aria incompleto | 🟡 | Baixo (adicionar wrapper) |
| 11 | Conta / Segurança | Dialog "Excluir conta" sem focus trap e sem listener de Escape | 🟡 | Baixo (adicionar useEffect) |
| 12 | Detalhe do lote | `baixarEdital()` chama `setSuccessMessage()` em cenários de erro | 🟡 | Baixo (trocar para `setErrorMessage`) |
| 13 | Cérebro | `console.warn("[cerebro]...")` vaza em produção | 🟡 | Baixo (guard `import.meta.env.DEV`) |
| 14 | Município detail | `buildIbgeUrl()` gera URL por slug sem código IBGE — pode resultar em 404 | 🟡 | Baixo (usar URL com código) |
| 15 | Dashboard | 8 chamadas paralelas no mount sem priorização — UX ruim em conexão lenta | 🟡 | Médio (carregar módulos secundários com delay ou on-demand) |

---

## Padrões transversais

### Positivos (manter e replicar)

- **`role="alert"` consistente** em banners de erro: todas as páginas auditadas usam o atributo corretamente.
- **Cancelation token** (`let cancelled = false`) em todos os `useEffect` de fetch — sem race condition de updates em componentes desmontados.
- **Scroll infinito via IntersectionObserver** com `rootMargin: "600px 0px"` — padrão consistente que funciona sem imports externos.
- **`FonteDots` e `FonteSeloBlock`** — componentes de rastreabilidade usados corretamente em quase todas as páginas.
- **Busca multi-campo tolerante a acentos** via `normalizeForSearch + NFD` — padrão idêntico em 6 páginas, totalmente replicável.
- **`SourceRealityPanel` (INPI)** e padrão "resultado vazio é resultado honesto" — melhor prática de transparência do produto.
- **Separação `SourceEmptyState` vs `EmptyState`** em Ambiental — distingue "sem dados" de "filtros sem resultado"; replicar em todas as páginas lista.

### Problemas transversais (corrigir sistematicamente)

- **Cards clicáveis sem fallback** — MunicipioCard, InfracaoCard, OrgaoCard, LicitacaoCard, VotacaoCard todos dependem de prop `onSelect` opcional sem navegação fallback. Se o pai não fornecer a prop, o card é inerte sem indicação visual. Solução: implementar rota de detalhe ou remover `cursor: pointer` e `role="button"` quando não há handler.
- **Dados em localStorage sem sincronização** — Watchlist (Lotes, Alertas, Conta), Relatórios (Relatórios) e preferências de notificação (Alertas) são todos localStorage-only. Qualquer limpeza de cache ou troca de dispositivo apaga o histórico do usuário. Para produto SaaS B2B com R$ 197/mês, a expectativa é persistência real.
- **Skeleton shapes incorretos** — Política e Jurídico reutilizam o mesmo `SkeletonCard` para tipos de conteúdo com layout diferente (votação, processo). Criar skeleton específico por tipo de card.
- **Tabs sem `role="tablist"`** — Jurídico, Política e Empresas usam botões como tabs mas sem container `role="tablist"`. Leitores de tela não anunciam corretamente a estrutura.
- **`console.warn`/`console.log` em produção** — Cérebro tem warn explícito; auditar outros módulos para limpar antes de merge.
- **Mobile 375px — canvas e tabelas** — SourcesPage e RelatóriosPage têm tabelas de 5 colunas sem `overflow-x: auto` declarado no container pai externo; CerebroPage tem canvas muito alto. Testar todas as telas com tabela em viewport 375px.
- **Placeholder copy de desenvolvimento** — INPI (dashboard), Leads (empty state) e Conta/Notificações (toggle in-app sem persistência) têm copy que indica funcionalidades incompletas diretamente na UI do produto. Nunca expor estado interno de desenvolvimento a usuários pagantes.

---

## Arquivos relevantes

- `/home/user/fonteia/apps/web/src/app/page.tsx` — Dashboard
- `/home/user/fonteia/apps/web/src/app/lotes/page.tsx` — Lotes
- `/home/user/fonteia/apps/web/src/app/leiloes/lot-detail-page.tsx` — Detalhe do lote
- `/home/user/fonteia/apps/web/src/app/cerebro/page.tsx` — Cérebro
- `/home/user/fonteia/apps/web/src/app/raio-x/page.tsx` — Raio-X
- `/home/user/fonteia/apps/web/src/app/alertas/page.tsx` — Alertas
- `/home/user/fonteia/apps/web/src/app/leads/page.tsx` — Leads
- `/home/user/fonteia/apps/web/src/app/search/page.tsx` — Busca
- `/home/user/fonteia/apps/web/src/app/juridico/page.tsx` — Jurídico
- `/home/user/fonteia/apps/web/src/app/inpi/page.tsx` — INPI
- `/home/user/fonteia/apps/web/src/app/empresas/page.tsx` — Empresas
- `/home/user/fonteia/apps/web/src/app/municipios/page.tsx` — Municípios
- `/home/user/fonteia/apps/web/src/app/ambiental/page.tsx` — Ambiental
- `/home/user/fonteia/apps/web/src/app/politica/page.tsx` — Política
- `/home/user/fonteia/apps/web/src/app/licitacoes/page.tsx` — Licitações
- `/home/user/fonteia/apps/web/src/app/billing/page.tsx` — Billing
- `/home/user/fonteia/apps/web/src/app/account/page.tsx` — Conta
- `/home/user/fonteia/apps/web/src/app/relatorios/page.tsx` — Relatórios
- `/home/user/fonteia/apps/web/src/app/sources/page.tsx` — Fontes
- `/home/user/fonteia/apps/web/src/app/ferramentas/calculadora-lance/page.tsx` — Calculadora

---

*Auditoria concluída em 2026-06-19. Próximas páginas pendentes: `deputado-detail-page.tsx`, `infracao-detail-page.tsx`, páginas públicas `/publico/**`, `/guias/**`, `onboarding/page.tsx`.*
