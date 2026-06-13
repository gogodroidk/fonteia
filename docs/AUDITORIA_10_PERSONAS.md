# Auditoria de 10 Personas — Fonte.ia (foco: venda, leigo, Google/IA)

> Auditoria de **SÓ-LEITURA** do app web (`apps/web`), por uma banca de 10 personas.
> Data: 2026-06-13. Modelo: Opus 4.8. Nenhum arquivo de código foi alterado.
> **Construída sobre** `docs/AUDITORIA_PRODUTO_UX.md` (não repete o óbvio dela; atualiza o status e foca no que aquela auditoria não cobriu: as novas páginas públicas/SEO/GEO do commit `7b4b546`).
> Referências em `arquivo:linha` apontam para o estado do repo em 2026-06-13.

---

## Contexto técnico que muda tudo (leia antes das personas)

1. **É uma SPA 100% client-side (Vite + React 19, `createRoot`).** Não há SSR/SSG nem prerender. O HTML servido para **toda** URL é o mesmo `apps/web/index.html` (confirmado em `apps/web/dist/index.html` — só existe 1 HTML no build). `apps/web/src/main.tsx:10` monta o React no cliente; o roteamento é `usePathname` lendo `window.location.pathname` (`apps/web/src/lib/use-pathname.ts:10`).
2. **Deploy = Cloudflare assets-only** (`wrangler.jsonc:5-8`, `not_found_handling: single-page-application`). Logo, `/guias/...` e `/ferramentas/...` resolvem (servem o index.html), mas **sem conteúdo no HTML** — todo texto é injetado por JS depois.
3. **Consequência central para SEO/AEO:** todo o conteúdo das páginas públicas (guias, calculadora, glossário, FAQ da landing) **só existe depois do JS rodar**. Googlebot renderiza JS (com atraso na fila), mas a maioria dos crawlers de IA (GPTBot, ClaudeBot, PerplexityBot, CCBot, Bytespider) **não executa JS** — eles veem só o `<title>`/`<meta>` estáticos do index e o `<div id="root">` vazio. O esforço de AEO está, hoje, **majoritariamente invisível para as IAs** que ele quer atingir. Isso enquadra quase tudo na persona 7/8.
4. **Front usa só chaves públicas** (publishable Supabase em `lib/api-client.ts:9` e `auth/supabase-client.ts:12`; `pk_live` do Stripe em `config/stripe.ts:16`). **Nenhuma `service_role` no front** — correto. A `service_role` só aparece no Worker de webhook (`services/stripe-webhook/src/worker.ts:330`).

---

## Persona 1 — Usuário leigo no celular

- **[Alta] O leigo não vê NADA antes de criar conta para ver lotes reais.** A landing (`app/landing/page.tsx`) mostra só mock "exemplo ilustrativo" (`:657`, `:1178`). Os lotes reais (`listLeilaoLots`) só existem atrás do login. Para um produto cujo valor é "dado real rastreável", esconder 100% do dado real até o cadastro é o maior atrito de conversão do leigo. **Sugestão:** uma rota pública `/leiloes-receita-federal` (já referenciada e quebrada — ver Persona 8) que liste 5-10 lotes reais read-only com CTA "ver todos → criar conta". (Prior audit 3.5 já apontou; sigo reforçando porque agora há infra de páginas públicas para fazê-lo barato.)
- **[Alta] Headline da landing fala de duas verticais e confunde.** Hero: "Antes de dar lance, passe o lote no Raio-X" + "leilões da **Receita Federal**" (`:511`,`:533`). Mas a seção logo abaixo diz **"Leilão judicial não precisa dar medo"** (`:904`) e o passo 3 fala "para o investidor que exige rigor" (`:1043`). O leigo lê "judicial" e "investidor" e pensa "não é pra mim / não é o que eu vi no anúncio". **Sugestão:** trocar "judicial" por "da Receita" em `:904`; tirar "investidor que exige rigor" e falar "pra quem nunca arrematou nada".
- **[Média] A barra de busca do topo continua sendo um input falso `readOnly` que só navega para /lotes e mostra "⌘K"** (`app/App.tsx:317-321`). No celular o teclado não abre; o "⌘K" é jargão sem handler. (Prior audit 1.6 — **não corrigido**; mantenho por ser atrito direto do leigo mobile e trivial de resolver.)
- **[Média] FAB de IA é só um ícone de sparkles sem rótulo** (`app/App.tsx:395-403`, `aria-label="Perguntar com IA"` mas sem texto visível). O leigo não sabe que aquele botão flutuante é "pergunte em português". (Prior audit 2.2 — **não corrigido**.) **Sugestão:** rótulo "Perguntar" ou um balão de 1ª vez.
- **[Baixa] "Bom dia, {nome}" + copy com erros de acento no painel:** "Leiloes governamentais monitorados em tempo real — Fonte antes de opiniao." (`app/page.tsx:418`), "Ultimos lotes publicados" (`:662`), "Distribuicao de confianca" (`:937`). Texto sem acento passa amador para o público BR. **Sugestão:** revisar acentuação de toda a `page.tsx` (há dezenas).

## Persona 2 — Comprador iniciante de leilão (medo, risco, golpe)

- **[Alta] O melhor conteúdo anti-medo está numa página MORTA.** O glossário (`app/publico/glossario-leiloes.tsx`) explica EDLE, SLE, DARF, "no estado em que se encontra", comissão — exatamente o que tira o medo do leigo. Mas **essa página não está roteada** (não aparece em `app/App.tsx` `publicMarketing`, `:573-578`) nem no sitemap. Ela é inacessível: digitar `/publico/glossario-leiloes` cai no SPA → index → landing. **Sugestão:** rotear em `App.tsx` e adicionar ao sitemap (ver Persona 8/10 — é um quick win enorme).
- **[Média] O guia "Como comprar" é honesto e muito bom** (`app/guias/como-comprar-leilao-receita.tsx`): passo a passo gov.br Prata/Ouro, DARF, "no estado em que se encontra" (`:490-497`), FAQ "leilão é confiável?" (`:282-292`). Isso é ouro anti-golpe. **Problema:** ele também está atrás de JS (invisível p/ IAs) e não tem JSON-LD real (ver Persona 8). Conteúdo certo, entrega errada.
- **[Média] No detalhe do lote, o "Como dar lance" (gov.br, habilitação) continua colapsado por padrão** e o CTA "Participar no leilão" joga o leigo direto no SLE sem avisar que precisa de habilitação prévia. (Prior audit 1.9 — manter; é o ponto onde o iniciante mais se frustra "na hora H".)
- **[Média] Falta um selo de confiança "site oficial vs intermediário" visível ao leigo assustado.** O leigo confunde "Fonte.ia" com "será que é golpe?". A landing tem "Rastreável" e "Fonte oficial: Receita Federal" no mock, mas não diz **em texto de gente**: "A Fonte.ia não vende nada nem recebe seu lance; quem conduz o leilão é a Receita Federal; nós só organizamos o dado público". **Sugestão:** uma faixa "Como a Fonte.ia se relaciona com o leilão oficial" na landing e no detalhe.

## Persona 3 — Revendedor profissional (margem, lance máximo, velocidade)

- **[Alta] A calculadora de lance máximo — a ferramenta que o profissional ama — só existe PÚBLICA e desconectada do lote real.** `app/ferramentas/calculadora-lance/page.tsx` é boa (calcula teto por margem, comissão, tributos, custos fixos, e avisa "não compensa" em `:565-579`). Mas dentro do app, no detalhe do lote, o custo total ainda roda só no lance mínimo (prior audit P3). O pro quer digitar "se eu der X neste lote, sai Y" **dentro** do lote, com FIPE já preenchida. **Sugestão:** embutir a mesma calculadora no `lot-detail-page` pré-preenchida com `lot.minimumBidCents` e FIPE.
- **[Alta] Não há comparar lotes, exportar, nem alerta por critério.** O plano Corporativo promete "Exportação CSV/XLSX (em breve)" e "API (em breve)" (`data/leiloes-seed.ts:341-343`) — tudo "em breve". O pro não tem como tirar 50 lotes para uma planilha nem comparar 3 lado a lado. Hoje o profissional faz isso na mão. **Sugestão (médio prazo):** ao menos um "exportar CSV da lista filtrada" client-side (os dados já estão no browser via `listLeilaoLots`).
- **[Média] Alertas são por LOTE salvo, não por critério.** O pro quer "avise quando abrir carro em SP até R$50k", não salvar lote a lote. (Prior audit P6 — reforço: é o que faz o pro pagar e ficar.)
- **[Média] Score por regra é raso para o profissional.** O score (0-100) usa 4 fatores fixos (PF/PJ, prazo, acessibilidade do mínimo, tem imagem). O pro não decide por isso — ele quer desconto vs FIPE/mercado. O `lotEconomia`/`descontoPct` já existe e aparece na lista (`page.tsx:849-861`) — **isso** é o que o pro valoriza; eleve-o acima do "score".
- **[Baixa] Velocidade ok:** code-splitting por rota (`App.tsx:33-76`), tabela com scroll infinito (`page.tsx:223-244`), service worker network-first (`public/sw.js`). Sem ressalvas graves de performance.

## Persona 4 — Especialista mobile

- **[Média] Tabelas do detalhe do lote (custo total, financeiro) sem `overflow-x` com rótulos longos dentro de `<td>`.** (Prior audit 1.8 — manter; em ≤360px o valor monetário quebra.)
- **[Média] A calculadora pública tem header com padding fixo de 48px que só cai para 24px via CSS escopado** (`ferramentas/calculadora-lance/page.tsx:313-322` inline `padding:"16px 48px"`, sobrescrito por `.calc-header` só ≥/≤540px). O estilo inline e o escopado disputam; risco de header apertado em faixa intermediária. **Sugestão:** mover o padding 100% para a classe responsiva.
- **[Média] Os guias e o glossário escondem a navegação inteira no mobile** (`guias`/`glossario` `@media(max-width:720px){ nav{display:none} }`, ex. `glossario-leiloes.tsx:147`). No celular o usuário do guia perde os botões "Entrar"/"Começar grátis" do topo — só sobra o do rodapé, longe. **Sugestão:** manter ao menos o CTA primário no header mobile.
- **[Baixa] App shell mobile é sólido:** bottom nav fixa com alvos ≥56px (`App.tsx:495-497`), safe-area em toda parte, FAB ≥44px. Bom. (Confirma prior audit.)
- **[Baixa] Alvos de toque das linhas da tabela do painel são a linha inteira** (`role=button` em `<tr>`, `page.tsx:771-791`) — bom para o dedo, mas há um botão "Analisar" dentro que faz `stopPropagation` (`:904`) — ok.

## Persona 5 — UX de produto SaaS

- **[Alta] Home logada joga densidade no leigo sem "primeira ação".** O painel abre com saudação + 4 KPIs + Oportunidade do dia + Encerrando + tabela + distribuição + fontes (`app/page.tsx`). Não há um "comece por aqui". (Prior audit 2.2 — reforço: depois do onboarding, abrir a Oportunidade do dia já no Raio-X.)
- **[Alta] Vocabulário do score inconsistente entre telas:** painel/lista usam **"confiança"** (`page.tsx:686-689`, `confiancaBadge`), detalhe usa **"oportunidade"**, landing usa **"score de oportunidade"**, login usa "Score de oportunidade". O mesmo número tem 2 nomes. (Prior audit 2.3 — **não unificado**.) **Sugestão:** escolher 1 termo ("oportunidade") em todo lugar.
- **[Média] Empty/error/loading states existem e são decentes** (painel: `page.tsx:712-730`; lote não encontrado: `App.tsx:375-387`). Bom. **Mas** o banner "Pagamento recebido / estamos ativando" persiste por querystring `?checkout=sucesso` e reaparece ao recarregar (prior audit 1.10 — não corrigido; some só no X, sem `replaceState`).
- **[Média] "Modo demonstração" é código morto em produção** (fallback de chaves embutido → `isSupabaseConfigured` sempre true; `login-page.tsx:466-482` nunca aparece). (Prior audit 1.11 — manter.)
- **[Baixa] Conta mostra dados hardcoded ("Membro desde Junho 2026", "Não cadastrado") mesmo para pagante.** (Prior audit 2.7 — manter; mina a confiança pós-pagamento.)

## Persona 6 — Conversão e vendas

- **[CRÍTICA] O Raio-X com IA — feature nº 1 do plano de R$197 — continua GRÁTIS e ABERTO. (Atualização do prior audit 1.1: só foi fechado pela METADE.)**
  - Servidor: o handler `/ia/edital` ganhou gate (`supabase/functions/fonteia/index.ts:272`, `if(!(await isProUser(request))) → 403`). **MAS o handler do Raio-X `/ia/raio-x` e a raiz `/fonteia` (`:300-330`) chamam `analyzeLotWithGemini` sem NENHUM `isProUser`.** Qualquer um com a apikey pública (que está no bundle) gera Raio-X ilimitado.
  - Front: o botão "Gerar Raio-X com IA" (`app/leiloes/lot-detail-page.tsx:1975-1991`) e `runRaioX` (`:734`) **não têm `if(!isPro)`** — diferente de `analisarEdital` (`:874-875`) e de `handleSaveAlert` (`:807`), que gateiam. Ou seja, todo logado gera de graça e ainda custa Gemini para a empresa.
  - **Impacto:** o principal motivo de pagar vem incluso no free → enfraquece toda a monetização. **Conserto:** adicionar `if(!(await isProUser(request))) return json({error:"plano_requerido"},403)` no início de `:300`; e no front espelhar o tratamento de 403 de `analisarEdital` dentro de `runRaioX` + estado "destrave assinando" no card `:1958-1992`. Decidir: se Raio-X for isca grátis, **remover** "Raio-X com IA ilimitado" das features pagas (`leiloes-seed.ts:319`) — senão é propaganda enganosa.
- **[Alta] "Falar com vendas" do Corporativo dispara checkout real de R$597.** `cta:"Falar com vendas"` (`leiloes-seed.ts:337`) + Payment Link configurado (`config/stripe.ts:21`) → `billing/page.tsx` redireciona ao Stripe. (Prior audit 1.2 — **não corrigido**.) Expectativa quebrada + risco de cobrança indevida.
- **[Alta] Landing ainda tem ramo "Grátis" morto e badge "⭐ Mais popular"** (`landing/page.tsx:1296`, `:1284`) enquanto o billing diz "sem plano grátis". (Prior audit 1.3 — **não corrigido**.) Bomba-relógio de oferta divergente.
- **[Alta] Depoimentos fabricados com cifras de ganho** ("R$ 506 mil em economia/ano", "3× mais lotes", "11h/semana") em `leiloes-seed.ts:280-302`. (Prior audit 1.4 — **não corrigido**.) Viola o princípio de honestidade; se renderizados, é prova social falsa (risco CDC). Hoje parecem órfãos, mas o dado existe.
- **[Alta] CTA não carrega a intenção de compra.** Todo botão de plano na landing chama `onLogin` → /entrar, sem `?plano=pro` (`landing/page.tsx:1330`). Pós-login, cai no painel, não no checkout do plano clicado. (Prior audit 3.2 — manter.)
- **[Média] A calculadora pública não captura e-mail nem empurra trial no momento de maior intenção.** O leigo calcula o lance, vê o resultado, e o único CTA é "Ver os lotes reais" → /entrar (`calculadora-lance/page.tsx:725-742`). Falta um "quer que eu te avise quando abrir um lote assim? deixe seu e-mail" — captura de lead grátis com altíssima intenção.
- **[Média] Paywall só aparece em alerta e edital, nunca no Raio-X** (porque Raio-X é grátis — ver crítica). Depois de fechar o gate do Raio-X, ele vira o gatilho de upgrade mais forte do produto.

## Persona 7 — SEO técnico

- **[CRÍTICA] Conteúdo das páginas públicas é JS-only sem fallback no HTML.** (Ver "Contexto técnico" #3.) O `index.html` estático tem um `<title>` e `<meta description>` **fixos e iguais para toda URL** (`apps/web/index.html:12`,`:32`). Os títulos/descrições por página são injetados por JS (`useEffect`/`useSeo`) só após render. Para o Google é "renderizável mas frágil"; para crawlers de IA sem JS, **as páginas são casca vazia**. **Sugestão (a decisão estrutural #1 de SEO):** pré-renderizar as rotas públicas em HTML estático no build (ex. `vite-plugin-prerender`/script de SSG por rota, ou mover guias para HTML/MDX gerado). Sem isso, todo o resto do SEO rende pouco.
- **[Alta] `<link rel="canonical">` é fixo em `https://fontebrasil.online/` no HTML** (`index.html:16`) para **todas** as URLs. O `useSeo` corrige no cliente, mas as páginas que **não** usam `useSeo` (todas as guias e a calculadora — ver abaixo) **ficam com canonical apontando para a home**. Isso pode fazer o Google tratar `/guias/...` como duplicata da home. **Sugestão:** canonical por rota (idealmente no HTML pré-renderizado).
- **[Alta] As páginas públicas de conteúdo NÃO usam o hook `useSeo` nem emitem JSON-LD.** Só o glossário (morto) usa (`glossario-leiloes.tsx:2`,`:116`). Guias e calculadora setam título/description na mão via `useEffect` (`guias/page.tsx:117-129`, `como-comprar...:217-233`, `calculadora-lance:191-209`) **sem canonical, sem og:, sem JSON-LD**. Os builders ricos de `lib/seo.ts` (`articleJsonLd`, `faqJsonLd`, `breadcrumbJsonLd`) estão **escritos mas não usados** em nenhuma página viva. **Sugestão:** trocar os `useEffect` manuais por `useSeo({...})` com Article+FAQ JSON-LD em cada guia.
- **[Alta] Sitemap lista URLs que não rendem conteúdo no HTML e omite a melhor página.** `public/sitemap.xml` inclui `/guias/...` e a calculadora (bom), mas **não inclui o glossário** (que nem está roteado) e **inclui `/entrar`** (priority 0.5) — uma tela de login não tem valor de índice. **Sugestão:** remover `/entrar`; adicionar glossário e a futura `/leiloes-receita-federal` depois de roteá-las.
- **[Média] `WebSite` SearchAction aponta para rota inexistente.** `seo.ts:57` e o JSON-LD do `index.html` declaram `target: /buscar?q=` (sitelinks searchbox), mas a busca real é `/app/buscar` **atrás de login** (`App.tsx:117`). O Google seguiria um endpoint de busca que não existe publicamente. **Sugestão:** remover o SearchAction enquanto não houver `/buscar` público, ou criar a rota pública.
- **[Média] H1 duplicado/semântica em algumas páginas.** A calculadora usa `<h2 className="h1">` para o título do CTA e tem 2 blocos `h2` "Como funciona"/"Quer ver os lotes" (`calculadora-lance:649`,`:706`) — ok, mas o guia de compra põe um `<h1 itemProp="name">` **e** o `index.html` não tem H1 (SPA). Conferir 1 H1 por página após pré-render.
- **[Baixa] robots.txt está correto** (`public/robots.txt`): `Allow: /` + `Disallow: /app` por agente, IAs liberadas no público. **Porém referencia `/llms.txt`** (`:6`) que **não existe** — promessa quebrada (ver Persona 8). Nota: o `dist/robots.txt` e o `public/robots.txt` foram regenerados hoje; garantir que o build publique a versão com Disallow.

## Persona 8 — AEO/GEO (otimização para IAs)

- **[CRÍTICA] `/llms.txt` não existe** (verificado: não há `public/llms.txt` nem `llms-full.txt`), apesar de o robots.txt prometê-lo (`robots.txt:6`). É o artefato nº 1 de GEO. **Sugestão:** criar `public/llms.txt` com 1 parágrafo do que é a Fonte.ia + links para guias/glossário/calculadora + a definição honesta "organizamos dado público da Receita, não vendemos nem recebemos lances".
- **[CRÍTICA] FAQ/HowTo/Glossário não chegam às IAs.** As IAs sem JS (GPTBot, ClaudeBot, PerplexityBot, CCBot) leem o HTML cru. Hoje:
  - A landing tem 5 perguntas excelentes (`landing/page.tsx:286-311`) **sem FAQPage JSON-LD** e em JS — invisíveis.
  - Os guias usam **Microdata** (`itemScope itemType="schema.org/FAQPage"`, `como-comprar...:619`) — mas como tudo é injetado por JS, o crawler sem JS não vê nem a microdata. E a microdata de **HowTo está quebrada**: `itemProp="step"` está num `<h2>` de seção (`como-comprar...:461`) em vez de envolver `HowToStep` reais com `name`/`text`. Não vira rich result.
  - O glossário (a melhor fonte de definições para "o que é DARF/EDLE") tem `faqJsonLd` correto **mas a página está morta** (não roteada).
  - **Sugestão:** (1) emitir FAQPage JSON-LD real na landing e nos guias via `useSeo`; (2) corrigir o HowTo (usar `HowToStep`); (3) rotear o glossário; (4) e principalmente **pré-renderizar** para o JSON-LD existir no HTML.
- **[Alta] Links internos para páginas que não existem (soft-404 que confunde IA e Google).** O glossário e o rodapé linkam para **`/leiloes-receita-federal`** (`glossario-leiloes.tsx:385`,`:509`) e **`/publico/faq`** (`:454`,`:518`) — **nenhuma das duas existe nem está roteada**. No SPA elas servem o index (landing) com status 200 → soft-404. IA segue o link e recebe a landing como se fosse "a página de leilões" ou "o FAQ". **Sugestão:** ou criar essas rotas, ou remover os links até existirem.
- **[Média] Autoridade/E-E-A-T fraca para IA.** O JSON-LD `Organization` (`index.html:39-49`) tem `email` e `areaServed`, bom. Mas falta `sameAs` (perfis sociais), data de fundação consistente (seo.ts diz `foundingDate:"2024"`, `:34`, mas a copy fala "lançado 2026"), e qualquer sinal de quem é "Olli". IA cita fontes com autoridade demonstrável. **Sugestão:** `sameAs`, página "Sobre", consistência de datas.
- **[Média] Respostas diretas existem mas estão presas.** Os guias respondem bem "precisa de CNPJ?", "dá pra parcelar?", "comissão?" (`como-comprar...:235-304`) — formato ideal para AEO. Só falta entregá-las em HTML + JSON-LD. O conteúdo está pronto; é problema de **entrega**, não de redação.

## Persona 9 — Técnico Supabase / Stripe / Cloudflare

- **[CRÍTICA — repete a venda] Gating de plano no servidor NÃO cobre o Raio-X.** `isProUser` (`fonteia/index.ts:54-76`) é bem-feito (lê o token do usuário, chama `my_plan`, rejeita a apikey pública em `:57`), e é aplicado ao edital (`:272`). **Não é aplicado ao `/ia/raio-x` nem à raiz `/fonteia`** (`:300`). Resultado: recurso pago aberto + custo de IA pago pela empresa para não-pagantes. (É o mesmo achado da Persona 6, mas aqui é o **buraco de autorização** concreto.)
- **[Média] `verify_jwt=false` na função `fonteia` é intencional e tem auth própria — ok, mas amplia a superfície.** O comentário (`fonteia/index.ts:3-5`) explica que o gateway rejeitava o token; a função faz auth própria via `my_plan`. Aceitável, **desde que** todos os caminhos pagos passem por `isProUser` (hoje o Raio-X não passa). Confirmar que não há config de `verify_jwt` per-function em `supabase/config.toml` sobrescrevendo (não encontrei `config.toml` no repo — verificar se está versionado).
- **[Baixa — POSITIVO] Webhook Stripe valida assinatura corretamente.** `services/stripe-webhook/src/worker.ts` faz HMAC-SHA256, monta `timestamp.payload`, compara candidatos e retorna 400 em assinatura inválida (`:483-489`), checa secrets ausentes (`:475`). `service_role` só no Worker (`:330-331`). Liberação de plano por webhook, não por redirect (`config/stripe.ts:11-12`). Correto.
- **[Baixa — POSITIVO] Cloudflare: dashboard `/app` fora do índice** (`robots.txt:10`) e o SPA fallback não cacheia rota sensível de forma perigosa (assets-only, sem cache de resposta autenticada). Sem `service_role` no edge de assets.
- **[Baixa] RLS: a query pública `entities?kind=eq.auction_lot` roda com a chave publishable** (prior audit 1.11). **Ação de auditoria:** confirmar no banco (via `get_advisors` security) que RLS cobre 100% das tabelas expostas por PostgREST com a publishable — não validável só pelo front.
- **[Baixa] Service worker network-first** (`public/sw.js`) está ok, mas cacheia respostas GET de qualquer origem http (`:20-29`); como as chamadas de IA são POST, não vazam para cache. Sem ressalva grave.

## Persona 10 — Revisor crítico final (corta perfumaria)

A banca concorda: **o produto já é honesto e maduro no núcleo**; o que falta é (a) **fechar o vazamento de receita do Raio-X**, (b) **fazer as páginas públicas realmente existirem para Google/IA** (hoje metade está morta ou invisível), e (c) **deixar o leigo provar valor sem cadastrar**. Tudo o resto é secundário.

### 🟢 FAZER AGORA (gera venda + ajuda leigo + faz Google/IA entender)

1. **Fechar o gate do Raio-X no servidor E no front** (recurso pago nº 1 está grátis e aberto).
   - Arquivos: `supabase/functions/fonteia/index.ts` (adicionar `isProUser` no handler `:300`); `apps/web/src/app/leiloes/lot-detail-page.tsx` (`runRaioX` `:734` e botão `:1975` com `if(!isPro)` + tratar 403 como em `analisarEdital`); `apps/web/src/data/leiloes-seed.ts:319` (se virar isca grátis, tirar "ilimitado" das features pagas).
2. **Rotear o glossário e criar as rotas públicas que já são linkadas e quebradas** (`/publico/glossario-leiloes`, `/leiloes-receita-federal`, `/publico/faq`).
   - Arquivos: `apps/web/src/App.tsx:573-578` (adicionar ao `publicMarketing`); `apps/web/public/sitemap.xml` (adicionar URLs reais, remover `/entrar`); remover/!corrigir os links mortos em `glossario-leiloes.tsx:385,454,509,518`.
3. **Pré-renderizar as rotas públicas em HTML no build** (sem isso, todo o SEO/AEO/JSON-LD é invisível para IAs e frágil no Google).
   - Arquivos: config de build do `apps/web` (adicionar passo SSG/prerender p/ `/guias*`, `/ferramentas/*`, glossário, `/leiloes-receita-federal`); ajustar `apps/web/index.html` (canonical por rota deixa de ser fixo).
4. **Trocar os `useEffect` de SEO manual pelo `useSeo` com FAQ/Article JSON-LD** nas guias e na landing (os builders já existem em `lib/seo.ts`, só não são usados).
   - Arquivos: `apps/web/src/app/guias/page.tsx`, `apps/web/src/app/guias/como-comprar-leilao-receita.tsx`, `apps/web/src/app/guias/leilao-receita-vs-judicial.tsx`, `apps/web/src/app/ferramentas/calculadora-lance/page.tsx`, `apps/web/src/app/landing/page.tsx` (emitir `faqJsonLd(FAQ_ITEMS)`).
5. **Criar `public/llms.txt`** (já prometido no robots, não existe).
   - Arquivo: `apps/web/public/llms.txt`.
6. **Corrigir as inconsistências de oferta** (prior audit, ainda abertas e tóxicas): CTA Corporativo vs link R$597, ramo "Grátis" morto na landing, depoimentos com ganho fabricado.
   - Arquivos: `apps/web/src/data/leiloes-seed.ts` (`:337` CTA, `:280-302` depoimentos), `apps/web/src/config/stripe.ts:21`, `apps/web/src/app/billing/page.tsx`, `apps/web/src/app/landing/page.tsx:1296`.
7. **Amostra de lotes reais + e-mail-capture na calculadora** (prova de valor antes do cadastro; lead de alta intenção).
   - Arquivos: nova `/leiloes-receita-federal` lendo `features/leiloes/leiloes-api`; `apps/web/src/app/ferramentas/calculadora-lance/page.tsx` (campo "me avise quando abrir um lote assim").

### 🟡 FAZER DEPOIS (importa, mas não trava venda/entendimento agora)

- Unificar vocabulário do score ("oportunidade" em todo lugar) e os dois `ScoreRing` divergentes (prior audit 1.5/2.3).
- `?plano=pro` deep-link da landing até o checkout (prior audit 3.2).
- Calculadora embutida no detalhe do lote, pré-preenchida com FIPE (prior audit P3 / Persona 3).
- Alertas por critério (categoria+cidade+teto), não por lote salvo (prior audit P6).
- Onboarding com "primeiro lote guiado" + rótulo no FAB + matar a searchbar falsa do topo.
- Limpar `?checkout=sucesso` da URL + "atualizar status do plano"; status de assinatura real na conta (prior audit 1.10/2.7).
- Corrigir HowTo microdata (usar `HowToStep`); adicionar `sameAs`/página "Sobre" para E-E-A-T; remover SearchAction `/buscar` enquanto não houver rota pública.
- Faixa "como a Fonte.ia se relaciona com o leilão oficial" (anti-medo/anti-golpe) na landing e no detalhe.
- Revisar acentuação de `app/page.tsx` e textos sem acento.
- Exportar CSV da lista filtrada (client-side) para o profissional.

### 🔴 NÃO FAZER (perfumaria / desperdício agora)

- **Não** investir em mais módulos "em breve" (Licitações, INPI, CNPJ, Ambiental na landing `:1140-1159`) antes de Leilões converter — promessa que dilui o foco.
- **Não** reintroduzir os depoimentos com cifras (remover, não "melhorar").
- **Não** construir Customer Portal do Stripe agora (`stripe.ts:32` vazio é a escolha certa por ora; cancelamento por e-mail basta no estágio atual).
- **Não** caçar micro-ajustes visuais (sombras, parallax do hero, dark-mode do track do ScoreRing) antes dos 7 itens "fazer agora".
- **Não** prometer "busca em português com IA" na headline da busca enquanto for `includes()` (prior audit 2.4) — ajustar a copy é "fazer depois", mas **não** construir NLP só para cumprir a promessa.
- **Não** manter o ramo `demoMode` (código morto) — mas removê-lo é "fazer depois", não agora.

---

*Auditoria de só-leitura. Nenhum arquivo de código foi alterado. Esta auditoria atualiza o status de `AUDITORIA_PRODUTO_UX.md`: o gate de IA foi fechado só para o edital, **não** para o Raio-X; e as novas páginas públicas/SEO existem mas estão parcialmente mortas/invisíveis.*
