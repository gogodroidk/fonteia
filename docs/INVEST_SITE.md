# INVEST_SITE — Estrutura de Site Institucional/Vendas para a Fonte.ia

> Documento estratégico de produto e marketing · Junho 2026  
> Operadora: **Olli Inteligência Digital Sistemas LTDA** · CNPJ 65.361.266/0001-05  
> Produto: **Fonte.ia** — inteligência de leilões da Receita Federal

---

## 1. O Problema Atual

A landing page atual é uma Single Page Application (SPA) com âncoras internas: `#inicio`, `#como-funciona`, `#planos`, `#faq`. O menu de navegação expõe apenas três links — "Como funciona", "Planos" e "Dúvidas".

Isso funciona bem para conversão rápida em mobile e em tráfego pago. O que falta para desktop e para o visitante que pesquisa antes de comprar (perfil B2B, advogado, despachante aduaneiro, revendedor) é profundidade institucional: quem está por trás do produto, como os dados são tratados, prova de legitimidade e caminhos de descoberta orgânica.

**Diagnóstico do dono:** "Fraco no desktop. Muito simplório. Quero um site de verdade."

---

## 2. Referências Analisadas

### 2.1 Omie (ERP para PMEs)

Omie.com.br é o benchmark mais próximo para um SaaS B2B brasileiro sério.

**O que a Omie faz que a Fonte.ia ainda não faz:**

- Navegação em duas camadas: mega-menu com Funcionalidades, Produtos, Segmentos, Para Contadores, Preços, Explorar
- Página `/seguranca-e-privacidade` com certificação ISO 27001 em destaque, descrição dos papéis da empresa (Controlador × Operador conforme LGPD), infraestrutura AWS, e-mail de privacidade dedicado, PDFs para download
- Rodapé em quatro colunas: A Omie, Empresas, Segurança, Educação — com Compliance e Transparência salarial listados explicitamente
- Página `/sobre/` com história da empresa

**Takeaway:** Credibilidade técnica-legal é conteúdo, não decoração.

### 2.2 RD Station (Marketing/CRM)

RD tem o melhor exemplo de navegação por segmento no Brasil.

**Estrutura adaptável para a Fonte.ia:**

- Menu horizontal: Produtos → Segmentos → Planos → Recursos → Contato
- `/segmentos/[nome-segmento]` — páginas dedicadas para cada público
- Rodapé com seção "Legal e privacidade" separada de "Institucional"
- Universidade RD (educação) + Blog + Glossário + Cases de sucesso como cluster de conteúdo separado

**Takeaway:** Separar "para quem serve" do "o que faz" dobra a relevância SEO e a clareza do argumento de venda.

### 2.3 Nuvemshop (e-commerce SaaS)

**Página `/companhia` (sobre a empresa):**

- Abre com claim de liderança + número de marcas ativas
- Timeline da história (marcos anuais desde a fundação)
- Grid de executivos com foto, cargo e LinkedIn
- Menções na mídia (O Globo, G1, Folha de SP)
- Números de credibilidade em destaque: R$ 10 bi em vendas, 180 mil lojistas, 4 mil parceiros

**Takeaway:** A página "Sobre" não é vaidade — é o lugar onde investidores, jornalistas e compradores B2B céticos verificam se a empresa existe de verdade.

### 2.4 ContaAzul (gestão financeira SaaS)

- Página `/funcionalidades/seguranca/` com argumento "mesmos certificados SSL dos bancos" e infraestrutura AWS/ISO 27001
- Política de Privacidade LGPD como documento próprio acessível pelo rodapé

**Takeaway:** Para público que trata dados de terceiros, segurança precisa de uma página própria — não um parágrafo no FAQ.

### 2.5 Padrão Geral de SaaS B2B Brasileiro Maduro (síntese)

Com base nos quatro exemplos acima e nas referências do setor (Leadster, RD Summit, Exact Sales):

| Elemento | Presença nos SaaS maduros | Status atual na Fonte.ia |
|---|---|---|
| Menu com 5+ itens no desktop | Universal | 3 âncoras apenas |
| Página /sobre com CNPJ e razão social | Universal | Inexistente |
| Página /seguranca ou /privacidade dedicada | Universal | Só no legal (termos) |
| Página /para-quem ou segmentos | Maioria | Inexistente |
| Footer com CNPJ e dados da empresa | Universal | Inexistente |
| Prova social (depoimentos/métricas) | Universal | Inexistente |
| Blog com cluster de conteúdo SEO | Maioria | Existe (3 posts) |
| Certificações/selos de dados oficiais | Omie, ContaAzul | Inexistente |
| Página de contato comercial | Universal | Inexistente |

---

## 3. Sitemap Proposto — Fonte.ia

### Estrutura de URLs

```
fonteia.com.br/                     ← HOME (expandida)
fonteia.com.br/produto              ← O que é / Funcionalidades detalhadas
fonteia.com.br/para-quem            ← Segmentos / Casos de uso
fonteia.com.br/precos               ← Planos (página dedicada, não âncora)
fonteia.com.br/seguranca            ← Segurança, LGPD, rastreabilidade
fonteia.com.br/sobre                ← Institucional (empresa, CNPJ, missão)
fonteia.com.br/contato              ← Formulário + dados de contato
fonteia.com.br/blog                 ← Já existe (3 posts)
fonteia.com.br/guias                ← Já existe
fonteia.com.br/faq                  ← Já existe
fonteia.com.br/glossario-leiloes    ← Já existe
fonteia.com.br/ferramentas/calculadora-lance  ← Já existe
fonteia.com.br/privacidade          ← Já existe (legal)
fonteia.com.br/termos               ← Já existe (legal)
fonteia.com.br/cookies              ← Já existe (legal)
```

**Rotas a criar (8 páginas novas):** `/produto`, `/para-quem`, `/precos`, `/seguranca`, `/sobre`, `/contato`  
**Rotas a expandir:** `/` (home) com mais seções no desktop.

---

## 4. Outline Detalhado por Página Nova

---

### 4.1 `/sobre` — Institucional

**Objetivo:** Provar que a Fonte.ia é uma empresa real, operada por pessoas reais, com CNPJ registrado e propósito claro. Esta é a página que o comprador B2B mais cético abre antes de assinar qualquer contrato.

**Seções:**

**A) Cabeçalho institucional**
- Título: "Quem está por trás da Fonte.ia"
- Subtítulo em prosa: "A Fonte.ia é desenvolvida e operada pela Olli Inteligência Digital Sistemas LTDA, empresa brasileira dedicada a transformar dados públicos em decisões rastreáveis."

**B) Box de dados da empresa (elemento de âncora legal)**
```
Razão Social:  Olli Inteligência Digital Sistemas LTDA
CNPJ:          65.361.266/0001-05
Natureza:      Sociedade Limitada
Sede:          [endereço da sede conforme Junta Comercial]
E-mail:        contato@fonteia.com.br
Fundação:      2024 / 2025 [verificar data de abertura no CNPJ]
```
Este box deve ter borda discreta, fundo levemente diferente do resto da página, e fonte monoespaçada para os dados — sinaliza seriedade legal sem parecer planilha.

**C) Missão**
- Uma frase direta: "Tornar os leilões públicos brasileiros acessíveis a quem pesquisa com método, não com sorte."
- Dois parágrafos curtos explicando por que a empresa existe: fragmentação dos dados nos sites oficiais dos órgãos, tempo perdido em pesquisa manual, risco de perder lotes por falta de informação agregada.

**D) O que fazemos (não: "quem somos")**
- Três cards: (1) Agregamos — coletamos dados de fontes oficiais (SLE da Receita Federal, e em breve outros órgãos); (2) Rastreamos — cada dado exibido tem URL de origem e data de coleta; (3) Analisamos — score de oportunidade por regra, sem invenção, sem estimativas.

**E) Selos de legitimidade**
- "Dados direto da fonte oficial" com ícone de escudo
- "LGPD — tratamento de dados conforme a Lei 13.709/2018"
- "Empresa registrada — CNPJ 65.361.266/0001-05 · Junta Comercial de [estado]"

**F) Rodapé da página /sobre com link para /seguranca e /contato**

---

### 4.2 `/seguranca` — Segurança, Privacidade e Rastreabilidade

**Objetivo:** Responder às três perguntas silenciosas do comprador técnico ou advogado: "Meus dados estão seguros?", "Vocês seguem a LGPD?", "De onde vêm os dados que vocês mostram?"

**Seções:**

**A) Hero da página**
- Título: "Seus dados protegidos. Os dados públicos, rastreáveis."
- Subtítulo: distinguir claramente os dois tópicos — (1) dados do usuário da plataforma e (2) dados dos leilões públicos que a plataforma exibe.

**B) Segurança da plataforma**
- Autenticação: Supabase Auth com sessão segura, tokens JWT, sem armazenamento de senha em texto
- Criptografia em trânsito: HTTPS/TLS obrigatório
- Infraestrutura: Cloudflare Pages + Workers + Supabase (PostgreSQL gerenciado)
- Armazenamento: dados hospedados em servidores com localização no Brasil ou na UE (verificar e confirmar com Supabase region)
- Acesso: cada conta acessa somente seus próprios dados; Row Level Security (RLS) ativo no banco

**C) Conformidade LGPD (Lei 13.709/2018)**
- A Olli Inteligência Digital atua como: Controladora (quando trata dados do usuário da plataforma) e Processadora dos dados públicos (coletados de fontes abertas do governo)
- Dados coletados dos usuários: e-mail, nome, dados de pagamento (processados pela Stripe, sem armazenamento local de cartão)
- Direitos do titular: acesso, retificação, exclusão — via e-mail privacidade@fonteia.com.br
- Encarregado de dados (DPO): [nome do responsável ou "Equipe Fonte.ia" enquanto empresa pequena]
- Link para a Política de Privacidade completa em /privacidade

**D) Rastreabilidade dos dados dos leilões**
- Esta seção é o diferencial competitivo mais forte e deve ser explicada como argumento de confiança.
- "Todo dado exibido na plataforma tem origem documentada: URL da fonte oficial + data e hora da coleta."
- "A IA nunca inventa. Se a informação não constar na fonte, o sistema indica 'evidência insuficiente'."
- "Você pode verificar na origem a qualquer momento — o link está disponível em cada lote."
- Fluxograma simples: Fonte Oficial → Coleta com Registro de Data/Hora → Score por Regra → Você

**E) Contato de segurança**
- E-mail dedicado para questões de privacidade e segurança
- Prazo de resposta: até 72 horas úteis

---

### 4.3 `/para-quem` — Casos de Uso por Segmento

**Objetivo:** Deixar o visitante se reconhecer em 10 segundos. Hoje a landing fala "para você" de forma genérica. Esta página fala para cada perfil específico que compra leilões da Receita Federal.

**Perfis a cobrir (baseados em pesquisa):**

1. **Arrematante Pessoa Física** — compra para consumo próprio ou revenda informal. Quer saber se o lote é para PF, qual o lance mínimo e quanto vai gastar de retirada.
2. **Revendedor/Distribuidor** — pessoa jurídica que compra lotes em série. Precisa de alertas automáticos e análise de margem.
3. **Advogado e despachante aduaneiro** — orienta clientes sobre leilões. Precisa de rastreabilidade e evidências para documentar decisões.
4. **Importador e agente de carga** — acompanha mercadorias retidas na alfândega. Quer localizar lotes específicos rapidamente.
5. **Entidade sem fins lucrativos** — certos leilões destinam bens para ONGs e entidades filantrópicas (Receita tem essa modalidade). Quer filtrar por tipo de destinação.

**Estrutura de cada card de segmento:**
- Ícone + Perfil
- Dor principal em uma frase
- Como a Fonte.ia resolve (máximo 3 pontos)
- CTA específico: "Ver plano para [perfil]" → âncora em /precos

**Seção adicional:** "Quem ainda não é o público da Fonte.ia" — honestidade desarm a objeção. Ex.: "Se você quer participar de leilões judiciais de imóveis, ainda não estamos lá — mas está no roteiro."

---

### 4.4 `/produto` — Funcionalidades Detalhadas

**Objetivo:** Cobrir o visitante que quer saber exatamente o que a plataforma faz antes de testar. Hoje essa informação existe só na seção "Como funciona" da home (3 passos resumidos).

**Seções:**

**A) Hero da página**
- "O que a Fonte.ia faz — e o que ela não faz"
- Subtítulo de honestidade: "Mostramos os dados oficiais com rastreabilidade. Não somos um leiloeiro, não damos lances, não estimamos preços de mercado."

**B) Funcionalidades por módulo**

Cada funcionalidade como card expandível (accordion):

1. **Agregação de lotes** — busca automática nos editais da Receita Federal (SLE), atualização periódica, cobertura de todos os leilões abertos.
2. **Score de oportunidade** — cálculo por regra fixa a partir dos dados publicados (participantes PF/PJ, prazo, lance mínimo, presença de imagem). Sem estimativas de mercado.
3. **Painel de filtros** — por órgão, categoria de bem, prazo, valor, participantes elegíveis.
4. **Alertas** — notificação quando um novo lote atende aos critérios configurados pelo usuário.
5. **Rastreabilidade** — cada dado com URL de origem e timestamp. O usuário vê de onde veio cada informação.
6. **Assistente de IA** — responde perguntas sobre um lote específico a partir dos dados coletados. Não interpreta o mercado; interpreta o edital.
7. **Análise de edital** — leitura em linguagem simples do edital PDF, com destaque dos pontos críticos.
8. **Calculadora de lance** — ferramenta pública em /ferramentas/calculadora-lance.

**C) Roteiro (em breve)**
- PGFN, SPU, DETRAN, Compras.gov.br
- Módulo jurídico (leilões judiciais)
- Exportação para Excel/CSV
- API para integração com sistemas próprios

**D) CTA**
- "Testar 7 dias grátis — sem cartão" → /entrar
- "Ver planos e preços" → /precos

---

### 4.5 `/precos` — Página de Planos Dedicada

**Objetivo:** Transformar a tabela de preços atual (âncora `#planos` na home) em uma página dedicada e indexável, mais detalhada e com argumentos de conversão adicionais.

**Seções:**

**A) Cabeçalho**
- "Planos simples. Sem contrato. 7 dias grátis."
- Toggle Mensal/Anual (se houver desconto anual no futuro)

**B) Tabela de planos**

| | Profissional | Corporativo |
|---|---|---|
| Preço | R$ 197/mês | R$ 597/mês |
| Lotes monitorados | Ilimitados | Ilimitados |
| Alertas | Sim | Sim + prioridade |
| Assistente de IA | Básico | Avançado |
| Usuários | 1 | Até 5 |
| Exportação | Não | Sim |
| Suporte | E-mail | E-mail + WhatsApp |
| Período grátis | 7 dias | 7 dias |

(Verificar e ajustar colunas com os dados reais do billing)

**C) FAQ de preços**
- "Preciso de cartão para começar?" — Não, só no fim dos 7 dias.
- "Posso cancelar?" — Sim, a qualquer momento, sem multa.
- "E se eu quiser trocar de plano?" — Upgrade ou downgrade imediatos.
- "Emitem nota fiscal?" — Sim, NFS-e pela Olli Inteligência Digital Sistemas LTDA.

**D) Prova social mínima**
- Enquanto não houver depoimentos reais: número de lotes monitorados pela plataforma (dado real, gerado automaticamente), número de alertas disparados no último mês.

**E) Garantia**
- "7 dias grátis — se não gostar, cancele. Sem perguntas."

---

### 4.6 `/contato` — Página de Contato Comercial

**Objetivo:** Canal de contato claro para quem quer falar com humanos antes de assinar (perfil B2B típico) e para imprensa/parcerias.

**Seções:**

**A) Formulário simples**
- Campos: Nome, E-mail, Assunto (dropdown: Dúvida comercial / Suporte técnico / Imprensa / Parceria / Outro), Mensagem
- CTA: "Enviar mensagem"
- Prazo de resposta: "Respondemos em até 1 dia útil"

**B) Contatos diretos**
- E-mail comercial: contato@fonteia.com.br
- E-mail de privacidade/DPO: privacidade@fonteia.com.br
- (WhatsApp se disponível para plano Corporativo)

**C) Dados da empresa (repetição estratégica)**
```
Olli Inteligência Digital Sistemas LTDA
CNPJ: 65.361.266/0001-05
[Endereço conforme Junta Comercial]
```

**D) Links rápidos**
- FAQ → /faq
- Central de ajuda (futura)
- Status da plataforma (futura)

---

## 5. Como Fortalecer a HOME no Desktop

A home atual tem a estrutura certa mas é rasa nos argumentos de confiança. Não é preciso reescrever — é preciso adicionar camadas entre as seções que já existem.

### 5.1 Barra de fontes oficiais (logo strip)

Inserir imediatamente abaixo do hero, antes da seção "Como funciona":

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Dados coletados diretamente das fontes:
  [Logo RFB] Receita Federal   [Logo gov.br] gov.br   [Logo SLE] Sistema SLE
  (em breve: PGFN · SPU · DETRAN · Compras.gov.br)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Esta faixa cumpre dois papéis: (1) diz de onde vêm os dados sem exigir que o visitante pergunte, (2) associa a Fonte.ia visualmente à autoridade das fontes oficiais do governo.

### 5.2 Seção de prova social honesta

Inserir após "Como funciona", antes dos planos:

- **Enquanto não há depoimentos reais:** Usar números reais e verificáveis gerados pela própria plataforma: "X lotes monitorados desde o lançamento", "Y alertas disparados no último mês", "Z órgãos integrados". Esses dados são mais críveis do que depoimentos fabricados.
- **Assim que tiver 3 clientes reais:** Três cards de depoimento com foto (ou inicial), cargo/perfil do arrematante (não o nome completo se o cliente não quiser), e uma frase específica sobre o resultado. Ex.: "Economizei 2 horas por edital que eu gastava pesquisando no site da Receita."

### 5.3 Menu de navegação expandido (header)

O menu atual tem 3 links. A versão desktop deveria ter no mínimo 5, distribuídos logicamente:

```
[Logo Fonte.ia]  Produto   Para Quem   Preços   Recursos▼   Sobre   [Entrar]  [Começar grátis]
```

Dropdown "Recursos" com:
- Guias
- Blog
- FAQ
- Glossário
- Calculadora de Lance
- Comparações (fonteia-vs-planilha, fonteia-vs-analise-manual)

### 5.4 Seção institucional mínima na home

Entre a seção de módulos e o FAQ, adicionar um bloco de 3 colunas ("Por que a Fonte.ia"):

- Coluna 1: "Empresa registrada" — CNPJ visível, link para /sobre
- Coluna 2: "Dados oficiais rastreáveis" — "Não inventamos. Cada dado tem URL de origem.", link para /seguranca
- Coluna 3: "LGPD em dia" — "Conformidade com a Lei 13.709/2018", link para /privacidade

### 5.5 Footer institucional completo

O rodapé atual da landing é mínimo (provavelmente apenas copyright). Um footer institucional completo para desktop deve ter quatro colunas:

**Coluna 1 — Produto**
- O que é a Fonte.ia → /produto
- Para quem → /para-quem
- Planos e preços → /precos
- Segurança → /seguranca

**Coluna 2 — Recursos**
- Blog → /blog
- Guias → /guias
- FAQ → /faq
- Glossário → /glossario-leiloes
- Calculadora de Lance → /ferramentas/calculadora-lance

**Coluna 3 — Empresa**
- Sobre a Olli/Fonte.ia → /sobre
- Contato → /contato
- Privacidade → /privacidade
- Termos de Uso → /termos
- Cookies → /cookies

**Coluna 4 — Institucional (bloco separado)**
```
Olli Inteligência Digital Sistemas LTDA
CNPJ 65.361.266/0001-05
contato@fonteia.com.br

© 2025 Fonte.ia — Dados públicos, decisões rastreáveis.
```

---

## 6. Hierarquia de Implementação

Ordenado por impacto sobre a percepção de credibilidade vs. esforço de desenvolvimento:

| Prioridade | Entregável | Impacto | Esforço |
|---|---|---|---|
| 1 | Footer institucional completo com CNPJ | Alto | Baixo |
| 2 | Menu de navegação expandido (5+ links) | Alto | Baixo |
| 3 | Página `/sobre` com dados da empresa | Alto | Médio |
| 4 | Barra de logos de fontes oficiais na home | Médio-alto | Baixo |
| 5 | Página `/seguranca` (LGPD + rastreabilidade) | Alto (B2B) | Médio |
| 6 | Seção institucional mínima na home (3 cards) | Médio | Baixo |
| 7 | Página `/para-quem` | Médio (SEO) | Médio |
| 8 | Página `/precos` dedicada | Médio | Baixo |
| 9 | Página `/produto` detalhada | Médio | Médio |
| 10 | Prova social (números reais) na home | Alto quando disponível | Baixo |
| 11 | Página `/contato` | Médio | Baixo |

---

## 7. Resumo Executivo

A Fonte.ia tem conteúdo e produto bons. O que falta é a camada de legitimidade institucional que compradores B2B exigem antes de assinar — e que visitantes de desktop têm tempo e tela para procurar.

**Os três movimentos de maior retorno imediato:**

1. **Footer com CNPJ e dados da empresa em todas as páginas.** Um rodapé sem CNPJ é o sinal número 1 de site amador no Brasil. É a mudança mais barata e mais impactante.

2. **Página `/sobre` com razão social, missão e dados legais.** A Omie, a RD Station e a Nuvemshop provam que essa página não é vaidade — é o filtro que o comprador B2B usa para decidir se a empresa existe de verdade. Um comprador que vai pagar R$ 597/mês quer saber com quem está contratando.

3. **Menu de navegação com 5 links + dropdown de recursos.** Três âncoras numa SPA passam a impressão de microsite. Cinco links com subpáginas reais passam a impressão de plataforma.

O restante (segurança, para-quem, produto detalhado, preços dedicado, contato) consolida a credibilidade e alimenta SEO orgânico — mas os três acima já mudam a percepção visual do desktop em um sprint de desenvolvimento.

---

*Fontes consultadas: omie.com.br, rdstation.com, nuvemshop.com.br/companhia, contaazul.com, leadster.com.br/blog/saas-landing-page/, speedio.com.br/blog/prova-social/, nuvemshop.com.br/blog/gerando-credibilidade-para-sua-loja-selos-de-credibilidade/, basedeconhecimento.tray.com.br (rodapé com CNPJ), receita.economia.gov.br (perfil de arrematantes), ABCOMM 2025.*
