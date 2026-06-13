# Auditoria de Produto + UX + QA — Fonte.ia (módulo Leilões)

> Auditoria de SÓ-LEITURA do app web (`apps/web`), pela ótica do **usuário leigo no celular**.
> Data: 2026-06-13. Escopo: landing, login, onboarding, painel, lotes, detalhe do lote, billing, conta, alertas, relatórios, busca, gating de plano, Edge Function `fonteia`.
> Princípios de referência: honestidade (nunca prometer lucro), valor em <30s, dado rastreável até a fonte, loop comercial (pagar → liberar) funcionando.

---

## Resumo do estado

O produto está surpreendentemente maduro: dados reais da Receita (SLE), rastreabilidade levada a sério (hash SHA-256, URL+data de coleta, EvidencePanel), copy honesta na maioria dos pontos (disclaimers "confirme no edital", "não é valor de mercado", "em breve" nos canais inativos), mobile pensado (bottom nav, FAB, alvos ≥44px, safe-area). O scoring foi corretamente re-semantizado de "risco" para "confiança/oportunidade" no painel e na lista. **Porém há um furo comercial grave (o recurso pago mais vendido — Raio-X com IA — está liberado de graça), inconsistências de oferta entre telas, e dois `ScoreRing` divergentes.** Detalhe abaixo.

---

## 1) Bugs reais / riscos

### 1.1 [CRÍTICO — monetização] O Raio-X com IA (recurso PAGO mais vendido) está LIBERADO para qualquer um
- **O que:** A Edge Function `fonteia` só aplica `isProUser()` na rota `/ia/edital`. A rota `/ia/raio-x` (e a raiz `/fonteia`) **não tem gating nenhum** — basta o header `apikey` público (que está hardcoded no bundle).
- **Onde:** `supabase/functions/fonteia/index.ts:272` (gating só no edital) vs `:300-330` (raio-x sem checagem de plano). No front, `apps/web/src/app/leiloes/lot-detail-page.tsx:734-781` (`runRaioX`) e o botão "Gerar Raio-X com IA" em `:1975-1991` aparecem para todo usuário logado, sem checar `isPro`.
- **Por que importa:** `PLANOS` (`apps/web/src/data/leiloes-seed.ts:319`) vende "**Raio-X com IA ilimitado**" como a feature nº 1 do plano Profissional (R$197/mês). Hoje qualquer pessoa logada (inclusive sem assinatura e sem cupom) gera Raio-X ilimitado de graça. O "loop comercial" tem um vazamento direto: o principal motivo de pagar já vem incluso no free. Some-se a isso o custo de IA (Gemini) sendo pago pela empresa para usuários que não pagam.
- **Conserto:** No handler de `/ia/raio-x`, aplicar `if (!(await isProUser(request))) return json({error:"plano_requerido", ...}, 403)` igual ao `/ia/edital`. No front, espelhar o tratamento de 403 que já existe em `analisarEdital` (`:898-901`) dentro de `runRaioX`, e exibir o estado "destrave assinando" no card do assistente (`:1958-1993`). Decidir o modelo de negócio: se o Raio-X for a isca grátis, então **remover "Raio-X ilimitado" da lista de features pagas** para não ser desonesto; se for pago, fechar o gate. As duas coisas não podem coexistir.

### 1.2 [Alto — oferta inconsistente] "Falar com vendas" do Corporativo dispara checkout real de R$597
- **O que:** O plano Corporativo tem `cta: "Falar com vendas"` (`leiloes-seed.ts:337`) mas **também** tem um Payment Link configurado (`config/stripe.ts:21`). Em `billing/page.tsx:23-35`, `handleChoose` acha o link e redireciona para o Stripe — ou seja, clicar em "Falar com vendas" leva direto a um checkout de cobrança de R$597/mês, não a um contato comercial.
- **Onde:** `apps/web/src/app/billing/page.tsx:24-33`, `apps/web/src/config/stripe.ts:19-22`, `apps/web/src/data/leiloes-seed.ts:337`.
- **Por que importa:** Expectativa quebrada (o leigo clica em "falar com vendas" esperando um humano/form e cai numa cobrança). Risco de cobrança indevida e de chargeback.
- **Conserto:** Ou remover `corporativo` de `STRIPE_PAYMENT_LINKS` e tratar o CTA como `mailto:`/form, ou trocar o CTA para "Assinar o Corporativo". Alinhar com a decisão do dono. O CTA e a ação têm que combinar.

### 1.3 [Alto — oferta inconsistente] Landing promete "Grátis" e "Mais popular" que não existem mais
- **O que:** A landing tem ramo de código para plano grátis: `plano.preco === 0 ? "Grátis"` (`landing/page.tsx:1296`) e badge "⭐ Mais popular" via `plano.destaque` (`:1274-1287`). Mas `PLANOS` hoje só tem `pro` (R$197, destaque) e `corporativo` (R$597) — **nenhum plano grátis**. Billing diz explicitamente "Tudo pago, **sem plano grátis**" (`billing/page.tsx:83`). A landing também ainda diz "para quem está começando e não quer depender de sorte" e mistura "investidor que exige rigor".
- **Onde:** `apps/web/src/app/landing/page.tsx:1296-1311` (ramo grátis morto), `:1284` (badge), comparado com `billing/page.tsx:83`.
- **Por que importa:** O ramo "Grátis" é código morto hoje, mas é uma bomba-relógio: basta alguém reintroduzir um plano `preco:0` e a landing vende "Grátis" enquanto o billing nega. Mais grave: a **landing e o billing mostram preços/labels diferentes** porque o billing reescreve o CTA. Para o leigo comparar preço, ele vê uma coisa na vitrine e outra no caixa.
- **Conserto:** Remover o ramo morto da landing (ou unificar a fonte de verdade de planos entre landing e billing). Garantir que a landing renderize exatamente o que o billing cobra. Hoje os dois leem `PLANOS`, então o CTA é o único divergente — padronizar.

### 1.4 [Alto — confiança] Depoimentos inventados com cifras de ganho ("R$ 506 mil/ano", "3× mais lotes")
- **O que:** `DEPOIMENTOS` em `leiloes-seed.ts:280-302` traz nomes, papéis e **"ganho" quantificado** (ex.: "R$ 506 mil em economia/ano", "3× mais lotes arrematados", "11h economizadas/semana"). São claramente fictícios (produto recém-lançado, "Membro desde Junho 2026").
- **Onde:** `apps/web/src/data/leiloes-seed.ts:280-302`. (Observação: não encontrei os depoimentos renderizados na landing atual — parecem órfãos — mas o dado existe e contradiz o princípio "nunca prometer lucro".)
- **Por que importa:** Viola frontalmente o princípio de honestidade do dono. Se forem reintroduzidos na UI, são promessa de lucro com prova social falsa — risco reputacional e de CDC/publicidade enganosa.
- **Conserto:** Remover as cifras de "ganho" e/ou marcar depoimentos como ilustrativos, ou trocar por provas reais (número de lotes monitorados, fontes conectadas). Não usar testemunhos com ganho financeiro fabricado.

### 1.5 [Médio — UI inconsistente] Dois `ScoreRing` diferentes com thresholds de cor divergentes
- **O que:** Existem dois componentes `ScoreRing`: `components/ui/ScoreRing.tsx` (prop `value`, verde ≥80 / âmbar ≥65) e `components/score-ring.tsx` (prop `score`, "sm"/"lg", verde ≥75 / âmbar ≥50, **track hardcoded `#e8f5ef`**). O detalhe do lote usa o segundo (`lot-detail-page.tsx:25`), painel/lista usam o primeiro.
- **Onde:** `apps/web/src/components/ui/ScoreRing.tsx:11-15` vs `apps/web/src/components/score-ring.tsx:6-10`.
- **Por que importa:** O **mesmo lote pode aparecer com cor diferente** na lista (âmbar) e no detalhe (verde), porque os limiares diferem (ex.: score 78 = âmbar no primeiro, verde no segundo). Para o leigo, cor = veredito; ver verde numa tela e amarelo na outra mina a confiança. Além disso o track `#e8f5ef` do `score-ring.tsx` é claro fixo: no **dark mode** o anel fica com fundo claro estourado.
- **Conserto:** Consolidar num único `ScoreRing` (manter o de `components/ui`, que usa `var(--surface-2)` e respeita tema) e remover `components/score-ring.tsx`. Unificar thresholds com os do scoring real.

### 1.6 [Médio — acessibilidade/mobile] Searchbar do topo é um input "fake" que abre /lotes
- **O que:** No topbar (`App.tsx:302-308`), a "searchbar" é um `<input readOnly tabIndex={-1}>` dentro de um `div role="button"` que só navega para `/app/lotes`. Mostra atalho "⌘K" que não existe (não há handler de teclado global para ⌘K).
- **Onde:** `apps/web/src/App.tsx:302-308`.
- **Por que importa:** O leigo vê uma caixa de busca, toca, o teclado **não abre** e ele é jogado para outra tela sem entender. O "⌘K" é jargão de power-user irrelevante no celular (e some no mobile, mas confunde no desktop por não funcionar). Input readonly com placeholder de busca é uma promessa falsa de affordance.
- **Conserto:** Ou tornar a busca real (foco abre busca/command palette), ou trocar por um botão explícito "Buscar lotes" com ícone. Remover o "⌘K" enquanto não houver atalho.

### 1.7 [Médio — honestidade] Score do FAQ ("apoio por regra") vs. badge "Score 82" e selos de oportunidade que parecem veredito
- **O que:** A landing usa "Score 82" e barras de fatores com números fixos no mock (`landing/page.tsx:666-705`, `:810`) e o detalhe converte score em selos fortes "Alta oportunidade / Oportunidade média / Avaliar com cautela" (`lot-detail-page.tsx:623-628`). O FAQ explica honestamente que é "regra fixa, não opinião de IA" (`:292-293`), mas o leigo lê o selo verde "Alta oportunidade" como recomendação de compra.
- **Onde:** `apps/web/src/app/leiloes/lot-detail-page.tsx:623-628` e `:1040-1045`; mock `apps/web/src/app/landing/page.tsx:681-706`.
- **Por que importa:** O selo é honesto na intenção, mas a hierarquia visual (badge verde grande + ScoreRing) comunica "lote bom, pode comprar". Para o público-alvo (primeira vez em leilão), isso beira a promessa. O disclaimer "o score é apoio, confirme o edital" existe mas em letra pequena (`:1594`, `:1566-1567`).
- **Conserto:** Aproximar o disclaimer do selo (tooltip "como calculamos?" no próprio badge), e considerar renomear "Alta oportunidade" para algo menos imperativo ("Sinais positivos por regra"). Manter, mas reduzir o peso de veredito.

### 1.8 [Baixo — mobile/overflow] Custo total e Financeiro usam `<table>` com rótulos longos
- **O que:** Tabelas de "Custo total estimado" e "Valores do lote" (`lot-detail-page.tsx:1331-1351`, `:1629-1752`) têm células com textos longos ("Teto sugerido por regra heurística (35% acima do mínimo) — não é valor de mercado; pesquise FIPE/mercado...") dentro de `<td>`. Em telas estreitas, a coluna de rótulo espreme o valor.
- **Onde:** `apps/web/src/app/leiloes/lot-detail-page.tsx:1713-1750`.
- **Por que importa:** Em celular pequeno (≤360px) o valor monetário pode quebrar feio ou empurrar layout. Não há `overflow-x:auto` nessas tabelas específicas (a tabela da lista de lotes tem; estas não).
- **Conserto:** Trocar por layout de "linha label em cima / valor embaixo" em <480px, ou envolver em `overflow-x:auto`. Mover a explicação do "teto" para uma nota abaixo da tabela em vez de dentro da célula.

### 1.9 [Baixo — feedback] Botão "Participar no leilão" leva ao SLE sem avisar que exige habilitação prévia
- **O que:** O CTA primário "Participar no leilão" (`lot-detail-page.tsx:1210-1218`) abre `lot.sourceUrl` numa aba nova. O passo a passo "Como dar lance" (que explica gov.br Prata/Ouro, habilitação, DARF) está **colapsado por padrão** logo abaixo (`como-dar-lance.tsx:191`, `InlinePanel` começa `expanded=false`).
- **Onde:** `apps/web/src/app/leiloes/lot-detail-page.tsx:1210-1218` + `apps/web/src/components/como-dar-lance.tsx:191`.
- **Por que importa:** O leigo clica no botão grande "Participar", cai no portal oficial, e descobre que precisa de conta gov.br nível Prata/Ouro, habilitação prévia etc. — exatamente o que o app explica, mas escondido. Frustração na hora H.
- **Conserto:** Ao clicar em "Participar", abrir um micro-aviso ("Você vai para o portal oficial. Antes precisa de conta gov.br Prata/Ouro e habilitação — veja o passo a passo") ou expandir o "Como dar lance" automaticamente na primeira visita.

### 1.10 [Baixo — estado] Banner de "Pagamento recebido" depende de querystring que pode persistir
- **O que:** `checkoutOk`/`paid` são lidos de `?checkout=sucesso` (`App.tsx:130-132`, `billing/page.tsx:18-21`). O banner some só ao clicar no X, mas o `?checkout=sucesso` permanece na URL; recarregar mostra o banner de novo, mesmo que a assinatura já tenha sido liberada (ou não).
- **Onde:** `apps/web/src/App.tsx:130-132` e `apps/web/src/app/billing/page.tsx:18-21`.
- **Por que importa:** Mensagem "estamos ativando" reaparecendo confunde. E como a liberação real é via webhook (correto, `config/stripe.ts:11-12`), se o webhook falhar o usuário fica preso vendo "ativando" sem caminho de auto-diagnóstico.
- **Conserto:** Limpar o param da URL (`history.replaceState`) após exibir; e oferecer "Atualizar status do plano" (re-chama `my_plan`) em vez de só "atualize a página".

### 1.11 [Baixo — robustez] Fallbacks de chave embutidos fazem `demoMode` nunca acontecer em produção
- **O que:** `supabase-client.ts:11-12` e `api-client.ts:5-9` embutem URL+publishable key como fallback, então `isSupabaseConfigured` é **sempre true**. Logo todo o caminho `demoMode` (banner "Modo demonstração" em `login-page.tsx:466-482`, mensagens em `alertas/page.tsx:428`) é código morto em produção.
- **Onde:** `apps/web/src/auth/supabase-client.ts:23-28`, `apps/web/src/lib/api-client.ts:11-17`.
- **Por que importa:** Não é bug funcional (é proposital, evita tela branca), mas mantém muito código/copy de um modo que não existe, e mistura a leitura de "o que o usuário realmente vê". Risco menor: a publishable key versionada no repo é pública por design, mas convém confirmar que o RLS cobre 100% das tabelas expostas via `entities`.
- **Conserto:** Documentar que demoMode é só para dev sem env, ou removê-lo. Auditar RLS da tabela `entities` (a query `entities?kind=eq.auction_lot` em `leiloes-api.ts:56` roda com a chave pública).

---

## 2) Atrito de UX para o leigo

### 2.1 Jargão técnico não explicado domina o detalhe do lote
"EDLE", "SLE", "EDIT­AL", "DARF", "e-CAC", "DRF", "ALF", "recinto/pátio", "teto sugerido por regra (heurística)", "PF/PJ", "elegibilidade". O leigo de primeira viagem não sabe o que é EDLE nem SLE. O detalhe expõe `lot.edle` no PrintReport (`lot-detail-page.tsx:514-516`) e em vários selos. "PF/PJ" aparece direto (ex.: `:1030-1039`) — para muitos é claro, mas "elegibilidade" não.
- **Conserto:** Glossário inline (tooltip "?" em EDLE/SLE/DARF), e preferir "Pessoa física / Pessoa jurídica" por extenso na primeira aparição (já feito no `eligibilityLong`, mas os selos usam sigla).

### 2.2 A primeira sessão não tem "primeiro lote guiado"
Onboarding (3 passos de preferência + 1 de "como funciona") é bom e honesto (`onboarding/page.tsx`), mas ao cair no painel o leigo recebe KPIs, "Oportunidade do dia", tabela, distribuição — muita densidade. Não há um "comece por aqui: abra este lote" nem destaque do FAB de IA. O FAB "Perguntar" (`App.tsx:380-390`) é um ícone de sparkles sem rótulo — o leigo não sabe o que faz.
- **Conserto:** Após onboarding, levar direto ao "Oportunidade do dia" já aberto, ou um tooltip de 1 passo apontando o FAB ("Pergunte em português aqui"). Dar rótulo ao FAB ("Perguntar").

### 2.3 "Score de oportunidade" sem explicação no momento do uso
No painel e na lista, o número do score aparece sem dizer o que é (a explicação está só no FAQ da landing, que o usuário logado não revê). O filtro "Toda confiança / Confiança alta / média / Cautela" (`page.tsx:686-689`) usa um vocabulário ("confiança") diferente do detalhe ("oportunidade") e da landing ("score de oportunidade").
- **Conserto:** Unificar o termo (escolher "oportunidade" OU "confiança", não os dois) e colocar um "como funciona o score?" clicável perto do primeiro score que o usuário vê.

### 2.4 Busca "em português" promete IA mas é só palavra-chave
A página de busca diz "Pergunte em português e encontre os lotes" e a landing fala em "Pergunte em português ao assistente, receba com prova" (`landing/page.tsx:1064`). Mas `search/page.tsx` é **matching de palavra-chave com stopwords** (`:32-43`), não IA. O texto admite isso em letra pequena ("Busca por palavra-chave... O Raio-X com IA acende quando ativado", `:355-358`), mas a headline cria expectativa de chatbot.
- **Conserto:** Ajustar a headline para "Busque por cidade, órgão ou categoria" e reservar "pergunte em português" para o Raio-X real. Evitar prometer NLP onde há `includes()`.

### 2.5 SearchPage usa `riscoBadge` (semântica invertida) — regressão vs painel/lista
Painel (`page.tsx:42-56`) e lista (`lotes/page.tsx:96-108`) abandonaram `riscoBadge` de propósito porque ele pinta o **melhor** lote de vermelho ("Risco alto"). Mas a **busca** ainda usa `riscoBadge` (`search/page.tsx:175`, `:230`): o lote de score baixo recebe "Risco alto" em vermelho. Resultado: o mesmo lote é "Avaliar com cautela" (neutro) na lista e "Risco alto" (vermelho) na busca.
- **Conserto:** Trocar `riscoBadge` por `confidenceBadge` na busca, igual às outras telas.

### 2.6 Modal de alerta oferece canais "em breve" que não fazem nada
O modal "Criar alerta de prazo" (`lot-detail-page.tsx:2085-2099`) tem select com "E-mail em breve" e "WhatsApp em breve" — mas o salvar real só dispara e-mail (RPC `create_alert`), e só se `isPro`. Escolher "WhatsApp em breve" e clicar salvar gera o mesmo alerta de e-mail (ou a mensagem de "assine"). O canal escolhido é ignorado.
- **Conserto:** Esconder canais inativos do select (ou desabilitá-los), e deixar claro que o alerta é por e-mail.

### 2.7 "Membro desde Junho 2026" e dados de conta hardcoded
`account/page.tsx:300` mostra "Membro desde: Junho 2026" fixo, "Método de pagamento: Não cadastrado" e "Próxima cobrança: —" mesmo para quem assinou. Para um pagante, ver "Sem assinatura / Não cadastrado" depois de pagar gera dúvida sobre se a cobrança valeu.
- **Conserto:** Derivar de dados reais (data de criação do usuário do Supabase; status do Stripe via webhook/portal). Enquanto não houver, esconder linhas que não refletem a verdade.

---

## 3) Conversão (visitante → cadastro → pagante)

### 3.1 O paywall chega tarde e o valor pago vaza (ver 1.1)
Como o Raio-X com IA — o argumento de venda nº1 — está aberto de graça, **não há razão funcional para pagar** hoje além de "Análise do edital por IA" e "alertas por e-mail". O momento do paywall (na hora de salvar alerta `:807-810`, e ao analisar edital `:875-879`) é correto, mas o gancho mais forte (Raio-X) não puxa para o plano. Isso enfraquece toda a monetização.

### 3.2 Landing → cadastro: todo CTA cai em /entrar, nenhum leva ao plano escolhido
Na landing, clicar em qualquer plano (`landing/page.tsx:1330`) ou "Começar agora" chama `onLogin` → login. O plano escolhido não é levado adiante (sem `?plano=pro`). Depois do login/onboarding, o usuário cai no painel, não no checkout do plano que clicou. Perde-se o momento de intenção de compra.
- **Conserto:** Passar o plano clicado pela URL/estado e, pós-login, abrir `/app/planos` com o plano destacado ou o checkout direto.

### 3.3 Oferta "7 dias grátis" é clara e honesta — bom
A copy "7 dias grátis, só cobramos depois, cancele antes e não paga nada" está consistente entre billing (`:84,146`), sidebar (`App.tsx:251`), conta (`:301,465`) e landing (`:1416`). O commit recente alinhou isso ao Stripe real (deixou de prometer "garantia/reembolso"). Manter.

### 3.4 Preço aparece em três lugares com números diferentes na conta
`account/page.tsx:427` exibe "Profissional — R$ 197/mês" hardcoded num card, enquanto `PLANOS` define o mesmo R$197 (ok), mas é cópia manual: se o preço mudar no seed, o card da conta mente. Risco de divergência futura.
- **Conserto:** Ler preço de `PLANOS`/`stripe.ts` em vez de string fixa.

### 3.5 Falta prova de valor "antes do cadastro"
A landing mostra mock ilustrativo e "Lotes em destaque (exemplo ilustrativo)", mas o leigo não vê **um lote real** sem se cadastrar. Para um produto cujo valor é "veja os dados reais", uma amostra real (1-2 lotes reais, read-only) na landing converteria mais que o mock.
- **Conserto:** Renderizar 1-2 lotes reais (via `listLeilaoLots`) na landing, com CTA "ver todos → cadastre".

### 3.6 Sem urgência/escassez honesta na conversão
O produto tem prazos reais (lotes encerrando), mas a landing não usa isso. "X lotes encerram esta semana" (dado real, já calculado em `page.tsx:250-257`) na landing seria gatilho honesto.

---

## 4) Oportunidades de produto (priorizadas)

| # | Ideia | Impacto | Esforço |
|---|-------|---------|---------|
| P1 | **Fechar/clarificar o gate do Raio-X** (decisão: isca grátis vs pago) e alinhar a copy de planos. Resolve o furo nº1 e define a proposta de valor paga. | Alto | Baixo |
| P2 | **Amostra real na landing + deep-link de plano** (1-2 lotes reais read-only; CTA carrega `?plano=pro` até o checkout). Converte intenção em pagamento sem perder o caminho. | Alto | Médio |
| P3 | **Calculadora de "quanto sai do bolso" interativa** no detalhe (usuário digita o lance pretendido e vê comissão + tributo estimável + total). Hoje `estimarCustoTotal` existe mas só roda no lance mínimo (`lot-detail-page.tsx:1315`). Falar a língua do leigo: "se eu der X, pago Y no total". | Alto | Médio |
| P4 | **Onboarding com "primeiro lote guiado"** (após preferências, abrir a Oportunidade do dia já com Raio-X e tooltip do FAB). Reduz o abandono da 1ª sessão. | Médio | Baixo |
| P5 | **Glossário/tooltips de jargão** (EDLE, SLE, DARF, PF/PJ, "teto sugerido"). O "zero-leigo é nosso ponto forte" — isso o reforça. | Médio | Baixo |
| P6 | **Alertas que o leigo entende**: "avise quando abrir leilão de carro em SP até R$50 mil" (critério por categoria+cidade+teto), não só por lote salvo. As prefs já existem em `alertas/page.tsx` mas não disparam por critério. | Alto | Médio |
| P7 | **"Vale a pena?" assistente comparativo**: para veículos, cruzar lance × FIPE (já tem `fipe-api`) e dizer honestamente a margem teórica, com disclaimers. Diferencia da concorrência. | Médio | Médio |
| P8 | **Unificar ScoreRing + vocabulário do score** (um componente, um termo "oportunidade", um "como calculamos?"). Consistência = confiança. | Médio | Baixo |
| P9 | **Compartilhar lote** (link + "gerar PDF" já existe via print): botão "enviar no WhatsApp" do lote. Crescimento orgânico no canal que o público usa. | Médio | Baixo |
| P10 | **Status de assinatura real na conta** (data de membro, próxima cobrança, gerenciar via portal Stripe). Tira o "Não cadastrado" pós-pagamento. Depende de ligar o Customer Portal (`stripe.ts:32` está vazio de propósito). | Médio | Médio |

---

## 5) Top 5 ações para a próxima onda (ordem de prioridade)

### 1. Fechar o vazamento do Raio-X com IA e alinhar a oferta paga
**Por quê:** é o furo comercial direto — o recurso mais vendido está de graça e ainda custa IA para a empresa.
**Arquivos:** `supabase/functions/fonteia/index.ts` (gate em `/ia/raio-x`, ~`:300`), `apps/web/src/app/leiloes/lot-detail-page.tsx` (tratar 403 em `runRaioX`, estado "destrave" no card ~`:1958-1993`), `apps/web/src/data/leiloes-seed.ts` (ajustar features se virar isca grátis).

### 2. Consertar as inconsistências de oferta (CTA Corporativo, ramo "Grátis", depoimentos)
**Por quê:** o que a vitrine promete tem que ser o que o caixa cobra; honestidade é princípio cardinal.
**Arquivos:** `apps/web/src/app/billing/page.tsx` (CTA vs link), `apps/web/src/config/stripe.ts` (link corporativo), `apps/web/src/app/landing/page.tsx` (remover ramo `preco===0`), `apps/web/src/data/leiloes-seed.ts` (depoimentos sem ganho fabricado, CTA do corporativo).

### 3. Deep-link de plano + amostra real na landing
**Por quê:** captura a intenção de compra (hoje perdida) e prova valor antes do cadastro.
**Arquivos:** `apps/web/src/app/landing/page.tsx` (lotes reais via `features/leiloes/leiloes-api`, CTA com `?plano=`), `apps/web/src/App.tsx` (ler `?plano=` pós-login e rotear para `/app/planos`/checkout), `apps/web/src/app/billing/page.tsx` (destacar plano vindo da URL).

### 4. Unificar ScoreRing, vocabulário do score e a busca (riscoBadge)
**Por quê:** o mesmo lote com cores/labels diferentes entre telas destrói a confiança do leigo.
**Arquivos:** remover `apps/web/src/components/score-ring.tsx` e migrar `lot-detail-page.tsx:25` para `components/ui`; trocar `riscoBadge`→`confidenceBadge` em `apps/web/src/app/search/page.tsx:175,230`; padronizar termo "oportunidade" em `page.tsx:686-689`.

### 5. Reduzir o atrito da 1ª sessão e do jargão (onboarding guiado + tooltips + FAB rotulado)
**Por quê:** "zero-leigo" é o diferencial declarado; é onde o produto deve ser imbatível.
**Arquivos:** `apps/web/src/app/onboarding/page.tsx` (rota final p/ lote guiado), `apps/web/src/App.tsx:380-390` (rótulo/tooltip do FAB, busca fake do topbar `:302-308`), `apps/web/src/app/leiloes/lot-detail-page.tsx` (tooltips de EDLE/SLE/DARF), `apps/web/src/components/como-dar-lance.tsx` (auto-expandir na 1ª visita / aviso pré-portal).

---

*Auditoria de só-leitura. Nenhum arquivo de código foi alterado. Referências em formato `arquivo:linha` apontam para o estado do repositório em 2026-06-13.*
