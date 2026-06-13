// leiloes-seed.ts — Fonte.ia typed reference data — LEILÕES GOVERNAMENTAIS
// Ported from docs/design/data.jsx. No JSX, no runtime deps.

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface Fonte {
  id: string;
  nome: string;
  sigla: string;
  cor: string;
}

export interface LeilaoSeed {
  id: string;
  tipo: string;
  cat: string;
  titulo: string;
  cidade: string;
  vara: string;
  processo: string;
  avaliacao: number;
  minimo: number;
  praca: string;
  dataFim: string;
  hora: string;
  score: number;
  risco: "baixo" | "medio" | "alto";
  fontes: string[];
  ocupado: boolean;
  divida: number;
  desc: string;
  leiloeiro: string;
  visitas: number;
  fav: number;
  linkOficial?: string | undefined;
}

export interface OverviewStat {
  label: string;
  value: number;
  delta: number;
  spark: number[];
  prefix?: string | undefined;
  suffix?: string | undefined;
}

export interface Depoimento {
  nome: string;
  papel: string;
  txt: string;
  avatar: string;
  ganho: string;
}

export interface Plano {
  id: string;
  nome: string;
  preco: number;
  periodo: string;
  tagline: string;
  destaque: boolean;
  cta: string;
  feats: string[];
  limite: string;
}

// ---------------------------------------------------------------------------
// Formatadores (equivalentes a BRL / BRLc / pct do data.jsx)
// ---------------------------------------------------------------------------

export function formatBRL(n: number): string {
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function formatBRLc(n: number): string {
  return "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatPct(n: number): string {
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + "%";
}

// ---------------------------------------------------------------------------
// FONTES — fontes oficiais
// ---------------------------------------------------------------------------

export const FONTES: Fonte[] = [
  { id: "rfb",     nome: "Receita Federal do Brasil",                    sigla: "RFB",    cor: "#1D5FE0" },
  { id: "pgfn",    nome: "Procuradoria-Geral da Fazenda Nacional",        sigla: "PGFN",   cor: "#6D5CE0" },
  { id: "spu",     nome: "Secretaria de Patrimônio da União",             sigla: "SPU",    cor: "#0FB7A0" },
  { id: "detran",  nome: "Departamento de Trânsito",                      sigla: "DETRAN", cor: "#C98A2E" },
  { id: "compras", nome: "Compras.gov.br — ComprasNet",                   sigla: "GOV",    cor: "#C2557D" },
];

// ---------------------------------------------------------------------------
// LEILAO_SEED — 6 lotes governamentais
// ---------------------------------------------------------------------------

export const LEILAO_SEED: LeilaoSeed[] = [
  {
    id: "RFB-0042-87",
    tipo: "eletronicos",
    cat: "Eletrônicos",
    titulo: "Lote 42 — Smartphones e notebooks",
    cidade: "Alfândega do Porto de Santos · SP",
    vara: "Receita Federal — DRF Santos",
    processo: "Edital RFB 0700100/2026",
    avaliacao: 920000,
    minimo: 414000,
    praca: "Leilão eletrônico",
    dataFim: "18 jun 2026",
    hora: "14:00",
    score: 94,
    risco: "baixo",
    fontes: ["rfb", "compras", "pgfn"],
    ocupado: false,
    divida: 9200,
    desc: "Mercadoria apreendida por abandono. 320 aparelhos lacrados, laudo técnico anexado ao edital. Retirada no depósito alfandegário de Santos.",
    leiloeiro: "Receita Federal do Brasil",
    visitas: 312,
    fav: 41,
    linkOficial: "https://www.gov.br/receitafederal/pt-br/servicos/leilao",
  },
  {
    id: "RFB-0118-31",
    tipo: "veiculo",
    cat: "Veículo",
    titulo: "Lote 118 — Toyota Hilux SW4 2023 (importada)",
    cidade: "Alfândega de Foz do Iguaçu · PR",
    vara: "Receita Federal — ALF Foz do Iguaçu",
    processo: "Edital RFB 0810044/2026",
    avaliacao: 385000,
    minimo: 173250,
    praca: "Leilão eletrônico",
    dataFim: "21 jun 2026",
    hora: "15:30",
    score: 88,
    risco: "baixo",
    fontes: ["rfb", "detran", "compras"],
    ocupado: false,
    divida: 14800,
    desc: "Veículo retido em operação de fronteira. Documentação de regularização para emplacamento detalhada no edital. Vistoria liberada no pátio.",
    leiloeiro: "Receita Federal do Brasil",
    visitas: 488,
    fav: 67,
  },
  {
    id: "RFB-0207-55",
    tipo: "mercadoria",
    cat: "Bebidas",
    titulo: "Lote 207 — Vinhos e destilados importados",
    cidade: "Alfândega de São Paulo · SP",
    vara: "Receita Federal — DRF São Paulo",
    processo: "Edital RFB 0700233/2026",
    avaliacao: 132000,
    minimo: 52800,
    praca: "Leilão eletrônico",
    dataFim: "14 jun 2026",
    hora: "11:00",
    score: 71,
    risco: "medio",
    fontes: ["rfb", "compras"],
    ocupado: false,
    divida: 4100,
    desc: "1.240 garrafas com importação irregular. Lote destinado a pessoa jurídica com inscrição estadual. Validade e armazenagem informadas no laudo.",
    leiloeiro: "Receita Federal do Brasil",
    visitas: 421,
    fav: 63,
  },
  {
    id: "SPU-0331-09",
    tipo: "imovel",
    cat: "Imóvel da União",
    titulo: "Lote 331 — Galpão da União 1.000m²",
    cidade: "Nova Lima · MG",
    vara: "Secretaria de Patrimônio da União — MG",
    processo: "Edital SPU 0033190/2026",
    avaliacao: 1640000,
    minimo: 984000,
    praca: "2º leilão",
    dataFim: "27 jun 2026",
    hora: "10:00",
    score: 62,
    risco: "medio",
    fontes: ["spu", "pgfn"],
    ocupado: true,
    divida: 21800,
    desc: "Imóvel funcional da União em desafetação. Ocupação parcial a regularizar — prazo de desocupação previsto no edital. Avaliação da SPU vigente.",
    leiloeiro: "Secretaria de Patrimônio da União",
    visitas: 96,
    fav: 12,
  },
  {
    id: "RFB-0402-14",
    tipo: "maquinario",
    cat: "Maquinário",
    titulo: "Lote 402 — Maquinário industrial CNC",
    cidade: "Alfândega de Itajaí · SC",
    vara: "Receita Federal — ALF Itajaí",
    processo: "Edital RFB 0900421/2026",
    avaliacao: 410000,
    minimo: 184500,
    praca: "Leilão eletrônico",
    dataFim: "30 jun 2026",
    hora: "16:00",
    score: 79,
    risco: "baixo",
    fontes: ["rfb", "compras", "pgfn"],
    ocupado: false,
    divida: 12700,
    desc: "Centros de usinagem importados, baixa quilometragem de uso. Laudo de funcionamento e manuais inclusos. Retirada com transporte especializado.",
    leiloeiro: "Receita Federal do Brasil",
    visitas: 144,
    fav: 19,
  },
  {
    id: "PGFN-0455-72",
    tipo: "mercadoria",
    cat: "Dívida ativa",
    titulo: "Lote 455 — Bens penhorados (dívida ativa)",
    cidade: "Guarulhos · SP",
    vara: "PGFN — Regional 3ª Região",
    processo: "Edital PGFN 0045572/2026",
    avaliacao: 520000,
    minimo: 234000,
    praca: "2º leilão",
    dataFim: "24 jun 2026",
    hora: "09:30",
    score: 55,
    risco: "alto",
    fontes: ["pgfn", "compras"],
    ocupado: false,
    divida: 71300,
    desc: "Bens de execução fiscal federal. Lote heterogêneo com ônus tributário a apurar — leia o parecer antes de ofertar. Inscrição em dívida ativa vinculada.",
    leiloeiro: "Procuradoria-Geral da Fazenda Nacional",
    visitas: 73,
    fav: 8,
  },
];

// ---------------------------------------------------------------------------
// OVERVIEW_STATS — spark series pré-computadas (series(seed, 14, base, amp))
// ---------------------------------------------------------------------------

export const OVERVIEW_STATS: Record<"oportunidades" | "economia" | "rastreadas" | "watchlist", OverviewStat> = {
  oportunidades: {
    label: "Lotes públicos disponíveis",
    value: 1284,
    delta: 12.4,
    spark: [69, 62, 53, 48, 51, 62, 80, 99, 111, 114, 108, 98, 88, 85],
  },
  economia: {
    label: "Economia potencial mapeada",
    value: 8.6,
    suffix: "M",
    prefix: "R$ ",
    delta: 23.1,
    spark: [40, 51, 66, 80, 85, 81, 69, 57, 51, 56, 73, 95, 117, 131],
  },
  rastreadas: {
    label: "Órgãos oficiais monitorados",
    value: 47,
    delta: 4,
    spark: [49, 44, 40, 40, 45, 53, 60, 65, 64, 59, 52, 48, 50, 58],
  },
  watchlist: {
    label: "Acompanhando agora",
    value: 9,
    delta: 2,
    spark: [38, 39, 36, 31, 27, 25, 28, 35, 43, 51, 55, 54, 51, 48],
  },
};

// ---------------------------------------------------------------------------
// DEPOIMENTOS
// ---------------------------------------------------------------------------

export const DEPOIMENTOS: Depoimento[] = [
  {
    nome: "Mariana Alencar",
    papel: "Importadora · 8 anos no mercado",
    txt: "Acompanho leilões da Receita há anos. A Fonte.ia me entrega o lote já cruzado com o edital e o laudo — decido em minutos o que antes levava uma tarde inteira.",
    avatar: "MA",
    ganho: "R$ 506 mil em economia/ano",
  },
  {
    nome: "Dr. Rafael Tavares",
    papel: "Advogado tributarista",
    txt: "A rastreabilidade até a fonte oficial é o que faltava. Anexo o relatório direto no parecer com segurança jurídica. Virou ferramenta padrão do escritório.",
    avatar: "RT",
    ganho: "11h economizadas/semana",
  },
  {
    nome: "Carlos Bittencourt",
    papel: "Despachante aduaneiro",
    txt: "Os alertas de novos editais da Receita mudaram minha operação. Não perco mais prazo de leilão eletrônico e fecho lotes com margem que antes passava batido.",
    avatar: "CB",
    ganho: "3× mais lotes arrematados",
  },
];

// ---------------------------------------------------------------------------
// PLANOS
// ---------------------------------------------------------------------------

export const PLANOS: Plano[] = [
  {
    id: "free",
    nome: "Avaliação",
    preco: 0,
    periodo: "",
    tagline: "Conheça a profundidade da análise",
    destaque: false,
    cta: "Começar avaliação",
    feats: [
      "5 análises completas de lote",
      "Score de risco e rastreabilidade",
      "Acesso a todas as fontes oficiais",
      "Sem cartão de crédito",
    ],
    limite: "5 análises",
  },
  {
    id: "pro",
    nome: "Profissional",
    preco: 197,
    periodo: "/mês",
    tagline: "Para quem opera no mercado",
    destaque: true,
    cta: "Assinar o Profissional",
    feats: [
      "Análises ilimitadas",
      "Alertas de novos editais em tempo real",
      "Relatórios PDF com selo de fonte oficial",
      "Watchlist e comparador de lotes",
      "Suporte prioritário",
    ],
    limite: "Ilimitado",
  },
  {
    id: "escritorio",
    nome: "Corporativo",
    preco: 597,
    periodo: "/mês",
    tagline: "Para times, escritórios e operações",
    destaque: false,
    cta: "Falar com vendas",
    feats: [
      "Tudo do Profissional",
      "Acesso à API de dados oficiais",
      "Até 8 usuários e exportação em lote",
      "Selo de auditoria nos relatórios",
      "Gerente de conta dedicado",
    ],
    limite: "Time inteiro",
  },
];

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

export function fonteById(id: string): Fonte | undefined {
  return FONTES.find((f) => f.id === id);
}
