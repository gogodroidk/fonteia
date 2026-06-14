import type { Evidence } from "@fonteia/domain";
import type { ReceitaLeilaoLot } from "@fonteia/sources";

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

function formatCurrencyFromCents(valueInCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(valueInCents / 100);
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function daysUntil(value: string): number {
  const deadline = new Date(value).getTime();

  if (Number.isNaN(deadline)) {
    return 30;
  }

  return Math.ceil((deadline - Date.now()) / 86_400_000);
}

function getEligibility(lot: ReceitaLeilaoLot): AuctionOpportunity["eligibility"] {
  const allowsPf = lot.eligiblePersonTypes.includes("pf");
  const allowsPj = lot.eligiblePersonTypes.includes("pj");

  if (allowsPf && allowsPj) {
    return "PF e PJ";
  }

  return allowsPf ? "PF" : "PJ";
}

function getRisk(lot: ReceitaLeilaoLot): AuctionOpportunity["risk"] {
  const remainingDays = daysUntil(lot.proposalDeadline);

  if (remainingDays <= 4 || lot.minimumBidCents >= 100_000_00) {
    return "alto";
  }

  if (remainingDays <= 10 || lot.minimumBidCents >= 40_000_00) {
    return "medio";
  }

  return "baixo";
}

function getOpportunityScore(lot: ReceitaLeilaoLot): number {
  const remainingDays = daysUntil(lot.proposalDeadline);
  const eligibilityBoost = lot.eligiblePersonTypes.includes("pf") ? 8 : 3;
  const ticketBoost = lot.minimumBidCents <= 25_000_00 ? 10 : lot.minimumBidCents <= 75_000_00 ? 6 : 1;
  const timingBoost = remainingDays >= 5 && remainingDays <= 21 ? 10 : remainingDays > 21 ? 5 : 0;
  const hasImageBoost = lot.imageUrl ? 3 : 0;

  return Math.min(94, 58 + eligibilityBoost + ticketBoost + timingBoost + hasImageBoost);
}

export function mapReceitaLotToOpportunity(lot: ReceitaLeilaoLot): AuctionOpportunity {
  const estimatedValueCents = Math.round(lot.minimumBidCents * 1.55);
  const risk = getRisk(lot);

  return {
    id: lot.id,
    title: `Lote ${lot.lotNumber} do edital ${lot.edital}`,
    city: lot.city,
    eligibility: getEligibility(lot),
    deadline: formatDate(lot.proposalDeadline),
    estimatedValue: formatCurrencyFromCents(estimatedValueCents),
    entryValue: formatCurrencyFromCents(lot.minimumBidCents),
    opportunityScore: getOpportunityScore(lot),
    risk,
    nextAction:
      risk === "alto"
        ? "Validar edital, retirada e custos antes de propor"
        : "Abrir edital e comparar margem de revenda",
    sourceLabel: "Receita Federal SLE",
    evidence: [
      {
        id: `ev-${lot.id}`,
        sourceId: lot.sourceId,
        sourceUrl: lot.sourceUrl,
        kind: "api_payload",
        collectedAt: lot.collectedAt,
        rawRecordId: lot.id,
        quote: `Lote ${lot.displayNumber} em ${lot.city}, lance minimo ${formatCurrencyFromCents(
          lot.minimumBidCents,
        )}, prazo ${formatDate(lot.proposalDeadline)}.`,
        hash: `sha256:${lot.id}`,
        confidence: 0.82,
      },
    ],
  };
}
