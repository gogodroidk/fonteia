/**
 * leads-heuristics.ts — Fonte.ia
 *
 * Mapeamento estático de setor → serviços sugeríveis.
 * Sem IA, sem chamadas externas — pura heurística de palavras-chave no objeto/modalidade.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ServicioSugerivel {
  label: string;
  /** Emoji curto só para ícone textual no card */
  icon: string;
}

// ─── Keyword → serviços ──────────────────────────────────────────────────────

interface Regra {
  /** Palavras-chave para buscar no objeto (lowercase) */
  keywords: string[];
  servicos: ServicioSugerivel[];
}

const REGRAS: Regra[] = [
  {
    keywords: ["obra", "construção", "construcao", "reforma", "pavimentação", "pavimentacao", "infraestrutura", "engenharia", "edificação", "edificacao", "ampliação", "ampliacao"],
    servicos: [
      { label: "Seguro de obras e riscos de engenharia", icon: "🏗️" },
      { label: "Locação de equipamentos e maquinário", icon: "🚜" },
      { label: "Consultoria de engenharia e laudos", icon: "📐" },
    ],
  },
  {
    keywords: ["ti", "tecnologia", "software", "sistema", "sistemas", "dados", "digital", "informática", "informatica", "computador", "computadores", "licença", "licenca", "nuvem", "cloud", "internet", "rede", "suporte técnico", "suporte tecnico"],
    servicos: [
      { label: "Desenvolvimento e integração de sistemas", icon: "💻" },
      { label: "Cibersegurança e proteção de dados (LGPD)", icon: "🔒" },
      { label: "Suporte e manutenção de TI", icon: "🛠️" },
    ],
  },
  {
    keywords: ["evento", "eventos", "cerimônia", "cerimonia", "capacitação", "capacitacao", "treinamento", "curso", "cursos", "seminário", "seminario", "congresso"],
    servicos: [
      { label: "Logística e produção de eventos", icon: "🎪" },
      { label: "Alimentação e buffet corporativo", icon: "🍽️" },
      { label: "Material gráfico e comunicação visual", icon: "🖨️" },
    ],
  },
  {
    keywords: ["saúde", "saude", "hospital", "médico", "medico", "medicamento", "medicamentos", "equipamento médico", "equipamento medico", "enfermagem", "laboratório", "laboratorio", "radiologia"],
    servicos: [
      { label: "Fornecimento de materiais hospitalares", icon: "🏥" },
      { label: "Consultoria em gestão de saúde", icon: "📋" },
      { label: "Seguro de responsabilidade civil médica", icon: "📄" },
    ],
  },
  {
    keywords: ["transporte", "frota", "veículo", "veiculo", "veículos", "veiculos", "ônibus", "onibus", "caminhão", "caminhao", "ambulância", "ambulancia", "combustível", "combustivel"],
    servicos: [
      { label: "Gestão e manutenção de frotas", icon: "🚛" },
      { label: "Seguro de veículos e frotas", icon: "🛡️" },
      { label: "Rastreamento e telemetria", icon: "📍" },
    ],
  },
  {
    keywords: ["alimento", "alimentos", "merenda", "alimentação", "alimentacao", "gêneros alimentícios", "generos alimenticios", "refeição", "refeicao"],
    servicos: [
      { label: "Distribuição de gêneros alimentícios", icon: "📦" },
      { label: "Gestão de estoque e logística fria", icon: "❄️" },
      { label: "Consultoria em segurança alimentar", icon: "✅" },
    ],
  },
  {
    keywords: ["segurança", "seguranca", "vigilância", "vigilancia", "monitoramento", "câmera", "camera", "cftv"],
    servicos: [
      { label: "Segurança patrimonial e vigilância", icon: "👮" },
      { label: "Sistemas de CFTV e controle de acesso", icon: "📹" },
      { label: "Consultoria em compliance e riscos", icon: "🔍" },
    ],
  },
  {
    keywords: ["limpeza", "conservação", "conservacao", "higiene", "zeladoria", "portaria"],
    servicos: [
      { label: "Serviços de limpeza e higienização", icon: "🧹" },
      { label: "Gestão de facilities", icon: "🏢" },
      { label: "Fornecimento de materiais de limpeza", icon: "🧴" },
    ],
  },
  {
    keywords: ["mobiliário", "mobiliario", "móveis", "moveis", "cadeira", "mesa", "equipamento", "equipamentos"],
    servicos: [
      { label: "Fornecimento de mobiliário corporativo", icon: "🪑" },
      { label: "Locação de equipamentos de escritório", icon: "🖨️" },
      { label: "Consultoria em ergonomia", icon: "📐" },
    ],
  },
  {
    keywords: ["comunicação", "comunicacao", "publicidade", "marketing", "mídia", "midia", "propaganda", "assessoria"],
    servicos: [
      { label: "Agência de publicidade e marketing", icon: "📢" },
      { label: "Gestão de redes sociais", icon: "📱" },
      { label: "Assessoria de imprensa e comunicação", icon: "📰" },
    ],
  },
  {
    keywords: ["consultoria", "assessoria", "contabilidade", "contábil", "contabil", "auditoria", "gestão", "gestao"],
    servicos: [
      { label: "Consultoria de gestão e processos", icon: "📊" },
      { label: "Auditoria e compliance", icon: "🔎" },
      { label: "BPO financeiro e contábil", icon: "💰" },
    ],
  },
];

const FALLBACK_SERVICOS: ServicioSugerivel[] = [
  { label: "Consultoria especializada para o setor público", icon: "🏛️" },
  { label: "Fornecimento de material de expediente", icon: "📎" },
  { label: "Treinamento e capacitação de equipes", icon: "🎓" },
];

// ─── Public ──────────────────────────────────────────────────────────────────

/**
 * Retorna serviços sugeríveis com base no objeto do contrato.
 * Nunca lança exceção — retorna fallback se nenhuma regra bater.
 */
export function inferServicos(objeto: string): ServicioSugerivel[] {
  const lower = objeto.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

  for (const regra of REGRAS) {
    if (regra.keywords.some((kw) => lower.includes(kw))) {
      return regra.servicos;
    }
  }

  return FALLBACK_SERVICOS;
}

const SETOR_MAP: Array<[string, string]> = REGRAS.map((r, i) => {
  const labels = [
    "Obras & Engenharia",
    "Tecnologia da Informação",
    "Eventos & Capacitação",
    "Saúde",
    "Transporte & Frota",
    "Alimentação",
    "Segurança",
    "Limpeza & Facilities",
    "Mobiliário & Equipamentos",
    "Comunicação & Marketing",
    "Consultoria & Gestão",
  ] as const;
  return [r.keywords[0] ?? "", labels[i] ?? "Contratação pública"] as [string, string];
});

/**
 * Retorna o rótulo de setor para exibir no card.
 */
export function inferSetor(objeto: string): string {
  const lower = objeto.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  for (let i = 0; i < REGRAS.length; i++) {
    const regra = REGRAS[i];
    const entry = SETOR_MAP[i];
    if (regra !== undefined && entry !== undefined) {
      if (regra.keywords.some((kw) => lower.includes(kw))) return entry[1];
    }
  }
  return "Contratação pública";
}
