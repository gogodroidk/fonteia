# Fonte.ia — Ideias & Roadmap para o usuário se apaixonar

> Princípio cardeal desta fase: **encantar sem gastar com IA paga.** A maior parte do "uau"
> vem de **dado oficial bom + regras espertas + design**, não de LLM. O Raio-X com Claude
> é a *cereja premium* que acende quando houver crédito na Anthropic — o produto já é
> valioso e "inteligente" sem ele.

## 0. O ouro que estava escondido (grátis)
A API interna da Receita entrega **`valorAvaliacao` E `valorMinimo`** por lote. Logo:
- **Economia real = avaliação − lance mínimo** e **% de desconto = economia / avaliação.**
- É exatamente o número que a landing *fingia* ("economia R$ 506.000 / −55%") — agora **real,
  rastreável e de graça**. Vira o herói do produto: cards, dashboard, alertas, ordenação.
- Só aparece quando a ingestão do catálogo rodar (lotes atuais de `destaques` não têm avaliação);
  por isso o código mostra **graciosamente** (tem avaliação → mostra economia; não tem → esconde).

## 1. Modelo de "inteligência grátis primeiro"
| Camada | Como (grátis) | Premium (quando houver crédito) |
|---|---|---|
| Raio-X do lote | **Raio-X por regra**: economia, desconto%, urgência de prazo, elegibilidade PF/PJ, checklist do edital, pontos de atenção por categoria do bem | Raio-X em prosa pelo **Claude Haiku** (mesmo template, linguagem natural) |
| Busca | **Postgres full-text (BM25)** — `pg_textsearch`/`tsvector`, sem custo de embeddings | Busca semântica (pgvector) quando valer o custo de embeddings |
| Relatórios | **Dossiê PDF templado** (dados + evidência + hash), client-side | Resumo executivo escrito por IA |
| Alertas | Regras (prazo, novo lote casando filtro, desconto acima de X%) + e-mail grátis (Resend free tier) | Resumo inteligente do alerta |

## 2. Ideias por área

### 2.1 Página de vendas (o "3D" do Igor)
- **Demo interativo no lugar do mock estático** (tendência forte 2026: AI/SaaS sem demo convertem pior). Um "Raio-X ao vivo" embutido: o visitante passa um lote de amostra e vê **a análise real por regra** (score, economia, prazo) acontecendo — sem login, sem IA paga.
- **3D performático e com fallback**: hero com cena leve (Spline/Three.js ou o card 3D atual aprimorado), **lazy-load atrás de um poster estático**, desligado no mobile/conexão fraca (LCP < 1.8s). Nada de travar celular.
- **Scroll-telling** (GSAP ScrollTrigger): a história "edital caótico → Raio-X claro → decisão" se monta conforme rola.
- Prova social honesta (sem inventar): números reais do banco ("X lotes ao vivo agora", "R$ Y em avaliação disponível"), selo de fonte oficial.

### 2.2 Dashboard (foco do Igor — executando já)
- **"Melhores oportunidades hoje"**: ranking por um score composto **grátis** = desconto% + score de regra + urgência de prazo. É o "AI-native: priorize, não só mostre" — mas por regra.
- **KPIs reais** (não fictícios): lotes ao vivo, economia total disponível, encerrando ≤48h, por categoria/cidade.
- **Urgência**: contadores de prazo ("encerra em 2d 4h"), realce do que vence.
- **Modular**: filtro global (categoria/cidade/PF-PJ/desconto) que atualiza tudo; (depois) widgets arrastáveis.
- **Empty state que ensina**: se não há lote no filtro, explica e sugere ação — nunca tela morta.
- **Microinterações com propósito**: score ring que preenche, count-up nos números, hover/raise nos cards.

### 2.3 Descoberta / Lotes
- Filtros que importam pro leigo: **% de desconto**, categoria do bem, cidade/UF, PF/PJ, faixa de preço, prazo.
- Ordenar por: maior desconto, melhor score, encerrando antes, mais barato.
- **Busca em linguagem simples** via full-text grátis ("carro em SP abaixo de 30 mil").
- Card do lote: foto, **economia em destaque**, score, prazo com urgência, selo de fonte.

### 2.4 Detalhe do lote / Raio-X
- **Galeria de fotos** (a API traz `imagens[]`), **itens do lote** (descrição, quantidade, recinto de retirada), **mapa/pátio**.
- **Economia e desconto** no topo; **checklist do edital** (já existe) + pontos de atenção por categoria.
- **Rastreabilidade real**: "ver no edital", PDF oficial guardado, hash SHA-256 de verdade, data de coleta.
- Raio-X: por regra agora; prosa do Claude quando acender.

### 2.5 Alertas & retenção (engajamento de leilão)
- Salvar critério → avisar quando **novo lote casar**, **prazo se aproxima**, **desconto acima de X%**.
- Canal grátis: e-mail (Resend free tier). WhatsApp depois.
- **"Meu radar"**: watchlist com tudo que o usuário acompanha + contadores de prazo.

### 2.6 Onboarding que encanta
- 3 passos → escolhe interesses (categorias/cidades) e **já cai num dashboard com lotes reais** que casam, não numa tela vazia. Primeiro "uau" em < 30s.

### 2.7 Educação para leigos (diferencial de confiança)
- Glossário ("edital", "EDLE", "lance mínimo", "pátio"), guia "como funciona um leilão da Receita", "riscos e o que conferir". Tudo curto, contextual.

### 2.8 Confiança / rastreabilidade (a marca)
- Selo "fonte oficial" em cada dado, com data e hash; "a IA nunca inventa — se falta dado, ela diz". É o nosso fosso competitivo.

## 3. Roadmap priorizado

**Agora, sem você (grátis, sem portões):**
1. ✅ App mobile-perfeito, zero erros (feito).
2. **Dashboard novo** (oportunidades hoje, KPIs reais, urgência, empty states) — *executando*.
3. **Economia/desconto real** no scoring e nos cards (graciosamente, ativa com a ingestão).
4. Filtros + ordenação por desconto/score/prazo; **busca full-text grátis**.
5. Galeria de fotos + itens no detalhe; Raio-X por regra (sem IA).
6. Demo interativo na landing; polish 3D performático.
7. Onboarding → dashboard com lotes reais.

**Depende de você (portões de produção):**
- Deploy da ingestão do catálogo + 1ª varredura (banco/Storage) → liga economia real, fotos, catálogo inteiro.
- Crédito Anthropic → acende o Raio-X em prosa (Haiku, barato).
- Resend (free) → alertas por e-mail.
- Stripe secrets → pagamento libera plano.

## 4. Regra de ouro de execução
Tudo verificado localmente (`typecheck` + `build` + testes = zero erro) antes de empurrar, e
sempre **honesto** (nada de número inventado; mock sempre rotulado "exemplo").

---
Fontes de tendência (2026): SaaSFrame landing/empty-state, Muzli/925studios dashboards,
Three.js/Spline 3D web, AuctionMethod/auction UX. Ver chat para links.
