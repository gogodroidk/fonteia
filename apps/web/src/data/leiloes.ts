import type { Evidence } from "@fonteia/domain";

export interface AuctionOpportunity {
  id: string;
  title: string;
  city: string;
  eligibility: "PF e PJ" | "PJ" | "PF";
  deadline: string;
  estimatedValue: string;
  entryValue: string;
  opportunityScore: number;
  risk: "baixo" | "medio" | "alto";
  nextAction: string;
  sourceLabel: string;
  evidence: Evidence[];
}

export const AUCTION_OPPORTUNITIES: AuctionOpportunity[] = [
  {
    id: "lot-rfb-001",
    title: "Lote misto de eletronicos e ferramentas",
    city: "Santos, SP",
    eligibility: "PF e PJ",
    deadline: "2026-06-18",
    estimatedValue: "R$ 42.800",
    entryValue: "R$ 18.500",
    opportunityScore: 86,
    risk: "medio",
    nextAction: "Abrir edital e validar retirada",
    sourceLabel: "Receita Federal SLE",
    evidence: [
      {
        id: "ev-rfb-001",
        sourceId: "receita-leiloes-sle",
        sourceUrl: "https://www25.receita.fazenda.gov.br/sle-sociedade/",
        kind: "api_payload",
        collectedAt: "2026-06-10T10:00:00.000Z",
        rawRecordId: "raw-rfb-001",
        quote: "Lote disponivel no portal publico de leiloes da Receita Federal.",
        hash: "sha256:demo-rfb-001",
        confidence: 0.78,
      },
    ],
  },
  {
    id: "lot-rfb-002",
    title: "Veiculo utilitario com restricoes de edital",
    city: "Curitiba, PR",
    eligibility: "PJ",
    deadline: "2026-06-15",
    estimatedValue: "R$ 63.000",
    entryValue: "R$ 39.900",
    opportunityScore: 71,
    risk: "alto",
    nextAction: "Checar custos, patio e transferencia",
    sourceLabel: "Receita Federal SLE",
    evidence: [
      {
        id: "ev-rfb-002",
        sourceId: "receita-leiloes-sle",
        sourceUrl: "https://www25.receita.fazenda.gov.br/sle-sociedade/",
        kind: "api_payload",
        collectedAt: "2026-06-10T10:00:00.000Z",
        rawRecordId: "raw-rfb-002",
        quote: "Lote exige leitura do edital antes de proposta.",
        hash: "sha256:demo-rfb-002",
        confidence: 0.74,
      },
    ],
  },
  {
    id: "lot-rfb-003",
    title: "Mercadorias importadas para revenda",
    city: "Manaus, AM",
    eligibility: "PF e PJ",
    deadline: "2026-06-21",
    estimatedValue: "R$ 91.200",
    entryValue: "R$ 52.000",
    opportunityScore: 79,
    risk: "medio",
    nextAction: "Comparar demanda local e frete",
    sourceLabel: "Receita Federal SLE",
    evidence: [
      {
        id: "ev-rfb-003",
        sourceId: "receita-leiloes-sle",
        sourceUrl: "https://www25.receita.fazenda.gov.br/sle-sociedade/",
        kind: "api_payload",
        collectedAt: "2026-06-10T10:00:00.000Z",
        rawRecordId: "raw-rfb-003",
        quote: "Descricao e valores derivados do lote publico monitorado.",
        hash: "sha256:demo-rfb-003",
        confidence: 0.76,
      },
    ],
  },
];
