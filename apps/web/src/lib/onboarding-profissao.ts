/**
 * Planos de uso estáticos por perfil — Onboarding por profissão.
 * NÃO depende de IA: tudo calculado com regras fixas.
 * Salvo em localStorage com key "fonteia.perfil".
 */

// ─── Tipos públicos ────────────────────────────────────────────────────────

export type ProfissaoId =
  | "advogado"
  | "contador"
  | "despachante"
  | "vendedor"
  | "empresario"
  | "compliance"
  | "jornalista"
  | "comprador_leilao"
  | "outro";

export type ObjetivoId =
  | "vender_mais"
  | "avaliar_risco"
  | "acompanhar_politica"
  | "achar_leiloes"
  | "monitorar_empresas";

export interface PerfilOnboarding {
  profissao: ProfissaoId;
  objetivo: ObjetivoId;
  cidade?: string;
  criadoEm: string; // ISO
}

export interface PlanoUso {
  titulo: string;
  descricao: string;
  acoes: { rotulo: string; detalhe: string; rota: string }[];
  buscaRecomendada: { rotulo: string; rota: string };
  alertaRecomendado: { rotulo: string; rota: string };
}

// ─── Persistência ─────────────────────────────────────────────────────────

const KEY_PERFIL = "fonteia.perfil";

export function salvarPerfil(perfil: PerfilOnboarding): void {
  try {
    window.localStorage.setItem(KEY_PERFIL, JSON.stringify(perfil));
    // marca onboarding genérico como feito também
    window.localStorage.setItem("fonteia.onboarded", "1");
  } catch {
    // sem localStorage — ignora
  }
}

export function lerPerfil(): PerfilOnboarding | null {
  try {
    const raw = window.localStorage.getItem(KEY_PERFIL);
    return raw ? (JSON.parse(raw) as PerfilOnboarding) : null;
  } catch {
    return null;
  }
}

// ─── Engine de plano estático ──────────────────────────────────────────────

export function gerarPlano(perfil: PerfilOnboarding): PlanoUso {
  const { profissao, objetivo } = perfil;

  // Helper: retorna o plano base por profissão e sobrescreve pelo objetivo
  return resolverPlano(profissao, objetivo);
}

function resolverPlano(p: ProfissaoId, o: ObjetivoId): PlanoUso {
  // Prioridade: profissao define o plano base; objetivo pode ajustar título/ações

  // ── Advogado ──
  if (p === "advogado") {
    return {
      titulo: "Plano para Advogados",
      descricao:
        "Consultoria e due diligence com fontes oficiais — sem depender de terceiros.",
      acoes: [
        {
          rotulo: "1. Verifique sanções antes de aceitar um cliente",
          detalhe:
            "Em Empresas, busque pelo CNPJ e confira o status no CEIS/CNEP antes de assinar contrato.",
          rota: "/empresas",
        },
        {
          rotulo: "2. Acompanhe processos e jurisprudência relevante",
          detalhe:
            "No módulo Jurídico, filtre por tribunal e acompanhe intimações e decisões que impactam seus casos.",
          rota: "/juridico",
        },
        {
          rotulo: "3. Monitore licitações para clientes que fornecem ao governo",
          detalhe:
            "Em Licitações, filtre por CNAE ou órgão e configure alerta de editais novos na cidade do cliente.",
          rota: "/licitacoes",
        },
      ],
      buscaRecomendada: {
        rotulo: "Buscar empresa por CNPJ + situação cadastral",
        rota: "/empresas",
      },
      alertaRecomendado: {
        rotulo: "Alerta de nova decisão judicial por palavra-chave",
        rota: "/alertas",
      },
    };
  }

  // ── Contador ──
  if (p === "contador") {
    return {
      titulo: "Plano para Contadores",
      descricao:
        "Due diligence contábil e captação mais segura com dados do governo.",
      acoes: [
        {
          rotulo: "1. Filtre empresas por CNAE e cidade antes de captar",
          detalhe:
            "Em Empresas, use os filtros de CNAE, porte e município para achar potenciais clientes.",
          rota: "/empresas",
        },
        {
          rotulo: "2. Cheque sanções CEIS/CNEP antes de fechar contrato",
          detalhe:
            "No card de qualquer empresa, o indicador de risco mostra situação em listas de inidôneos federais.",
          rota: "/empresas",
        },
        {
          rotulo: "3. Monitore licitações da cidade dos seus clientes",
          detalhe:
            "Em Licitações, filtre por município e configure alerta semanal de editais novos.",
          rota: "/licitacoes",
        },
      ],
      buscaRecomendada: {
        rotulo: "Buscar empresa por CNPJ (situação + sócios)",
        rota: "/empresas",
      },
      alertaRecomendado: {
        rotulo: "Alerta de licitações novas na cidade do cliente",
        rota: "/alertas",
      },
    };
  }

  // ── Despachante ──
  if (p === "despachante") {
    return {
      titulo: "Plano para Despachantes",
      descricao: "Opere mais rápido com dados oficiais já estruturados.",
      acoes: [
        {
          rotulo: "1. Confira situação cadastral de clientes no CNPJ",
          detalhe:
            "Em Empresas, busque pelo CNPJ e veja sócios, situação e endereço sem precisar acessar o site da Receita.",
          rota: "/empresas",
        },
        {
          rotulo: "2. Acompanhe licitações para cliente que vendem ao governo",
          detalhe:
            "Em Licitações, monitore editais por órgão e acompanhe prazos de habilitação.",
          rota: "/licitacoes",
        },
        {
          rotulo: "3. Monitore municípios para abertura de filiais",
          detalhe:
            "Em Municípios, compare indicadores fiscais antes de ajudar cliente a abrir filial.",
          rota: "/municipios",
        },
      ],
      buscaRecomendada: {
        rotulo: "Buscar empresa por CNPJ",
        rota: "/empresas",
      },
      alertaRecomendado: {
        rotulo: "Alerta de licitação aberta por cliente ou órgão",
        rota: "/alertas",
      },
    };
  }

  // ── Vendedor B2B / Prestador ──
  if (p === "vendedor") {
    return {
      titulo: "Plano para Vendedores B2B e Prestadores",
      descricao: "Ache clientes antes da concorrência, qualificados por dados.",
      acoes: [
        {
          rotulo: "1. Encontre empresas ativas no seu nicho por CNAE",
          detalhe:
            "Em Empresas, filtre por CNAE, porte e cidade para montar lista de prospects qualificados.",
          rota: "/empresas",
        },
        {
          rotulo: "2. Identifique licitações abertas para seu produto/serviço",
          detalhe:
            "Em Licitações, busque por palavra-chave ou categoria e veja editais com prazo aberto.",
          rota: "/licitacoes",
        },
        {
          rotulo: "3. Verifique saúde financeira antes de proposta grande",
          detalhe:
            "No módulo Empresas, confira sanções e situação do CNPJ para não perder tempo com inadimplentes.",
          rota: "/empresas",
        },
      ],
      buscaRecomendada: {
        rotulo: "Buscar licitações abertas por categoria",
        rota: "/licitacoes",
      },
      alertaRecomendado: {
        rotulo: "Alerta de licitação nova para seu produto",
        rota: "/alertas",
      },
    };
  }

  // ── Empresário ──
  if (p === "empresario") {
    return {
      titulo: "Plano para Empresários",
      descricao: "Decisões estratégicas com inteligência de mercado público.",
      acoes: [
        {
          rotulo: "1. Monitore concorrentes por CNPJ",
          detalhe:
            "Em Empresas, acompanhe sócios, alterações cadastrais e situação de empresas do seu setor.",
          rota: "/empresas",
        },
        {
          rotulo: "2. Acompanhe licitações abertas no seu setor",
          detalhe:
            "Em Licitações, filtre por CNAE e cidade para identificar oportunidades de fornecimento ao governo.",
          rota: "/licitacoes",
        },
        {
          rotulo: "3. Verifique saúde municipal antes de expandir",
          detalhe:
            "Em Municípios, compare orçamento, endividamento e serviços disponíveis das cidades candidatas.",
          rota: "/municipios",
        },
      ],
      buscaRecomendada: {
        rotulo: "Buscar licitações por CNAE do setor",
        rota: "/licitacoes",
      },
      alertaRecomendado: {
        rotulo: "Alerta de licitação nova no setor",
        rota: "/alertas",
      },
    };
  }

  // ── Compliance ──
  if (p === "compliance") {
    return {
      titulo: "Plano para Compliance e Auditoria",
      descricao: "Due diligence com rastreabilidade total — dado oficial, citado.",
      acoes: [
        {
          rotulo: "1. Cheque fornecedores em listas de sanções",
          detalhe:
            "Em Empresas, verifique CEIS, CNEP e CEPIM para cada CNPJ antes de aprovar cadastro.",
          rota: "/empresas",
        },
        {
          rotulo: "2. Monitore sócios e PEPs (pessoas politicamente expostas)",
          detalhe:
            "No módulo Política, cruzue nomes de sócios com mandatos eletivos e cargos públicos.",
          rota: "/politica",
        },
        {
          rotulo: "3. Acompanhe ambiental de fornecedores de risco",
          detalhe:
            "Em Ambiental, verifique autos de infração do IBAMA por CNPJ ou CPF antes de aprovar.",
          rota: "/ambiental",
        },
      ],
      buscaRecomendada: {
        rotulo: "Buscar empresa + situação de sanções",
        rota: "/empresas",
      },
      alertaRecomendado: {
        rotulo: "Alerta de nova sanção em fornecedor monitorado",
        rota: "/alertas",
      },
    };
  }

  // ── Jornalista / Transparência ──
  if (p === "jornalista") {
    return {
      titulo: "Plano para Jornalistas e Transparência",
      descricao: "Dados públicos prontos para investigação, com fonte citada.",
      acoes: [
        {
          rotulo: "1. Cruze empresas com políticos e contratos públicos",
          detalhe:
            "Em Política, pesquise mandatos e cargos; em Empresas, verifique sócios com cargos públicos.",
          rota: "/politica",
        },
        {
          rotulo: "2. Investigue licitações com suspeita de superfaturamento",
          detalhe:
            "Em Licitações, filtre por órgão, valor e prazo para identificar contratos fora do padrão.",
          rota: "/licitacoes",
        },
        {
          rotulo: "3. Monitore Diário Oficial e ambiental por palavra-chave",
          detalhe:
            "Em Ambiental, acompanhe autos de infração e licenças por empresa, município ou tema.",
          rota: "/ambiental",
        },
      ],
      buscaRecomendada: {
        rotulo: "Buscar político + empresas vinculadas",
        rota: "/politica",
      },
      alertaRecomendado: {
        rotulo: "Alerta de novo contrato público por órgão",
        rota: "/alertas",
      },
    };
  }

  // ── Comprador de leilão ──
  if (p === "comprador_leilao") {
    return {
      titulo: "Plano para Compradores de Leilão",
      descricao: "Arrematação inteligente — encontre o lote certo antes da concorrência.",
      acoes: [
        {
          rotulo: "1. Acesse o radar de lotes com score de oportunidade",
          detalhe:
            "Em Lotes, filtre por categoria, prazo e lance mínimo para achar os melhores antes que encerrem.",
          rota: "/lotes",
        },
        {
          rotulo: "2. Use o Raio-X do lote para análise instantânea",
          detalhe:
            "Em qualquer lote, clique em Raio-X: a IA lê o edital e aponta riscos, valor estimado e pontos de atenção.",
          rota: "/lotes",
        },
        {
          rotulo: "3. Crie alertas por categoria e lance mínimo",
          detalhe:
            "Em Alertas, configure notificação de lotes novos na categoria e faixa de preço que te interessa.",
          rota: "/alertas",
        },
      ],
      buscaRecomendada: {
        rotulo: "Buscar lotes por categoria e prazo",
        rota: "/lotes",
      },
      alertaRecomendado: {
        rotulo: "Alerta de lote novo na categoria escolhida",
        rota: "/alertas",
      },
    };
  }

  // ── Outro (fallback) ──
  // Ajuste pelo objetivo se profissão é "outro"
  return resolverPorObjetivo(o);
}

function resolverPorObjetivo(o: ObjetivoId): PlanoUso {
  if (o === "vender_mais") {
    return {
      titulo: "Plano: Vender Mais",
      descricao: "Identifique clientes e oportunidades com dados públicos.",
      acoes: [
        {
          rotulo: "1. Ache empresas ativas por CNAE e cidade",
          detalhe: "Em Empresas, filtre por setor e porte para montar lista de prospects.",
          rota: "/empresas",
        },
        {
          rotulo: "2. Monitore licitações abertas no seu nicho",
          detalhe: "Em Licitações, busque por categoria de produto/serviço.",
          rota: "/licitacoes",
        },
        {
          rotulo: "3. Qualifique leads com situação cadastral",
          detalhe: "Verifique CNPJ antes de investir tempo em prospecção.",
          rota: "/empresas",
        },
      ],
      buscaRecomendada: { rotulo: "Licitações abertas no setor", rota: "/licitacoes" },
      alertaRecomendado: { rotulo: "Alerta de novo edital por categoria", rota: "/alertas" },
    };
  }
  if (o === "avaliar_risco") {
    return {
      titulo: "Plano: Avaliação de Risco",
      descricao: "Due diligence com dados rastreáveis de fontes oficiais.",
      acoes: [
        {
          rotulo: "1. Verifique sanções do CEIS/CNEP por CNPJ",
          detalhe: "Em Empresas, veja situação em listas de inidôneos antes de fechar negócio.",
          rota: "/empresas",
        },
        {
          rotulo: "2. Cruze sócios com PEPs e mandatos eletivos",
          detalhe: "Em Política, pesquise se sócios têm vínculo com cargos públicos.",
          rota: "/politica",
        },
        {
          rotulo: "3. Verifique infrações ambientais do IBAMA",
          detalhe: "Em Ambiental, cheque autos de infração por CNPJ.",
          rota: "/ambiental",
        },
      ],
      buscaRecomendada: { rotulo: "Empresa + sanções por CNPJ", rota: "/empresas" },
      alertaRecomendado: { rotulo: "Alerta de nova sanção em CNPJ monitorado", rota: "/alertas" },
    };
  }
  if (o === "acompanhar_politica") {
    return {
      titulo: "Plano: Acompanhar Política",
      descricao: "Mandatos, contratos e gastos públicos em tempo real.",
      acoes: [
        {
          rotulo: "1. Monitore políticos e mandatos por cidade",
          detalhe: "Em Política, filtre por município e acompanhe cargos e histórico.",
          rota: "/politica",
        },
        {
          rotulo: "2. Acompanhe contratos públicos do município",
          detalhe: "Em Licitações, filtre por órgão municipal para ver gastos.",
          rota: "/licitacoes",
        },
        {
          rotulo: "3. Compare saúde fiscal dos municípios",
          detalhe: "Em Municípios, veja orçamento, endividamento e serviços.",
          rota: "/municipios",
        },
      ],
      buscaRecomendada: { rotulo: "Político por nome ou cidade", rota: "/politica" },
      alertaRecomendado: { rotulo: "Alerta de contrato novo no município", rota: "/alertas" },
    };
  }
  if (o === "achar_leiloes") {
    return {
      titulo: "Plano: Achar Leilões",
      descricao: "Encontre lotes com antecedência e analise sem esforço.",
      acoes: [
        {
          rotulo: "1. Explore o radar de lotes por categoria",
          detalhe: "Em Lotes, filtre por categoria, prazo e lance mínimo.",
          rota: "/lotes",
        },
        {
          rotulo: "2. Analise um lote com o Raio-X",
          detalhe: "Clique em Raio-X em qualquer lote para análise instantânea com IA.",
          rota: "/lotes",
        },
        {
          rotulo: "3. Configure alerta de lote novo por categoria",
          detalhe: "Em Alertas, escolha categoria e faixa de lance para ser avisado.",
          rota: "/alertas",
        },
      ],
      buscaRecomendada: { rotulo: "Lotes por categoria e prazo", rota: "/lotes" },
      alertaRecomendado: { rotulo: "Alerta de lote novo na categoria", rota: "/alertas" },
    };
  }
  // monitorar_empresas (default)
  return {
    titulo: "Plano: Monitorar Empresas",
    descricao: "Dados cadastrais, sanções e sócios sempre atualizados.",
    acoes: [
      {
        rotulo: "1. Busque empresa por CNPJ ou razão social",
        detalhe: "Em Empresas, veja situação, sócios, CNAE e endereço em segundos.",
        rota: "/empresas",
      },
      {
        rotulo: "2. Cheque sanções CEIS/CNEP antes de fechar negócio",
        detalhe: "O indicador de risco mostra situação nas listas de inidôneos federais.",
        rota: "/empresas",
      },
      {
        rotulo: "3. Configure monitoramento de CNPJ",
        detalhe: "Em Alertas, adicione CNPJs para receber aviso de alteração cadastral.",
        rota: "/alertas",
      },
    ],
    buscaRecomendada: { rotulo: "Empresa por CNPJ ou razão social", rota: "/empresas" },
    alertaRecomendado: { rotulo: "Alerta de alteração cadastral de CNPJ", rota: "/alertas" },
  };
}
