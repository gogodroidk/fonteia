# Estratégia de Produto Fonte.ia — Síntese da Revisão Multi-Agente (jun/2026)

Consolida os achados de uma rodada de revisão com time completo: Diretor de Produto,
Pesquisa de Mercado (vários recortes), Segurança, QA e Diretor de UX. É um documento de
decisão — prioriza verdade dura sobre otimismo.

## 1. Posicionamento / fosso (moat)

**Verdade dura:** cada eixo isolado já tem dono forte. Grafo/dossiê de risco → **Kronoos**
(≈R$1.400/dossiê) e **upLexis** (2.000+ fontes); jurídico → **Jusbrasil** (Jus IA em todos os
planos) e **Escavador** (a partir de R$9,90); licitações → **Effecti** + AI-natives (LicitaIA,
SmartLic R$235–397/mês); leilões → **6 ferramentas de IA** (Smart Leilões, Leilão Ninja,
BUSCAi, Cardeal, Arremata.ai, Núcleo) a **R$49–129/mês**. "IA lê o documento + cita fonte"
virou **commodity**.

**O que é defensável (e único):** a **interseção multi-domínio num só grafo** — ligar
`política (Câmara/CEAP/votações) ↔ licitação (PNCP) ↔ CNPJ/QSA ↔ jurídico (CNJ) ↔ sanções`
com **rastreabilidade auditável (link+data+hash)** e IA que recusa responder sem evidência.
Nenhum incumbente cruza política + compra pública + societário + jurídico. Mensagem-âncora:
**"o grafo que liga o dinheiro público ao privado, com fonte citável"** — não "mais um
Jusbrasil/Kronoos".

## 2. Concorrência (por eixo)

| Eixo | Players | Preço | Overlap | Leitura |
|---|---|---|---|---|
| Big data B2B | Neoway (comprada pela **B3, R$1,8bi, 2021**), Cortex Intelligence, BigDataCorp | enterprise, não público | médio | atendem quem a Fonte.ia não atende (self-service) |
| Compliance + grafo | **Kronoos** (R$1.400/dossiê), **upLexis** (2.000+ fontes), Idwall (→Serasa) | dossiê avulso / sob consulta | **ALTO** | concorrentes mais perigosos do "Cérebro" |
| Birôs de crédito | Serasa, Boa Vista/Equifax, Quod | por consulta | médio | modelo "por consulta" que o flat disrompe |
| Legaltech | Jusbrasil (~R$209), Escavador (R$9,90+), Predictus/Digesto | público (varejo) | alto no jurídico | guerra de preço perdida no varejo jurídico |
| Licitações | Effecti, ConLicitação; AI-natives LicitaIA/SmartLic | R$235–397 (AI-natives) | direto | não competir em "IA lê edital" |
| Leilões | Smart Leilões, Leilão Ninja, BUSCAi, Cardeal, Arremata.ai, Núcleo | R$49–129 | **direto e mais barato** | Fonte.ia está cara/menos vertical aqui |

**Movimentos recentes:** Serasa comprou **Idwall** (~R$400–450M, CADE aprovou mai/2026) após
comprar ClearSale (R$2bi/2024); **Enter** virou 1º unicórnio de IA jurídica LatAm (R$500M).
Setor aquecido e consolidando.

## 3. Segmentos por disposição a pagar (DAP)

1. **Compliance / PLD-FT (obrigados COAF)** — DAP alta, vento regulatório (RegTech BR CAGR ~22%, US$733M até 2029). Exige rastreabilidade auditável, sanções/PEP, beneficiário final, trilha de evidência. **ICP primário recomendado.**
2. **Due diligence / M&A** — DAP alta (~1.400 transações/2025). Kronoos cobra R$1.400 por **um** dossiê → R$597 subprecifica.
3. **Advocacia** — DAP média, volume alto, já educada a pagar assinatura. Porta de entrada (valida os R$197).
4. **Crédito/risco de fornecedor** — paga por consulta a Serasa; flat é argumento.
5. **Licitações (fornecedores)** — entrar por inteligência/idoneidade, não gestão de proposta.
6. **Leilões** — pivotar para "due diligence da contraparte via grafo", não análise de lote.

## 4. Pricing — dinheiro na mesa

R$197/R$597 está **bem calibrado para land/PME**, mas:
- Falta um **tier Enterprise (R$3.000–15.000+/mês, anual)**: API, SSO, RBAC, usuários ampliados,
  cota de créditos InfoSimples + overage, gerente de conta, SLA, acesso pleno ao Cérebro.
  Âncoras de mercado: Judit R$1k–35k/mês; Jusbrasil Soluções entrada R$624,90; Idwall ~R$2k/mês.
- **Certidões InfoSimples = sistema de créditos** (espelhar a franquia R$100/mês da própria
  InfoSimples; cobrar com markup sobre R$0,05–0,20/consulta + taxa do órgão) em vez de embutir
  no flat — protege margem e cria upsell. **Cache 60d compartilhado é a vantagem de margem.**

## 5. Roadmap enterprise (do Diretor de Produto)

**O quarteto que destrava CONTRATO (fazer antes de tudo):**
1. **PDF de due diligence com marca** (logo, data, hash por evidência) — é o *entregável* que justifica preço. Base: `apps/web/src/components/report/EntityReport.tsx`.
2. **Trilha de auditoria** (quem consultou qual CNPJ/quando) — `usage_events` já existe; gravar + expor em `/app/admin`. Checkbox de RFP de banco.
3. **DPA/LGPD + página `/enterprise`** + "Solicitar demonstração" — sem isso, jurídico trava o contrato e não há pipeline enterprise.
4. **Organização multiusuário + RBAC** (orgs + convites + papéis; migrar RLS de `created_by=auth.uid()` para `org_id`) — **bloqueador #1 de venda departamental**. Toca RLS/billing → decisão do dono + security review.

**Retenção (MRR):** Monitoramento de carteira de CNPJs (alerta de nova sanção/processo/certidão
vencida) — o motor `alerts/send-alerts` já existe, hoje só para prazo de leilão.

**Ticket alto:** API para clientes + webhooks (módulo `api` hoje `locked`).

## 6. Regulatório / LGPD (de 3 recortes de pesquisa)

**Favorável:** dados abertos em expansão (Informa.BR/CGU, INPI 2026, PNCP obrigatório pós Lei
14.133, DataJud aberto). STF/STJ blindam indexação de dado público verídico. Precedente
"Resolve Juizado" mantido — judiciário não bloqueia legaltech. PL 2338 (marco de IA) **ainda
não é lei** (tramita na Câmara) → janela sem compliance pesado.

**Riscos reais (gerenciáveis):**
- **Dado público ≠ fora da LGPD.** O *cruzamento* cria dado novo; precisa de base legal
  documentada (**legítimo interesse** + finalidade compliance/proteção ao crédito + teste de
  balanceamento). ANPD (Radar Tecnológico nº3) trata scraping como tratamento de dado pessoal.
- **PF embutida:** sócios (CPF parcial), **MEI/EI são pessoa física**. STJ (2025) presume dano
  moral em exposição indevida → risco de ação individual. Precedente **Serasa/MPDFT** (proibida
  de vender dados enriquecidos para prospecção) é análogo.
- **Multa diária cautelar** (ANPD CD-10/2025) é mais perigosa que a multa final.
- **CNPJ alfanumérico a partir de 01/07/2026** (IN RFB 2.229/2026) → **ação técnica obrigatória**:
  tratar CNPJ como string em todo o pipeline/validação/índices.

**Must-do de conformidade (baixo custo, alto escudo):** (1) nunca fabricar resposta — já é
princípio; (2) documentar base legal LGPD por categoria de dado; (3) nomear DPO + canal do
titular + fluxo de remoção/desidentificação de PF; (4) minimizar PF exposta (foco PJ).

## 7. UX (do Diretor de UX) — top wins

Diagnóstico: "painel de developer bem construído" — falta polish enterprise. Quick wins:
texto de conclusão sob o semáforo do Dossiê ("2 irregularidades ativas — PGFN e CEIS"),
agrupamento da navegação (17 itens planos → clusters Leilões/Inteligência/Dados), custo de
crédito visível no card em idle, confirmação antes de "consultar categoria", nota honesta do
onboarding mais visível, `EmptyState` reutilizável com CTA nos estados dormant, preview mobile
do hero na landing, hint contextual no Cérebro ("verifique a idoneidade desta empresa"),
`SourceBadge` (ShieldCheck + fonte) como identidade visual da rastreabilidade.

## 8. Decisões do dono (irreversíveis / fora do meu escopo)

1. **Preços do tier Enterprise** e markup de overage InfoSimples (contrato → irreversível).
2. **Migração de RLS para `org_id`** (multi-tenant) — antes de aplicar, security review.
3. **Destravar o módulo `api`** (`locked`→`active`) e habilitar `apiCallsPerMonth`.
4. **Pivô de posicionamento**: liderar com Compliance/Due Diligence (não leilões) e mensagem
   "grafo do dinheiro público↔privado com fonte citável".
5. **Profundidade de histórico** das fontes (custo de armazenamento × relevância).

---
_Fontes detalhadas (com URLs) nos relatórios dos agentes desta rodada. Pricing enterprise dos
incumbentes é majoritariamente não-público — faixas estimadas a partir de sinais._
