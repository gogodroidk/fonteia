/**
 * prerender-entry.tsx — entrada SSR para a pré-renderização estática.
 *
 * Este módulo NÃO entra no bundle do app (SPA). Ele é compilado isoladamente
 * por `vite build --ssr` (ver scripts/prerender.mjs) e carregado em Node para
 * gerar o HTML estático das rotas públicas de marketing/SEO.
 *
 * Cada entrada de `PRERENDER_ROUTES` aponta para o MESMO componente standalone
 * usado pelo App.tsx em runtime — então o markup pré-renderizado é idêntico ao
 * que o cliente hidrata. Os metadados (title/description) são fixados aqui
 * porque o app os injeta via efeito (`useSeo`/`useEffect`), que não roda em SSR.
 *
 * Mantenha esta lista em sincronia com `publicMarketing` em src/App.tsx.
 */
import type { ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CalculadoraLancePage } from "../src/app/ferramentas/calculadora-lance/page";
import { GuiasPage } from "../src/app/guias/page";
import { GuiaComoComprarPage } from "../src/app/guias/como-comprar-leilao-receita";
import { GuiaComparacaoPage } from "../src/app/guias/leilao-receita-vs-judicial";
import { LeiloesReceitaFederalPage } from "../src/app/publico/leiloes-receita-federal";
import { AnaliseEditalIAPage } from "../src/app/publico/analise-de-edital-com-ia";
import { GlossarioLeiloesPage } from "../src/app/publico/glossario-leiloes";
import { FaqPage } from "../src/app/publico/faq";
import { RiscosLeiloesPage } from "../src/app/publico/riscos-leiloes-publicos";
import { FonteiaVsPlanilhaPage } from "../src/app/publico/fonteia-vs-planilha";
import { FonteiaVsManualPage } from "../src/app/publico/fonteia-vs-analise-manual";
import { ComoParticiparPage } from "../src/app/publico/como-participar-leilao-receita-federal";
import { MelhoresFerramentasPage } from "../src/app/publico/melhores-ferramentas-analisar-leiloes";
import { BlogIndexPage } from "../src/app/publico/blog/page";
import { PostValeAPenaPage } from "../src/app/publico/blog/leilao-receita-vale-a-pena";
import { PostErrosIniciantesPage } from "../src/app/publico/blog/erros-iniciantes-leilao";
import { PostComoLerEditalPage } from "../src/app/publico/blog/como-ler-edital-leilao";
import { SobrePage } from "../src/app/publico/sobre";
import { SegurancaPage } from "../src/app/publico/seguranca";
import { ParaQuemPage } from "../src/app/publico/para-quem";
import { ContatoPage } from "../src/app/publico/contato";
import { LegalPage } from "../src/app/legal/page";
import { PrivacidadeCentralPage } from "../src/app/privacidade/page";

// Wrappers sem props para as páginas legais (LegalPage requer kind + onHome).
function PrivacidadeLegalPage() { return <LegalPage kind="privacidade" onHome={() => {}} />; }
function TermosLegalPage() { return <LegalPage kind="termos" onHome={() => {}} />; }
function CookiesLegalPage() { return <LegalPage kind="cookies" onHome={() => {}} />; }

export interface PrerenderRoute {
  /** Caminho da rota, exatamente como em App.tsx (sem barra final). */
  path: string;
  /** <title> da página. */
  title: string;
  /** <meta name="description">. */
  description: string;
  /** Componente standalone (sem auth) renderizado para HTML estático. */
  Component: ComponentType;
}

/**
 * As 11 rotas públicas indexáveis. Title/description copiados das constantes
 * de cada página (useSeo/useEffect) — são o que o app define no cliente.
 */
export const PRERENDER_ROUTES: ReadonlyArray<PrerenderRoute> = [
  {
    path: "/ferramentas/calculadora-lance",
    title: "Calculadora de lance máximo para leilão — grátis | Fonte.ia",
    description:
      "Calcule grátis o lance máximo que vale a pena dar em um leilão da Receita Federal, já considerando comissão do leiloeiro, tributos e custos. Sem cadastro.",
    Component: CalculadoraLancePage,
  },
  {
    path: "/guias",
    title:
      "Guias de leilão da Receita Federal — como comprar, passo a passo | Fonte.ia",
    description:
      "Guias práticos sobre leilões da Receita Federal: como comprar passo a passo, diferenças entre leilão da Receita, judicial e de banco, e calculadora gratuita de lance.",
    Component: GuiasPage,
  },
  {
    path: "/guias/como-comprar-leilao-receita",
    title:
      "Como comprar em leilão da Receita Federal: passo a passo (2026) | Fonte.ia",
    description:
      "Guia completo para iniciantes: o que é o leilão da Receita Federal (SLE), quem pode participar, como habilitar conta gov.br, dar o lance, pagar o DARF e retirar o bem. Com FAQ.",
    Component: GuiaComoComprarPage,
  },
  {
    path: "/guias/leilao-receita-vs-judicial",
    title:
      "Leilão da Receita Federal vs leilão judicial vs leilão de banco | Fonte.ia",
    description:
      "Tabela comparativa: diferenças entre leilão da Receita Federal, leilão judicial e leilão de banco — o que é vendido, quem organiza, como participar, riscos e onde achar cada um.",
    Component: GuiaComparacaoPage,
  },
  {
    path: "/leiloes-receita-federal",
    title:
      "Leilões da Receita Federal: o que são, como funcionam e como participar (2026) | Fonte.ia",
    description:
      "Guia completo sobre leilões de mercadorias apreendidas e abandonadas da Receita Federal (SLE): tipos de bens, quem pode participar, como funciona o processo do edital ao arremate, e por que usar a Fonte.ia para analisar os lotes com IA.",
    Component: LeiloesReceitaFederalPage,
  },
  {
    path: "/analise-de-edital-com-ia",
    title:
      "Análise de Edital com IA: entenda as letras miúdas do leilão em linguagem simples | Fonte.ia",
    description:
      "A Fonte.ia lê o PDF do edital de leilão da Receita Federal com IA e resume em linguagem de leigo: quem pode participar, datas, como pagar, riscos e o que conferir antes do lance. Apoio à leitura — confirme sempre no edital oficial.",
    Component: AnaliseEditalIAPage,
  },
  {
    path: "/glossario-leiloes",
    title:
      "Glossário de leilões da Receita Federal: termos explicados para leigos (2026) | Fonte.ia",
    description:
      "Edital, EDLE, SLE, DARF, habilitação, lance mínimo, arrematação — todos os termos que assustam em leilão da Receita Federal explicados em linguagem simples. Glossário completo atualizado.",
    Component: GlossarioLeiloesPage,
  },
  {
    path: "/faq",
    title:
      "Perguntas frequentes sobre leilões da Receita Federal e Fonte.ia (2026) | FAQ",
    description:
      "Tire suas dúvidas sobre leilões da Receita Federal: precisa de CNPJ? Dá para parcelar? Posso ver o bem antes? Quanto custa a Fonte.ia? Respostas diretas e honestas.",
    Component: FaqPage,
  },
  {
    path: "/riscos-leiloes-publicos",
    title: "Riscos dos leilões públicos e como se proteger | Fonte.ia",
    description:
      "Guia honesto dos principais riscos de leilões da Receita Federal: bem sem garantia, custos além do lance, restrições legais, prazos curtos e golpes. Saiba como se proteger em cada caso.",
    Component: RiscosLeiloesPage,
  },
  {
    path: "/fonteia-vs-planilha",
    title: "Fonte.ia vs planilha manual: comparação honesta | Fonte.ia",
    description:
      "Comparação direta entre usar a Fonte.ia e controlar leilões da Receita Federal em planilha: tempo, custo, rastreabilidade e erro humano. Honesto sobre o que cada um faz melhor.",
    Component: FonteiaVsPlanilhaPage,
  },
  {
    path: "/fonteia-vs-analise-manual",
    title:
      "Fonte.ia vs análise manual no site da Receita Federal | Fonte.ia",
    description:
      "Comparação direta entre usar a Fonte.ia e fazer tudo manualmente no site da Receita Federal: tempo gasto, rastreabilidade, alertas de prazo e custo. Honesto sobre o que cada abordagem faz melhor.",
    Component: FonteiaVsManualPage,
  },
  {
    path: "/como-participar-leilao-receita-federal",
    title: "Como participar de leilão da Receita Federal: passo a passo (2026) | Fonte.ia",
    description:
      "Passo a passo para participar de um leilão da Receita Federal: conta gov.br, habilitação no Sistema de Leilões Eletrônicos (SLE), lance, pagamento via DARF e retirada do bem, com cuidados em cada etapa.",
    Component: ComoParticiparPage,
  },
  {
    path: "/melhores-ferramentas-analisar-leiloes",
    title: "Melhores ferramentas para analisar leilões da Receita Federal (2026) | Fonte.ia",
    description:
      "Comparativo honesto das formas de analisar leilões da Receita Federal: site oficial, planilha e a Fonte.ia. Critérios: achar lotes, ler edital, calcular custo total, alertas e rastreabilidade.",
    Component: MelhoresFerramentasPage,
  },
  {
    path: "/blog",
    title: "Blog da Fonte.ia: leilões da Receita Federal explicados para leigos | Fonte.ia",
    description:
      "Artigos honestos sobre leilões da Receita Federal: vale a pena?, erros de iniciante e como ler um edital sem ser advogado. Para entender antes de dar o lance — sem promessa de lucro.",
    Component: BlogIndexPage,
  },
  {
    path: "/blog/leilao-receita-vale-a-pena",
    title: "Leilão da Receita Federal vale a pena? O que ninguém te conta | Fonte.ia",
    description:
      "Prós, contras e custos reais de comprar em leilão da Receita Federal. Para quem faz sentido e quando não vale a pena — com honestidade, sem promessa de lucro.",
    Component: PostValeAPenaPage,
  },
  {
    path: "/blog/erros-iniciantes-leilao",
    title: "5 erros de iniciante em leilão da Receita (e como evitar) | Fonte.ia",
    description:
      "Os erros mais comuns de quem começa em leilões da Receita Federal: não ler o edital, esquecer custos, lance emocional, não conferir o bem e perder o prazo. Como evitar cada um.",
    Component: PostErrosIniciantesPage,
  },
  {
    path: "/blog/como-ler-edital-leilao",
    title: "Como ler um edital de leilão sem ser advogado | Fonte.ia",
    description:
      "O que procurar num edital de leilão da Receita Federal: datas, forma de pagamento, condição do bem e restrições. Em linguagem simples, com a IA da Fonte.ia ajudando.",
    Component: PostComoLerEditalPage,
  },
  {
    path: "/sobre",
    title: "Sobre a Fonte.ia e a Olli Inteligência Digital | empresa e missão",
    description:
      "Quem opera a Fonte.ia: Olli Inteligência Digital Sistemas LTDA (CNPJ 65.361.266/0001-05). Missão, o que fazemos com dados públicos e por que confiar.",
    Component: SobrePage,
  },
  {
    path: "/para-quem",
    title: "Para quem é a Fonte.ia: advogados, despachantes, revendedores e iniciantes",
    description:
      "Casos de uso da Fonte.ia em leilões da Receita Federal — escritórios, importadores, revendedores e quem está começando. Veja se faz sentido para você.",
    Component: ParaQuemPage,
  },
  {
    path: "/seguranca",
    title: "Segurança e privacidade (LGPD) — Fonte.ia",
    description:
      "Como a Fonte.ia trata dados (LGPD), por que os dados de leilão são públicos (Lei de Acesso à Informação) e a infraestrutura de segurança (Supabase, Cloudflare, Stripe).",
    Component: SegurancaPage,
  },
  {
    path: "/contato",
    title: "Contato — Fonte.ia | fale com a Olli Inteligência Digital",
    description:
      "Fale com a Fonte.ia: contato@olli.com.br. Dados da empresa (Olli Inteligência Digital Sistemas LTDA, CNPJ 65.361.266/0001-05) e canais de atendimento.",
    Component: ContatoPage,
  },
  {
    path: "/privacidade",
    title: "Política de Privacidade — Fonte.ia",
    description:
      "Política de privacidade da Fonte.ia (Olli Inteligência Digital Sistemas LTDA). Quais dados coletamos, como usamos e seus direitos pela LGPD.",
    Component: PrivacidadeLegalPage,
  },
  {
    path: "/termos",
    title: "Termos de Uso — Fonte.ia",
    description:
      "Termos de uso da Fonte.ia: regras para uso da plataforma, responsabilidades e condições do serviço.",
    Component: TermosLegalPage,
  },
  {
    path: "/cookies",
    title: "Política de Cookies — Fonte.ia",
    description:
      "Como a Fonte.ia usa cookies e tecnologias de rastreamento. Saiba quais cookies usamos e como gerenciar suas preferências.",
    Component: CookiesLegalPage,
  },
  {
    path: "/central-privacidade",
    title: "Central de Privacidade — Fonte.ia",
    description:
      "Central de privacidade da Fonte.ia: exerça seus direitos pela LGPD, solicite exclusão de dados e gerencie consentimentos.",
    Component: PrivacidadeCentralPage,
  },
];

/** Renderiza o componente de uma rota para HTML estático (string). */
export function renderRoute(route: PrerenderRoute): string {
  const { Component } = route;
  return renderToStaticMarkup(<Component />);
}
