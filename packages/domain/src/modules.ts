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
}

export const PRODUCT_MODULES: ProductModule[] = [
  {
    id: "leiloes",
    label: "Leiloes",
    route: "/leiloes",
    icon: "Gavel",
    status: "active",
    targetPersona: "Revendedores, lojistas e investidores de oportunidade",
    promise: "Encontrar lotes com margem, risco claro e evidencia oficial.",
  },
  {
    id: "licitacoes",
    label: "Licitacoes",
    route: "/licitacoes",
    icon: "FileSearch",
    status: "locked",
    targetPersona: "Empresas que vendem para governo e consultorias B2G",
    promise: "Descobrir editais, precos, concorrentes e oportunidades publicas.",
  },
  {
    id: "empresas",
    label: "Empresas",
    route: "/empresas",
    icon: "Building2",
    status: "locked",
    targetPersona: "Comercial, compliance, bancos, seguradoras e ERPs",
    promise: "Montar dossies CNPJ com sancoes, contratos, socios e evidencias.",
  },
  {
    id: "juridico",
    label: "Juridico",
    route: "/juridico",
    icon: "Scale",
    status: "locked",
    targetPersona: "Advogados, escritorios, compliance e credito",
    promise: "Monitorar processos, DOU e riscos juridicos com fonte rastreavel.",
  },
  {
    id: "inpi",
    label: "INPI",
    route: "/inpi",
    icon: "BadgeCheck",
    status: "locked",
    targetPersona: "Empreendedores, agencias, startups e advogados de PI",
    promise: "Avaliar marcas, classes, conflitos e prazos com dados do INPI.",
  },
  {
    id: "ambiental",
    label: "Ambiental",
    route: "/ambiental",
    icon: "Map",
    status: "locked",
    targetPersona: "Agro, bancos, seguradoras, ESG e compradores de commodities",
    promise: "Avaliar embargo, desmatamento, fogo, agua e risco territorial.",
  },
  {
    id: "politica",
    label: "Politica",
    route: "/politica",
    icon: "Landmark",
    status: "locked",
    targetPersona: "Cidadaos, jornalistas, pesquisadores e assessorias politicas",
    promise: "Cruzar votos, gastos, eleicoes, emendas, contratos e agendas.",
  },
  {
    id: "municipios",
    label: "Municipios",
    route: "/municipios",
    icon: "MapPin",
    status: "locked",
    targetPersona: "Consultorias, fornecedores publicos, bancos e jornalistas locais",
    promise: "Criar raio-x fiscal, social, politico e economico de municipios.",
  },
  {
    id: "api",
    label: "API",
    route: "/api",
    icon: "Braces",
    status: "locked",
    targetPersona: "Desenvolvedores, ERPs, fintechs, govtechs e consultorias",
    promise: "Consumir dados publicos normalizados, com historico e webhooks.",
  },
];

