# Plano Macro — Fonte.ia: IA, Custos, Infraestrutura e Captação

> Visão de macro: como a IA funciona, quanto custa de verdade, qual infraestrutura usar (Supabase × Cloudflare × Hostinger), e como transformar os PDFs da Receita em clientes — com segurança jurídica.
>
> Data: 11/06/2026 · Câmbio usado: ~R$ 5,50/US$ (aproximado, confira na hora) · Dono: Igor/Olli

---

## PARTE 1 — Como a IA vai funcionar

### O que a IA faz no produto (em linguagem de leigo)
A IA é o "analista" que lê os dados públicos por você e responde em português claro. Ela faz três coisas:

1. **Resume e responde com prova.** Você pergunta ("esse lote vale a pena?", "essa empresa tem risco?") e ela responde com um resumo + os fatos + a fonte oficial de cada fato. Nunca inventa: se não tem evidência, ela diz que não tem.
2. **Monta planilhas e dossiês.** Pega os dados já estruturados (lotes, empresas, prazos) e organiza em tabela/Excel ou num PDF de dossiê pronto pra imprimir.
3. **Sugere o próximo passo.** "Crie um alerta", "compare com esse outro lote", "esse CNAE costuma ter margem X".

### Como funciona por dentro (arquitetura RAG)
Esse é o padrão que todo produto sério de IA usa hoje. RAG = "responder buscando na fonte, não na memória do modelo".

```
1. COLETA      PDFs da Receita, APIs (PNCP, CNPJ, tribunais) → extraímos fatos
2. ESTRUTURA   Cada fato vira linha no Postgres com: valor + fonte + data + hash (prova)
3. INDEXA      Texto vira "embedding" (vetor) e fica no pgvector p/ busca por significado
4. PERGUNTA    Usuário pergunta → buscamos os fatos relevantes (busca híbrida: palavra + significado)
5. RESPONDE    Mandamos os fatos + a pergunta pro Claude com a regra:
               "responda SÓ com essas evidências e cite a fonte" → resposta rastreável
6. ENTREGA     Resumo + fatos + fontes + ação. Exporta planilha/dossiê se pedido.
```

O seu código **já tem** esse motor (`packages/ai/answer-engine.ts` com `answerWithEvidence` e guardrails). Está no caminho certo.

### Roteamento de modelos (a chave do custo baixo)
Não usamos o modelo caro pra tudo. A regra:

| Tarefa | Modelo | Custo (1M tokens in/out) |
|---|---|---|
| Resumo simples, classificação, extração | **Haiku 4.5** | US$ 1 / US$ 5 |
| Resposta complexa, análise de risco | **Sonnet 4.6** | US$ 3 / US$ 15 |
| Decisão crítica, casos raros | **Opus 4.8** | US$ 5 / US$ 25 |

90% das respostas saem no Haiku. Sonnet só quando precisa raciocinar mais. Opus quase nunca.

**Dois truques que cortam custo:**
- **Prompt caching** (−90% no contexto repetido): o "sistema" e os dados fixos do lote ficam em cache.
- **Batch** (−50%): processamento em lote (ex.: gerar resumos de 1.000 lotes de madrugada) sai pela metade do preço.

### Embeddings (busca semântica)
Para a busca por significado precisamos de um modelo de embedding (o Claude não faz embedding). Opções: OpenAI `text-embedding-3-small`, Voyage ou Cohere — custo é **irrisório** (centavos por milhão de tokens). Guardamos os vetores no **pgvector do Supabase (grátis)**.

---

## PARTE 2 — Quanto custa de verdade (modelo financeiro)

### Custo de IA por resposta
| Modelo | Conta | Custo/resposta | Em reais |
|---|---|---|---|
| Haiku | 4k entrada + 1k saída | US$ 0,009 | **~R$ 0,05** |
| Sonnet | 4k entrada + 1k saída | US$ 0,027 | **~R$ 0,15** |

### Custo de IA por usuário/mês
| Perfil de uso | Respostas/mês | Custo/mês |
|---|---|---|
| Leve | 30 (Haiku) | ~R$ 1,50 |
| Médio | 100 (mix) | ~R$ 6 a 11 |
| Pesado | 300 (Sonnet) | ~R$ 44 |

> Traduzindo: mesmo um cliente **pesado** custa ~R$ 44 de IA contra os **R$ 299** que ele paga. A IA é 0,5% a 15% da receita. **Não é o seu gargalo.**

### Custo fixo de infraestrutura (fase inicial, < 100 clientes)
| Item | Plano | Custo/mês |
|---|---|---|
| Frontend (Cloudflare Pages) | Grátis | R$ 0 |
| API (Cloudflare Workers) | Grátis → Paid | R$ 0 → ~R$ 27 |
| Banco + Auth + Storage (Supabase Pro) | US$ 25 | ~R$ 135 |
| Envio de e-mail (Resend/Postmark) | Grátis até 3k/mês | R$ 0 → ~R$ 110 |
| API Claude (variável) | uso | ~R$ 100 a 450 |
| Domínio | anual (~R$ 50/ano) | ~R$ 4 |
| **Total fase inicial** | | **~R$ 250 a 700/mês** |

### Unit economics (a parte boa)
- **Break-even: 1 cliente.** Um único cliente a R$ 299 já paga toda a infraestrutura.
- **Meta de 10 clientes** (antes de abrir o 2º módulo): R$ 2.990/mês de receita vs ~R$ 500–700 de custo → **margem bruta ~80%**.
- **100 clientes**: ~R$ 29.900/mês vs ~R$ 1.500–3.000 → margem ~90%.

### Quanto você precisa investir
**Capital para começar: praticamente zero.** O que você gasta é:
- **Operacional:** ~R$ 250–700/mês (some só quando tiver uso/clientes; no início fica perto de R$ 135 do Supabase + uns trocados de IA).
- **Uma vez (opcional, recomendado):** domínio (~R$ 50/ano) e **um advogado pra revisar a captação por LGPD** (~R$ 500–2.000 uma vez) — barato perto do risco de multa.
- **Ferramenta de enriquecimento de e-mails** (pra achar contato dos CNPJs) — ver Parte 4. Pode começar manual/grátis.

> Resumo: você não precisa de investimento pesado. Precisa de **tempo** e de **execução da captação**. O dinheiro entra antes de o custo crescer.

---

## PARTE 3 — Infraestrutura: Supabase × Cloudflare × Hostinger

### A confusão a desfazer primeiro
Esses três **não são concorrentes diretos** — fazem coisas diferentes:

| Camada | O que é | Melhor opção |
|---|---|---|
| **Banco + Auth + Storage** | Onde ficam os dados e o login | **Supabase** (Postgres gerenciado) |
| **Hospedar o site + API** | Servir o app pro mundo | **Cloudflare** (Pages + Workers) |
| **Hospedagem genérica / VPS / domínio** | Servidor "cru", WordPress, e-mail | **Hostinger** (opcional) |

### Recomendação direta (verdade dura)
**Use Cloudflare (frontend + API) + Supabase (dados + auth) agora.** É o que seu projeto já está configurado pra usar (`wrangler.jsonc`, cliente Supabase). É o melhor pro longo prazo e o mais rápido pra lançar.

**O Hostinger não encaixa bem nesta arquitetura serverless + Postgres.** Ele brilha em hospedagem compartilhada/WordPress/VPS. Você só consideraria Hostinger se:
- quiser registrar o **domínio** lá (ok, mas a Cloudflare também registra, geralmente mais barato e sem markup);
- quiser um **site institucional/blog em WordPress** separado (marketing) — aí Hostinger é uma boa;
- mais pra frente quiser **self-host do Postgres num VPS** pra cortar os US$ 25 do Supabase — possível, mas vira trabalho de DevOps. Não compensa antes de ter dezenas de clientes.

**Veredito:** Cloudflare + Supabase é a escolha certa de macro. Hostinger fica como "talvez, pra domínio ou WordPress de marketing". Sua intuição de que "Cloudflare é melhor pro longo prazo" está correta — principalmente porque **Cloudflare não cobra egress (saída de dados)**, o que mata a conta da AWS/Vercel em escala.

### Por que Cloudflare (números 2026)
- **Pages:** estático ilimitado, CDN global, grátis.
- **Workers:** grátis até 100k requisições/dia; depois US$ 5/mês com 10M requisições.
- **R2 (arquivos):** sem taxa de egress, 10GB grátis, depois US$ 0,015/GB.
- **KV / D1:** cache e SQLite na borda, camadas grátis generosas.

### Supabase — TODAS as ferramentas e onde cada uma encaixa

**Usar agora (módulo de leilões):**
- **Postgres** — banco principal (lotes, empresas, usuários, alertas).
- **Auth** — login (e-mail, Google OAuth, magic link, telefone). *Já está no app.*
- **Row Level Security (RLS)** — **crítico**: garante que cada cliente só vê os dados dele. Base do multi-tenant.
- **pgvector** — busca semântica (grátis, incluído).
- **Storage** — guardar PDFs dos editais, dossiês gerados.
- **Edge Functions** — funções serverless (Deno) pra webhooks/processamento; opcional, já que você tem Workers.
- **pg_cron** — agendar a coleta de dados (rodar ingestão toda madrugada).
- **Database Webhooks** — disparar ação quando entra lote novo (ex.: notificar alerta).
- **Realtime** — atualização ao vivo na tela (novo lote aparece sem recarregar).

**Usar no futuro (escala / outros módulos):**
- **pgmq (Filas)** — fila pra pipeline de ingestão pesada.
- **Foreign Data Wrappers** — conectar fontes externas direto no banco.
- **Branching** — ambientes de dev/staging isolados.
- **Read Replicas** — réplicas de leitura quando o tráfego crescer.
- **Vault** — guardar segredos/tokens das APIs públicas com segurança.
- **SSO + SOC2/ISO** (plano Team, US$ 599) — só quando fechar **cliente corporativo** que exige compliance.

**Planos Supabase:**
- **Free** (US$ 0): bom pra testar, mas **pausa o projeto após 1 semana sem uso** → não serve pra cliente pagante.
- **Pro** (US$ 25/projeto/mês): é o que você vai usar em produção. Inclui US$ 10 de crédito de compute e tem **teto de gasto** ligado por padrão.
- **Team** (US$ 599): só quando precisar de compliance/SSO.

---

## PARTE 4 — Captação de clientes via dados da Receita (a sua ideia)

### Por que a ideia é boa (de verdade)
Quem aparece no **Extrato do Leilão** da Receita **já comprou em leilão** — é exatamente o seu cliente ideal. Não é uma lista fria qualquer: é gente que **já faz** o que o seu produto otimiza. Isso é ouro.

### O problema técnico: o PDF tem CNPJ, não tem contato
O extrato te dá **CNPJ/CPF do arrematante**, não o e-mail nem o telefone. Então o fluxo real é:

```
PDFs da Receita → extrair CNPJs (você já tem os PDFs)
     → enriquecer: CNPJ → razão social, sócios, e-mail/telefone
        (via API pública de CNPJ, Receita, ou serviço de enriquecimento)
     → segmentar: separar PJ (empresa) de PF (pessoa física)
     → abordar com mensagem relevante + opt-out
```

Eu posso construir o **extrator de PDF → planilha de CNPJs** quando você quiser (você já tem os arquivos). É uma tarefa direta.

### A parte legal — leia com atenção (LGPD)
Pesquisei a posição da ANPD. Resumo honesto:

**✅ O que é defensável (faça assim):**
- **Foco em PJ (CNPJ).** Cold e-mail B2B pra **e-mail corporativo** é **legal** sob a base de **legítimo interesse** (art. 7º, IX da LGPD), desde que você cumpra 3 coisas:
  1. **Finalidade legítima** — prospecção comercial relevante (e é: eles compram em leilão).
  2. **Necessidade** — usar só o mínimo (e-mail corporativo).
  3. **Balanceamento** — conteúdo relevante + **opt-out claro em toda mensagem** + não exagerar na frequência.
- **Dados de CNPJ são públicos** (razão social, CNAE, endereço) — uso comercial é permitido respeitando finalidade e necessidade.
- **Documente um "LIA"** (Avaliação de Legítimo Interesse) — um documento simples dizendo por que você pode fazer isso. Mostra boa-fé se a ANPD perguntar.

**⚠️ O que é arriscado (evite ou trate com cuidado):**
- **Pessoa Física (CPF).** CPF é dado pessoal e os arrematantes PF são **consumidores, não empresas**. Cold outreach pra PF é **bem mais arriscado** sob LGPD — e o CPF vem cortado mesmo. **Recomendo deixar PF de fora** do disparo em massa no começo. Foque nos ~CNPJs.
- **WhatsApp/SMS em massa.** Alto risco jurídico **e** contra os termos do WhatsApp (banimento). E-mail é o canal defensável.
- **Disparo de 6.000 de uma vez.** Além do risco legal, mata sua reputação de envio (cai em spam). Melhor **começar pelos mais ativos** (quem aparece em vários editais), personalizado, em lotes pequenos.

**A jogada mais inteligente:** em vez de blast de 6.000, ranqueie os CNPJs por **quantos leilões cada um arrematou**. Os top 100–300 compradores recorrentes são os que mais precisam do produto. Aborde esses primeiro, com mensagem personalizada ("vi que sua empresa arrematou em X editais — a gente te avisa dos próximos com score de margem"). Conversão muito maior, risco muito menor.

### Checklist da captação
1. [ ] Extrair CNPJs dos PDFs → planilha (eu faço).
2. [ ] Enriquecer com e-mail corporativo (API CNPJ / serviço).
3. [ ] Separar PJ × PF. **Priorizar PJ.**
4. [ ] Ranquear por recorrência (mais leilões = mais quente).
5. [ ] Escrever 1 e-mail curto, relevante, com **opt-out**.
6. [ ] Enviar em lotes pequenos via Resend/Postmark (não do Gmail pessoal).
7. [ ] Documentar o LIA (legítimo interesse). Opcional: advogado revisar.
8. [ ] Medir abertura/resposta → ajustar.

---

## PARTE 5 — O que VOCÊ precisa fazer agora (Igor)

**Imediato (sem custo):**
1. [ ] Registrar conta no **Supabase** e criar o projeto (eu te passo o passo a passo e ligo no app).
2. [ ] Registrar conta na **Cloudflare** (deploy do frontend/API).
3. [ ] Decidir o **domínio** (ex.: fonteia.com.br) — registrar na Cloudflare ou Hostinger.
4. [ ] Me mandar 1 PDF de extrato pra eu montar o extrator de CNPJ.

**Quando for pra produção (custo entra aqui):**
5. [ ] Assinar **Supabase Pro** (US$ 25/mês) — só quando tiver o 1º cliente perto.
6. [ ] Criar conta de **e-mail transacional** (Resend — grátis no começo).
7. [ ] Pegar **chave da API Claude** (Anthropic) pra ligar a IA.
8. [ ] (Opcional) Advogado revisar o LIA da captação.

**Você NÃO precisa de:**
- Hostinger (a não ser que queira domínio ou WordPress de marketing).
- Servidor próprio / VPS (Cloudflare + Supabase resolvem).
- Investimento alto de capital. Isso aqui sobe com receita, não com dívida.

---

## PARTE 6 — Roadmap macro (visão de cima)

```
AGORA      → Frontend 100% funcional (Fases 0–7 do Plano Mestre) + extrator de CNPJ
            → Modo demonstração já funciona sem backend
1º MÊS     → Ligar Supabase (dados/auth reais) + Cloudflare (deploy) + IA (Claude)
            → Ingestão automática dos leilões da Receita (pg_cron)
2º MÊS     → Captação: top 300 CNPJs recorrentes, cold e-mail B2B com opt-out
            → Meta: primeiros clientes pagantes
3º MÊS     → Checkout Stripe ligado (cobrança recorrente)
            → 10 clientes pagantes = sinal verde pra abrir o 2º módulo
DEPOIS     → Multi-tenant (escritórios/corporativo), novos módulos, Team plan se exigirem compliance
```

### Princípio que rege tudo
**Comece vendável.** Um módulo (leilões), um canal (cold e-mail B2B), uma infra enxuta (Cloudflare + Supabase). 10 clientes pagantes antes de abrir a próxima frente. O custo só cresce quando a receita já cresceu.

---

*Fontes de pesquisa: Supabase Pricing, Cloudflare Workers/Pages Pricing, Claude API Pricing, e Guia Orientativo da ANPD sobre Legítimo Interesse e Cookies (2026).*
