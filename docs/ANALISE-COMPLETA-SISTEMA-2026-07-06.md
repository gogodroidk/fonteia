# Análise Completa do Sistema — Fonte.ia

> **Data:** 2026-07-06 · **Método:** força total — 9 especialistas em paralelo (arquitetura, segurança, edge/ingestão, dados/RAG, frontend, billing/compliance, qualidade/testes, devops, produto), cada achado crítico/alto submetido a **verificação adversarial** (um cético tentando refutar), síntese executiva cross-dimensional. 30 agentes, ~2,7M tokens, 443 chamadas de ferramenta, incluindo consulta ao **banco de produção** (Supabase MCP `get_advisors`/`execute_sql`) e scan de segredos no histórico git.
>
> Regra: só leitura. Nenhum arquivo, banco ou deploy foi alterado.

---

## Veredito executivo

**A engenharia está à frente da venda — e esse é o problema central.** O sistema é tecnicamente maduro para o estágio: RLS em 100% das tabelas, type-safety exemplar (`strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`, ~1 escape de tipo em 95k LOC), webhook Stripe de referência com HMAC time-safe, RAG com fundação honesta (HNSW real, prompts anti-fabricação). Várias auditorias anteriores foram de fato fechadas.

O que trava **não é capacidade técnica, é foco e monetização.** Construiu-se **largura** (8+ módulos, ~217k registros) em vez de **profundidade vendável** — contradizendo o próprio princípio cardinal "10 clientes antes do 2º módulo" — e o resultado é ~0 pagantes. Pior: há buracos que sangram dinheiro e conversão ao mesmo tempo, justamente onde um cliente pagante testaria o produto.

**Saúde geral: 63/100.** Não há bug técnico bloqueando a primeira venda; a engenharia está essencialmente pronta, mas mal-direcionada.

### Placar por dimensão

| Dimensão | Saúde | Leitura de uma linha |
|---|:---:|---|
| Segurança & RLS | **82** | Postura madura; sem vulnerabilidade crítica de vazamento/bypass. Gaps são hardening. |
| Edge Functions & Ingestão | **68** | Qualidade acima da média; `_shared` real, SQL parametrizado. Bugs de custo/dados pontuais. |
| Frontend Web & UX | **68** | Tecnicamente sólido (SSG, a11y, code-split). Jornada ao "aha" fraca; arquivos gigantes. |
| Billing & Compliance | **68** | Caminho do dinheiro defensivo, mas com fratura de governança (webhook sourceless). |
| Qualidade & Testes | **64** | Tipos exemplares; backend real (edge) com **zero testes**. Sem CI. |
| Dados, RAG & IA | **62** | Base honesta; mas semântica cobre 26% do acervo e rastreabilidade só 2 de 9 domínios. |
| Arquitetura & Monorepo | **58** | Camadas coerentes, mas metade do repo é código-fantasma não-deployado. |
| Produto & Prontidão | **54** | Proposta bem escrita, mas dispersa; valor vaza de graça; sem prova antes do login. |
| **DevOps & Release** | **48** | **Pior nota.** Token CF vazado, drift repo↔produção, sem CI, sem rollback. |

---

## Prioridades (rankeadas por impacto × esforço × risco)

Severidade entre colchetes = **após** verificação adversarial. `S/M/L` = esforço.

### 🔴 Faça hoje

1. **[CRIT · S] Revogar o token Cloudflare vazado.** `cfut_Plh…` (escopo Pages+Workers+R2) está no histórico git (`scripts/deploy.ps1`, commits `c5329cb`/`37f680a`) e continua recuperável por qualquer clone — remover do código atual **não** mitiga. Único remédio real: revogar no dashboard CF e gerar novo com escopo mínimo. Segue como P0 aberto na REPO-AUDIT, sem confirmação de rotação. *(DEVOPS-01, CONFIRMED)*

2. **[HIGH · S] Fechar o vazamento do Raio-X por IA.** A feature nº1 do plano de R$197 roda **sem gate de plano no servidor** (`supabase/functions/fonteia/index.ts:1045`) — o handler de edital gateia (`:1016`), o de Raio-X não. Grátis e ilimitado para todo usuário logado: esvazia a conversão *e* queima custo Gemini. Correção é um `if` de 3 linhas espelhando o edital + tratar 403 no front como "destrave assinando". **Maior alavanca de receita/menor esforço do repo inteiro.** *(PROD-01, CONFIRMED — verificação rebaixou de CRIT→HIGH pelo impacto atual com 0 pagantes, mas a síntese a coloca como #1 pela relação valor/esforço.)*

### 🟠 Próximas 2 semanas

3. **[HIGH · M] Versionar o webhook Stripe de produção.** As 3 funções que liberam plano pago (`stripe-webhook`/`setup`/`worker`, todas ACTIVE `verify_jwt=false`, confirmado via MCP) **não têm fonte no repo** — só um README. O bundle deployado diverge da referência versionada. Não é revisável, testável nem recuperável; reset do projeto Supabase = perda do webhook. `supabase functions download` → versionar → escolher **uma** fonte de verdade. *(BILL-01/EDGE-04/ARCH-02, CONFIRMED)*

4. **[HIGH · S] Adicionar CI mínimo.** Não existe `.github/workflows` — deploy é script PowerShell manual do laptop, sem gate. Um commit que quebra tipos, regride RLS ou hardcoda segredo vai direto a produção. Workflow: `typecheck + lint + test + deno check + scan de segredos`, bloqueando merge. Baixo custo, protege auth/billing/RLS. *(CI-01/DEVOPS-03, CONFIRMED)*

5. **[HIGH · M] Corrigir correlação assinatura↔usuário.** Em produção a coluna `subscriptions.user_id` **não existe** (verificado via MCP); `my_plan()` casa só por `lower(email)`. Pagante cujo e-mail no Stripe divirja do Auth (troca de e-mail, alias/+tag) não recebe o plano — perda direta de receita no cenário exato do gargalo. Fix já staged (0027); falta gravar `user_id` via `client_reference_id` no webhook e aplicar. *(BILL-02, CONFIRMED)*

6. **[HIGH · L] Expandir a busca global além de leilões (ou declarar o escopo).** `SearchPage` só consome `listLeilaoLots` (`search/page.tsx:6,320`); buscar "Petrobras" retorna vazio apesar de haver dados em Empresas/INPI/Ambiental. A barra de busca é a porta de entrada — ignorar 7 de 8 módulos faz o produto parecer vazio no momento da avaliação. Mínimo imediato: declarar escopo no placeholder; ideal: rotear ao `d1-bridge`. *(FE-02, CONFIRMED)*

### 🟡 Estratégico (mês)

7. **[HIGH · M] Escolher UM ICP e subordinar os outros 7 módulos por 90 dias.** 8+ módulos no ar com ~0 pagantes contradiz o cardinal "começar vendável". A própria `ESTRATEGIA-PRODUTO-2026` recomenda focar em compliance/due-diligence e liderar com o grafo. É posicionamento (copy + disciplina), não retrabalho — libera tempo para venda. *(PROD-02, CONFIRMED)*

8. **[HIGH · M] Tornar `/leiloes-receita-federal` uma vitrine de dado REAL antes do login.** Hoje é 100% mock "exemplo ilustrativo"; todo dado real fica atrás do cadastro — maior atrito de topo de funil para um produto cujo valor é "dado real rastreável". Listar 5-10 lotes reais read-only via `d1-bridge` com badge de fonte e CTA "ver todos → criar conta". *(PROD-03/PROD-04, CONFIRMED)*

9. **[HIGH · L] Uma fonte de verdade de schema + testar DR.** Drift grave: `infra/migrations` (37 arquivos `NNNN_`) não reproduz as 54 migrations timestamp de produção; objetos load-bearing (HNSW, RBAC, RPCs de ingest) faltam como arquivo. Um DR reconstruiria RLS/RPCs divergentes. Adotar `supabase/migrations` com `db pull` e aposentar/reconciliar `infra/migrations`. *(DEVOPS-02, CONFIRMED)*

10. **[HIGH · L] Testar a lógica de dinheiro pura das Edge Functions.** 42 funções (~16,7k LOC), todo o backend real, com **zero testes** — incluindo a trava fail-closed de gasto (InfoSimples) e `getVerifiedUserId` (ponto único de isolamento multi-tenant). A lógica já é pura e isolada; cobrir os limites com `deno test` é barato. *(TEST-02/TEST-04, CONFIRMED)*

11. **[HIGH · M] Proteger a garantia "a IA nunca fabrica".** O gate de código que **recusa sem citação** (`answer-engine.ts`) está no pacote `@fonteia/ai`, que **não roda em produção** — a edge `fonteia` é cópia manual sem import, testada só no pacote não-deployado. Hoje "a IA nunca fabrica" depende só da obediência do Gemini Flash ao prompt (t=0.4). Portar o gate ou pós-validar citação. *(RAG-03/TEST-03, CONFIRMED)*

12. **[HIGH · L] Estender rastreabilidade e busca semântica aos módulos vendáveis.** Só 1.965 linhas de `evidence`, exclusivas de leilão/sanção; 74% do acervo (empresas, licitações, deputados, INPI) vive só no D1, sem pgvector nem cadeia link+data+hash. O diferencial de compliance prometido a advogados só existe em 2 de 9 domínios. Curto prazo: FTS5 no D1; médio: embedar company/bidding/trademark. *(RAG-01/RAG-02, CONFIRMED)*

---

## Temas transversais

Estes padrões apareceram em **múltiplas** dimensões independentes — são a estrutura profunda dos problemas, não achados isolados:

- **Código-fantasma / duas fontes de verdade.** Toda a camada `apps/api` + `services/*` está versionada mas **não deployada**; o backend real são Edge Functions. Consequências em cascata: webhook Stripe de produção sem fonte no git, RAG reimplementado à mão em `_rag.ts`, modelo de planos triplicado, e o `REPO-AUDIT.md` descrevendo o backend errado. **A armadilha já se materializou** — dois docs de auditoria do mesmo repo se contradizem porque um autor tratou `services/*` como o backend real.

- **O valor-de-venda vaza de graça.** O Raio-X (feature paga) roda sem gate; a busca só cobre leilões; a rastreabilidade auditável só cobre 2 de 9 módulos; a busca semântica ignora 74% do acervo. O produto cobra por um diferencial que, no ponto exato onde o cliente testa, ou está grátis, ou vazio, ou sem a trilha prometida.

- **Largura em vez de profundidade.** 8+ módulos, 25 coletores, mas 0 pagantes, ICP diluído, onboarding que não roteia — e os módulos mais valiosos (empresas/licitações) são os menos aprofundados. Cada módulo novo foi esforço tirado de profundidade vendável e distribuição.

- **Divergência código × produção × documentação.** Migrations "NÃO APLICADAS" que já rodaram diferente, `config.toml` com `verify_jwt` divergente do deploy, defaults de gasto InfoSimples 25× acima do doc, `subscriptions.user_id` inexistente em prod, modelo de embedding no código diferente do documentado. O repo não é fonte fiel do que roda — perigoso para DR, billing e auditoria.

- **Governança frágil sobre o caminho do dinheiro.** Webhook sourceless, token CF vazado, sem CI, sem rollback documentado, sem monitoramento externo de erro, spend-guard sem teste. Nada disso quebra produção hoje, mas concentra risco financeiro/continuidade sem rede de segurança.

---

## Quick wins (alto impacto, baixo esforço)

- Gate `isProUser` no Raio-X — 3 linhas; fecha o maior vazamento de receita e custo Gemini.
- Revogar o token Cloudflare no dashboard — minutos; neutraliza o único segredo crítico vazado.
- Declarar o escopo da busca no placeholder ("Buscando em leilões") — remove a impressão de "produto vazio".
- `config.toml`: `stripe-portal verify_jwt=false` (alinhar ao deploy real) — evita quebrar o Customer Portal num redeploy.
- Trocar copy de desenvolvimento no empty state de Leads ("integração sendo ligada") por texto neutro.
- Guardar `console.warn` do Cérebro atrás de `import.meta.env.DEV`.
- Ligar "Leaked password protection" (HaveIBeenPwned) no painel Supabase Auth — um toggle.
- Propagar `?plano=pro` no CTA da landing para levar direto ao checkout pós-login.
- Marcar `docs/REPO-AUDIT.md` como superseded — para o doc arquitetural parar de enganar dev/IA.

---

## Riscos estratégicos (podem custar caro quando a tração vier)

- **Fuga de receita composta.** No dia em que a distribuição funcionar, Raio-X grátis + quotas de plano não aplicadas (pro = uso ilimitado) transformam cada usuário em custo de IA sem receita. O modelo só "funciona" hoje porque tem 0 pagantes.
- **Perda do caminho do dinheiro.** Webhook sem fonte no git e sem teste → um reset/migração do Supabase, ou bug silencioso na liberação de plano, é irrecuperável e indetectável (sem monitoramento externo).
- **DR impossível de forma determinística.** Drift repo↔produção + migrations não-idempotentes sem down-path → recriar o banco produz RLS/RPCs divergentes. Risco sobre dados de cliente e billing que só aparece na pior hora.
- **Erosão da garantia "IA nunca fabrica".** Gate anti-alucinação só no pacote não-deployado + produção confiando em prompt a t=0.4 → uma divergência entre as cópias faz a IA inventar valor de contrato/CNPJ/prazo com a suite verde. Atinge o único moat real.
- **Dívida de posicionamento.** Continuar adicionando módulos adia a descoberta do que vende. Cada mês em largura é um mês sem as 5-10 conversas de venda que validariam o produto. Custo não é técnico, é de tempo de mercado.
- **Exposição LGPD latente.** Tratar sócios/deputados/CEAP sem base legal explícita e sem processo real de exclusão — combinado com vender "até 8 usuários" no Corporativo sem RBAC/org real — cria risco de reembolso/CDC e ANPD no cliente de maior ticket.

---

## Nota de honestidade: o que a verificação adversarial REBAIXOU

A verificação não só confirmou — ela derrubou/atenuou achados, o que aumenta a confiança nos que sobraram:

- **Subcontagem de gasto do InfoSimples** — `HIGH → LOW`. A mecânica (upsert `merge-duplicates` não incrementa contador em refresh de CNPJ cacheado) confere literalmente, mas o cético provou que sob a config default o efeito real é ~zero. Fica como dívida latente, não sangramento.
- **Arquitetura-fantasma (`services/*` morto)** — `HIGH → MED`. Confirmado e até agravado, mas o impacto é manutenção/confusão, não vetor ativo de runtime — o código morto não executa.
- **Onboarding não roteia / CTA de edital / correlação por e-mail / dispersão / mock na landing** — vários `HIGH → MED` por impacto contextualizado, sem perder a validade.

Nenhum achado sobreviveu como falso-positivo silencioso. O único **crítico** confirmado é o token Cloudflare vazado (DEVOPS-01).

---

## Pontos fortes reais (não deixe a lista de problemas apagar isto)

- **Segurança de verdade:** RLS em 26/26 tabelas com `rowsecurity=true` + event-trigger que ativa RLS em toda tabela nova; RPCs admin com `is_admin()` server-side; hardening versionado contra vetores reais (0017/0018/0028); nenhum segredo sensível no bundle além das chaves públicas por design.
- **Type-safety no top do rigor:** o trio `strict`/`noUncheckedIndexedAccess`/`exactOptionalPropertyTypes` ligado e respeitado — praticamente zero `any`/`@ts-ignore` em 95k LOC.
- **RAG honesto:** HNSW cosine real em produção, 56k/56k entidades PG embedadas, RRF + reranker determinístico, prompts que exigem "evidência insuficiente" e rotulam FATO/INFERÊNCIA.
- **Frontend maduro:** SSG/prerender próprio cobrindo 27 rotas de SEO, code-splitting por rota, 1137 atributos aria, estados de loading/erro/empty amplos.
- **Estratégia lúcida:** `ESTRATEGIA-PRODUTO-2026` é brutalmente honesta e correta — reconhece que "IA cita fonte" virou commodity e aponta o moat real (interseção multi-domínio no grafo).
- **Disciplina de auditoria:** depoimentos fabricados removidos, edital gateado, CTAs corrigidos — várias red-flags anteriores de fato fechadas.

---

*Detalhamento por dimensão com evidência (arquivo:linha) e recomendação em cada achado: ver o dashboard interativo gerado nesta sessão. Findings verificados contra o banco de produção `pwiuiihsyazghdsrpshg` (Supabase MCP) e o histórico git.*
