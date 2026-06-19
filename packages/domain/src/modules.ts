export const MODULE_IDS = [
  "leiloes",
  "licitacoes",
  "empresas",
  "juridico",
  "inpi",
  "ambiental",
  "politica",
  "municipios",
  "api",
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export type ModuleStatus = "active" | "locked" | "coming_soon";

export interface ProductModule {
  id: ModuleId;
  label: string;
  route: string;
  icon: string;
  status: ModuleStatus;
  targetPersona: string;
  promise: string;
  /** Quantidade de registros indexados (seed, não ao vivo). */
  recordCount?: number;
  /** Sigla da fonte de dados principal para exibir no badge. */
  badge?: string;
  /** Cor hex do badge da fonte. */
  badgeColor?: string;
}

export const PRODUCT_MODULES: ProductModule[] = [
  {
    id: "leiloes",
    label: "Leilões",
    route: "/leiloes",
    icon: "Gavel",
    status: "active",
    targetPersona: "Revendedores, lojistas e investidores de oportunidade",
    promise: "Encontrar lotes com margem, risco claro e evidência oficial.",
    recordCount: 1065,
    badge: "RFB",
    badgeColor: "#1D5FE0",
  },
  {
    id: "licitacoes",
    label: "Licitações",
    route: "/licitacoes",
    icon: "FileSearch",
    status: "active",
    targetPersona: "Empresas que vendem para governo e consultorias B2G",
    promise: "Descobrir editais, preços, concorrentes e oportunidades públicas.",
    recordCount: 154996,
    badge: "PNCP",
    badgeColor: "#0D7B48",
  },
  {
    id: "empresas",
    label: "Empresas",
    route: "/empresas",
    icon: "Building2",
    status: "active",
    targetPersona: "Comercial, compliance, bancos, seguradoras e ERPs",
    promise: "Montar dossiês CNPJ com sanções, contratos, sócios e evidências.",
    recordCount: 461,
    badge: "RFB/CEIS",
    badgeColor: "#DC2626",
  },
  {
    id: "juridico",
    label: "Jurídico",
    route: "/juridico",
    icon: "Scale",
    status: "active",
    targetPersona: "Advogados, escritórios, compliance e crédito",
    promise: "Monitorar processos, DOU e riscos jurídicos com fonte rastreável.",
    recordCount: 280,
    badge: "CNJ",
    badgeColor: "#B45309",
  },
  {
    id: "inpi",
    label: "INPI",
    route: "/inpi",
    icon: "BadgeCheck",
    status: "active",
    targetPersona: "Empreendedores, agências, startups e advogados de PI",
    promise: "Avaliar marcas, classes, conflitos e prazos com dados do INPI.",
    // Dinâmico: as marcas são ingeridas da RPI (kind='trademark') semana a semana
    // e a busca é por CNPJ/titular — não há um total fixo indexado como nos demais
    // módulos. Mantido em 0 para não exibir contagem fabricada.
    recordCount: 0,
    badge: "INPI",
    badgeColor: "#7C3AED",
  },
  {
    id: "ambiental",
    label: "Ambiental",
    route: "/ambiental",
    icon: "Map",
    status: "active",
    targetPersona: "Agro, bancos, seguradoras, ESG e compradores de commodities",
    promise: "Avaliar embargo, desmatamento, fogo, água e risco territorial.",
    recordCount: 1500,
    badge: "IBAMA",
    badgeColor: "#16A34A",
  },
  {
    id: "politica",
    label: "Política",
    route: "/politica",
    icon: "Landmark",
    status: "active",
    targetPersona: "Cidadãos, jornalistas, pesquisadores e assessorias políticas",
    promise: "Cruzar votos, gastos, eleições, emendas, contratos e agendas.",
    recordCount: 4594,
    badge: "Câmara/Senado",
    badgeColor: "#6B3FA0",
  },
  {
    id: "municipios",
    label: "Municípios",
    route: "/municipios",
    icon: "MapPin",
    status: "active",
    targetPersona: "Consultorias, fornecedores públicos, bancos e jornalistas locais",
    promise: "Criar raio-x fiscal, social, político e econômico de municípios.",
    recordCount: 5571,
    badge: "IBGE",
    badgeColor: "#2563EB",
  },
  {
    id: "api",
    label: "API",
    route: "/api",
    icon: "Braces",
    status: "locked",
    targetPersona: "Desenvolvedores, ERPs, fintechs, govtechs e consultorias",
    promise: "Consumir dados públicos normalizados, com histórico e webhooks.",
  },
];

