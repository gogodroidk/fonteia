/**
 * mock-dossie.ts — MOCK LOCAL DE DESENVOLVIMENTO. NÃO É DADO REAL.
 *
 * Usado por `raiox-api.ts` apenas quando a edge function `dossie` ainda não
 * existe ou responde 404/erro de rede, E o app roda em modo DEV (import.meta.env.DEV).
 * Em produção este mock NUNCA é servido — um erro real vira estado de erro na UI.
 *
 * Existe para permitir construir e revisar a página do Raio-X 360° antes do
 * backend (outro agente) terminar a function `dossie`. Assim que ela responder
 * de verdade, este arquivo deixa de ser consultado (o fetch real tem prioridade).
 */

import type { DossiePayload } from "./types";

const NOW = new Date().toISOString();

export const MOCK_DOSSIE: DossiePayload = {
  cnpj: "00000000000191",
  header: {
    razaoSocial: "BANCO DO BRASIL SA (MOCK — dado de desenvolvimento)",
    cnae: "64.21-2-00 — Bancos múltiplos, com carteira comercial",
    situacao: "ATIVA",
    qsa: [
      { nome: "UNIÃO FEDERAL", qualificacao: "Acionista controlador" },
      { nome: "FULANO DA SILVA (MOCK)", qualificacao: "Diretor-presidente" },
      { nome: "CICLANA SOUZA (MOCK)", qualificacao: "Conselheira" },
    ],
  },
  flags: [
    {
      id: "fornecedor_sancionado",
      titulo: "Fornecedor com sanção vigente",
      severity: "alta",
      explicacao: "Consta 1 sanção ativa no CEIS/CNEP (mock) — verifique a seção Sanções abaixo.",
      locked: false,
    },
    {
      id: "contratos_alto_volume",
      titulo: "Alto volume de contratos públicos",
      severity: "media",
      explicacao: "Mais de R$ 10 milhões em contratos públicos ativos (mock).",
      locked: false,
    },
    {
      id: "infracao_ambiental",
      titulo: "Infração ambiental registrada",
      severity: "baixa",
      explicacao: "1 auto de infração IBAMA nos últimos 5 anos (mock).",
      locked: false,
    },
  ],
  sections: {
    sancoes: {
      status: "ok",
      total: 1,
      items: [
        {
          origem: "CEIS",
          tipoSancao: "Suspensão temporária",
          orgaoSancionador: "Ministério da Economia (mock)",
          dataInicio: "2024-03-10",
          dataFim: "2026-03-10",
        },
      ],
      evidence: {
        source: "Portal da Transparência — CEIS/CNEP",
        url: "https://portaldatransparencia.gov.br/sancoes",
        collected_at: NOW,
      },
    },
    contratos: {
      status: "ok",
      total: 12,
      items: Array.from({ length: 3 }, (_, i) => ({
        orgao: `Órgão contratante Mock ${i + 1}`,
        objeto: "Prestação de serviços financeiros (mock)",
        valorGlobal: 1_250_000 * (i + 1),
        dataAssinatura: "2025-01-15",
      })),
      evidence: {
        source: "Portal Nacional de Contratações Públicas (PNCP)",
        url: "https://pncp.gov.br",
        collected_at: NOW,
      },
    },
    licitacoes: {
      status: "ok",
      total: 4,
      items: Array.from({ length: 3 }, (_, i) => ({
        orgao: `Órgão licitante Mock ${i + 1}`,
        objeto: "Contratação de serviços (mock)",
        modalidade: "Pregão eletrônico",
        dataAbertura: "2026-02-01",
      })),
      evidence: {
        source: "Portal Nacional de Contratações Públicas (PNCP)",
        url: "https://pncp.gov.br",
        collected_at: NOW,
      },
    },
    leiloes_arrematados: {
      status: "vazio",
      total: 0,
      items: [],
      evidence: {
        source: "Receita Federal — Leilões de mercadorias",
        url: "https://www.gov.br/receitafederal",
        collected_at: NOW,
      },
    },
    ceap: {
      status: "evidencia_insuficiente",
      total: 0,
      items: [],
      evidence: {
        source: "Câmara dos Deputados — CEAP",
        url: "https://www.camara.leg.br/transparencia/gastos-parlamentares",
        collected_at: NOW,
      },
    },
    marcas: {
      status: "ok",
      total: 2,
      items: [
        { marca: "MOCK MARCA 1", situacao: "Registro concedido", classe: "36" },
        { marca: "MOCK MARCA 2", situacao: "Em análise", classe: "36" },
      ],
      evidence: {
        source: "INPI — Revista da Propriedade Industrial (RPI)",
        url: "https://busca.inpi.gov.br/pePI/jsp/marcas/Pesquisa_classe_basica.jsp",
        collected_at: NOW,
      },
    },
    transferencias: {
      status: "vazio",
      total: 0,
      items: [],
      evidence: {
        source: "TransfereGov",
        url: "https://www.transferegov.gov.br/",
        collected_at: NOW,
      },
    },
    ambiental: {
      status: "ok",
      total: 1,
      items: [
        {
          tipoInfracao: "Poluição (mock)",
          uf: "SP",
          municipio: "São Paulo",
          valorMulta: 45_000,
          data: "2023-08-22",
        },
      ],
      evidence: {
        source: "IBAMA — Autos de Infração",
        url: "https://dadosabertos.ibama.gov.br/dataset/fiscalizacao-auto-de-infracao",
        collected_at: NOW,
      },
    },
    fiscal: {
      status: "evidencia_insuficiente",
      total: 0,
      items: [],
      evidence: {
        source: "SICONFI — Tesouro Nacional",
        url: "https://siconfi.tesouro.gov.br",
        collected_at: NOW,
      },
    },
    juridico: {
      status: "vazio",
      total: 0,
      items: [],
      evidence: {
        source: "CNJ — DataJud",
        url: "https://www.cnj.jus.br",
        collected_at: NOW,
      },
    },
  },
  generated_at: NOW,
};

/** Devolve uma cópia do mock com o CNPJ solicitado embutido (para navegação por qualquer CNPJ em dev). */
export function buildMockDossie(cnpj: string): DossiePayload {
  return {
    ...MOCK_DOSSIE,
    cnpj,
    header: { ...MOCK_DOSSIE.header },
    generated_at: new Date().toISOString(),
  };
}
