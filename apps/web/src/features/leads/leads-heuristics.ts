/**
 * leads-heuristics.ts — Fonte.ia
 *
 * Mapeamento estático de setor → serviços sugeríveis.
 * Sem IA, sem chamadas externas — pura heurística de palavras-chave no objeto/modalidade.
 *
 * IMPORTANTE: todas as keywords devem estar em lowercase SEM acentos (NFD stripped).
 * O `inferServicos`/`inferSetor` normaliza o input com NFD antes de comparar, então
 * keywords acentuadas nunca batem — são dead code. Mantenha apenas formas sem acento.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ServicioSugerivel {
  label: string;
  /** Emoji curto só para ícone textual no card */
  icon: string;
}

// ─── Keyword → serviços ──────────────────────────────────────────────────────

interface Regra {
  /** Palavras-chave para buscar no objeto (lowercase, sem acentos — NFD stripped). */
  keywords: string[];
  /** Rótulo do setor exibido no card. Inline na própria Regra evita desalinhamento com SETOR_MAP. */
  setor: string;
  servicos: ServicioSugerivel[];
}

const REGRAS: Regra[] = [
  {
    setor: "Obras & Engenharia",
    // Acentuadas removidas: "construção", "pavimentação", "edificação", "ampliação" → sem acento abaixo
    keywords: ["obra", "construcao", "reforma", "pavimentacao", "infraestrutura", "engenharia", "edificacao", "ampliacao"],
    servicos: [
      { label: "Seguro de obras e riscos de engenharia", icon: "🏗️" },
      { label: "Locação de equipamentos e maquinário", icon: "🚜" },
      { label: "Consultoria de engenharia e laudos", icon: "📐" },
    ],
  },
  {
    setor: "Tecnologia da Informação",
    // Acentuadas removidas: "informática", "licença", "suporte técnico"
    keywords: ["ti", "tecnologia", "software", "sistema", "sistemas", "dados", "digital", "informatica", "computador", "computadores", "licenca", "nuvem", "cloud", "internet", "rede", "suporte tecnico"],
    servicos: [
      { label: "Desenvolvimento e integração de sistemas", icon: "💻" },
      { label: "Cibersegurança e proteção de dados (LGPD)", icon: "🔒" },
      { label: "Suporte e manutenção de TI", icon: "🛠️" },
    ],
  },
  {
    setor: "Eventos & Capacitação",
    // Acentuadas removidas: "cerimônia", "capacitação", "seminário"
    keywords: ["evento", "eventos", "cerimonia", "capacitacao", "treinamento", "curso", "cursos", "seminario", "congresso"],
    servicos: [
      { label: "Logística e produção de eventos", icon: "🎪" },
      { label: "Alimentação e buffet corporativo", icon: "🍽️" },
      { label: "Material gráfico e comunicação visual", icon: "🖨️" },
    ],
  },
  {
    setor: "Saúde",
    // Acentuadas removidas: "saúde", "médico", "equipamento médico", "laboratório"
    keywords: ["saude", "hospital", "medico", "medicamento", "medicamentos", "equipamento medico", "enfermagem", "laboratorio", "radiologia"],
    servicos: [
      { label: "Fornecimento de materiais hospitalares", icon: "🏥" },
      { label: "Consultoria em gestão de saúde", icon: "📋" },
      { label: "Seguro de responsabilidade civil médica", icon: "📄" },
    ],
  },
  {
    setor: "Transporte & Frota",
    // Acentuadas removidas: "veículo", "veículos", "ônibus", "caminhão", "ambulância", "combustível"
    keywords: ["transporte", "frota", "veiculo", "veiculos", "onibus", "caminhao", "ambulancia", "combustivel"],
    servicos: [
      { label: "Gestão e manutenção de frotas", icon: "🚛" },
      { label: "Seguro de veículos e frotas", icon: "🛡️" },
      { label: "Rastreamento e telemetria", icon: "📍" },
    ],
  },
  {
    setor: "Alimentação",
    // Acentuadas removidas: "alimentação", "gêneros alimentícios", "refeição"
    keywords: ["alimento", "alimentos", "merenda", "alimentacao", "generos alimenticios", "refeicao"],
    servicos: [
      { label: "Distribuição de gêneros alimentícios", icon: "📦" },
      { label: "Gestão de estoque e logística fria", icon: "❄️" },
      { label: "Consultoria em segurança alimentar", icon: "✅" },
    ],
  },
  {
    setor: "Segurança",
    // Acentuadas removidas: "segurança", "vigilância", "câmera"
    keywords: ["seguranca", "vigilancia", "monitoramento", "camera", "cftv"],
    servicos: [
      { label: "Segurança patrimonial e vigilância", icon: "👮" },
      { label: "Sistemas de CFTV e controle de acesso", icon: "📹" },
      { label: "Consultoria em compliance e riscos", icon: "🔍" },
    ],
  },
  {
    setor: "Limpeza & Facilities",
    // Acentuadas removidas: "conservação"
    keywords: ["limpeza", "conservacao", "higiene", "zeladoria", "portaria"],
    servicos: [
      { label: "Serviços de limpeza e higienização", icon: "🧹" },
      { label: "Gestão de facilities", icon: "🏢" },
      { label: "Fornecimento de materiais de limpeza", icon: "🧴" },
    ],
  },
  {
    setor: "Mobiliário & Equipamentos",
    // Acentuadas removidas: "mobiliário", "móveis"
    keywords: ["mobiliario", "moveis", "cadeira", "mesa", "equipamento", "equipamentos"],
    servicos: [
      { label: "Fornecimento de mobiliário corporativo", icon: "🪑" },
      { label: "Locação de equipamentos de escritório", icon: "🖨️" },
      { label: "Consultoria em ergonomia", icon: "📐" },
    ],
  },
  {
    setor: "Comunicação & Marketing",
    // Acentuadas removidas: "comunicação", "mídia"
    keywords: ["comunicacao", "publicidade", "marketing", "midia", "propaganda", "assessoria"],
    servicos: [
      { label: "Agência de publicidade e marketing", icon: "📢" },
      { label: "Gestão de redes sociais", icon: "📱" },
      { label: "Assessoria de imprensa e comunicação", icon: "📰" },
    ],
  },
  {
    setor: "Consultoria & Gestão",
    // Acentuadas removidas: "contábil", "gestão"
    keywords: ["consultoria", "assessoria", "contabilidade", "contabil", "auditoria", "gestao"],
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

/**
 * Retorna o rótulo de setor para exibir no card.
 * O label vive inline em cada Regra — não pode desalinhar com a lista.
 */
export function inferSetor(objeto: string): string {
  const lower = objeto.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

  for (const regra of REGRAS) {
    if (regra.keywords.some((kw) => lower.includes(kw))) {
      return regra.setor;
    }
  }

  return "Contratação pública";
}
