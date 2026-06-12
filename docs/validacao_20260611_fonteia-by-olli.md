# RELATÓRIO DE VALIDAÇÃO — Fonte.ia by Olli
**Data:** 11/06/2026

## IDEIA
Fonte.ia by Olli — Plataforma SaaS modular que transforma dados públicos brasileiros (leilões, licitações, empresas, jurídico, INPI, ambiental) em decisões rastreáveis assistidas por IA, com citação de fonte oficial.

## VEREDITO: ✅ GO — com condição crítica

A oportunidade é real, o timing é excelente e o diferencial competitivo é defensável. O único risco de morte é tentar construir 8 módulos ao mesmo tempo. Execute 1 módulo perfeito nos primeiros 6 meses e use a receita para financiar o segundo. Qualquer outra sequência mata o negócio.

## SCORES
| Dimensão | Nota |
|---|---|
| Tamanho de Mercado | 9/10 |
| Diferencial Competitivo | 8/10 |
| Viabilidade Financeira | 7/10 |
| Viabilidade de Execução | 6/10 |
| Timing | 9/10 |
| SCORE GERAL | 78/100 |

## RESUMO EXECUTIVO

A oportunidade existe e é grande: R$ 500 bilhões+ em compras públicas anuais, mercado fragmentado, Lei 14.133/21 criando demanda estrutural, e nenhum competidor oferecendo a combinação de módulos + IA + rastreabilidade de fonte que a Fonte.ia propõe. O diferencial "decisão auditável com fonte oficial" é genuinamente único e difícil de copiar porque requer DNA de produto específico, não só tecnologia.

O maior risco não é o mercado nem a concorrência — é o fundador. Construir 8 módulos com 1 time pequeno é a receita clássica de startup que tem tudo mas não termina nada. O stack tecnológico está correto (Turborepo + Supabase + Cloudflare é uma escolha excelente para esse tipo de plataforma). O risco de execução é a fragmentação de foco, não falta de capacidade técnica.

A recomendação é lançar o módulo de Leilões Judiciais em 8-10 semanas como produto pago, com 10 clientes pagantes antes de tocar no módulo 2. Esse segmento tem dor imediata, budget confirmado e nenhum concorrente direto com IA + rastreabilidade. A receita inicial financia a expansão modular sem depender de investimento externo.

## TOP 3 PONTOS FORTES
1. **Timing perfeito:** Lei 14.133/21 em implementação + IA mainstream = janela de 2-3 anos que não se repetirá
2. **Diferencial real:** nenhum concorrente integra múltiplos domínios com IA que cita a fonte oficial — isso é defensável como moat de produto
3. **Stack técnico sólido:** Cloudflare + Supabase + pgvector é a escolha certa para esse problema (escala, custo, velocidade de desenvolvimento)

## TOP 3 RISCOS CRÍTICOS
1. **Síndrome do generalista:** 8 módulos planejados = alto risco de não terminar nenhum com qualidade suficiente para reter clientes
2. **APIs públicas instáveis:** 60-70% do tempo de engenharia vai para manter integrações com fontes governamentais que mudam sem aviso
3. **Ciclo de venda B2B lento:** PMEs e escritórios no Brasil demoram para pagar; você pode ficar sem runway esperando fechar contratos

## SCORES POR AGENTE

### Pesquisador de Mercado
- TAM: R$ 500bi+ em compras públicas anuais
- Crescimento: forte (Lei 14.133/21 + IA + digitalização governamental)
- Concorrentes diretos: Effecti, Licitei, Neoway, Assertiva, BigDataCorp, ConLicitação, Alerta Licitação
- Brecha: nenhum player integra todos os domínios com IA auditável

### Advogado do Diabo
- Risco fatal #1: generalismo com 8 módulos
- Risco fatal #2: manutenção de integrações governamentais (60-70% do tempo de eng)
- Risco fatal #3: CAC alto + ciclo de venda longo no B2B BR
- Risco fatal #4: LGPD em dados derivados de fontes públicas
- Risco fatal #5: TCU/CGU pode lançar concorrente gratuito

### Defensor da Ideia
- Timing: janela de 2-4 anos não se repetirá
- Moat: "fonte citada + decisão auditável" não existe no mercado
- Entrada: escritórios de advocacia em leilões judiciais (dor imediata + budget)
- Path to R$10k MRR: 10-17 clientes a R$ 600/mês

### Modelagem Financeira
| Métrica | Pessimista | Realista | Otimista |
|---|---|---|---|
| MRR mês 12 | R$ 6.000 | R$ 24.000 | R$ 60.000 |
| MRR mês 24 | R$ 20.000 | R$ 80.000 | R$ 250.000 |
| MRR mês 36 | R$ 50.000 | R$ 200.000 | R$ 700.000 |
| Ticket médio | R$ 400 | R$ 600 | R$ 800 |
| CAC | R$ 800 | R$ 600 | R$ 400 |
| LTV/CAC | 8x | 26x | 105x |
| Break-even | Mês 28 | Mês 18 | Mês 12 |
| Capital mínimo B/E | R$ 180k | R$ 120k | R$ 80k |

### Analista de Execução
- Complexidade técnica: 7/10 (stack ok, integrações são o inferno)
- MVP módulo único: 8-10 semanas
- Time mínimo: 1 full-stack + 1 design PT + 1 domain expert
- Custo MVP: R$ 8-12k (infra + ferramentas)
- Gargalos: scraping instável, volume de embeddings, NF/billing BR

## BENCHMARKS DE REFERÊNCIA
- **Effecti** (licitações BR): 3.000+ clientes em 4 anos focando 100% em monitoramento de editais
- **Licitei** (pregões com IA): ticket R$ 299-999/mês, validou nicho antes de expandir
- **INPI Analytics**: nicho pequeno mas pagador — R$ 1.000-5.000/mês enterprise

## CONDIÇÕES PARA MUDAR O VEREDITO
- **GO vira WAIT:** tentar lançar 3+ módulos simultaneamente sem funding
- **GO se mantém:** 1 módulo, 10 clientes pagantes, MRR R$ 6k+ antes de expandir
- **GO vira NO-GO:** não conseguir 5 clientes pagantes nos primeiros 90 dias após MVP

## PRÓXIMOS 3 PASSOS CONCRETOS

**1. VALIDAR ANTES DE CONSTRUIR | Prazo: 2 semanas**
Fazer 15 entrevistas com advogados especializados em leilões judiciais.
Pergunta-chave: "Você pagaria R$ 500/mês por uma ferramenta que monitora e resume leilões judiciais com citação da fonte oficial?"
Métrica: 5+ "sim, pagaria agora" ou pivotar o módulo inicial.

**2. MVP MÓDULO LEILÕES | Prazo: 8-10 semanas**
Construir o módulo de leilões judiciais com: monitoramento de editais (5 tribunais principais), resumo IA com citação, alerta WhatsApp/email, dashboard básico.
Métrica: 10 clientes pagantes antes de tocar em qualquer outro módulo.

**3. PRICING E CANAL | Prazo: antes do lançamento**
Definir 3 planos (R$ 299 individual / R$ 699 escritório / R$ 1.499 corporativo), integrar Asaas (NF automática + PIX recorrente), criar grupo de WhatsApp com 50 advogados beta.
Canal inicial: LinkedIn + grupos de advogados.
Métrica: 50 inscritos na lista de espera antes de lançar.

---
*Gerado pelo pipeline idea-validator (6 agentes) — Fonte.ia by Olli — 11/06/2026*
