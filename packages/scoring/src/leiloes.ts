import type { ReceitaLeilaoLot } from "@fonteia/sources";

export interface LeilaoOpportunityScore {
  lotId: string;
  score: number;
  label: "baixo" | "medio" | "alto";
  factors: Array<{
    id: string;
    label: string;
    impact: "positive" | "neutral" | "negative";
    points: number;
  }>;
  maxSuggestedBidCents: number;
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function daysUntil(deadline: string, now: Date): number {
  const deadlineMs = new Date(deadline).getTime();

  if (Number.isNaN(deadlineMs)) {
    return 0;
  }

  return Math.ceil((deadlineMs - now.getTime()) / 86_400_000);
}

export function scoreReceitaLeilaoLot(lot: ReceitaLeilaoLot, now = new Date()): LeilaoOpportunityScore {
  const factors: LeilaoOpportunityScore["factors"] = [];
  let score = 45;

  if (lot.minimumBidCents <= 500_000) {
    score += 18;
    factors.push({
      id: "low-entry-ticket",
      label: "Valor minimo baixo facilita teste e giro rapido.",
      impact: "positive",
      points: 18,
    });
  } else if (lot.minimumBidCents >= 100_000_000) {
    score -= 18;
    factors.push({
      id: "high-entry-ticket",
      label: "Valor minimo alto exige capital e aumenta risco de liquidez.",
      impact: "negative",
      points: -18,
    });
  } else {
    factors.push({
      id: "medium-entry-ticket",
      label: "Valor minimo intermediario pede comparacao de mercado.",
      impact: "neutral",
      points: 0,
    });
  }

  if (lot.eligiblePersonTypes.includes("pf")) {
    score += 12;
    factors.push({
      id: "pf-eligible",
      label: "Permite pessoa fisica, aumentando liquidez e publico comprador.",
      impact: "positive",
      points: 12,
    });
  } else {
    score -= 10;
    factors.push({
      id: "pj-only",
      label: "Restrito a pessoa juridica, reduzindo publico e exigindo operacao formal.",
      impact: "negative",
      points: -10,
    });
  }

  if (lot.imageUrl) {
    score += 8;
    factors.push({
      id: "has-image",
      label: "Possui imagem publica, melhorando avaliacao inicial do lote.",
      impact: "positive",
      points: 8,
    });
  }

  const days = daysUntil(lot.proposalDeadline, now);
  if (days >= 7) {
    score += 10;
    factors.push({
      id: "enough-time",
      label: "Ainda ha tempo para vistoria, pesquisa de preco e logistica.",
      impact: "positive",
      points: 10,
    });
  } else if (days > 0) {
    score -= 8;
    factors.push({
      id: "deadline-soon",
      label: "Prazo proximo exige decisao rapida e aumenta risco operacional.",
      impact: "negative",
      points: -8,
    });
  } else {
    score -= 25;
    factors.push({
      id: "deadline-expired",
      label: "Prazo de proposta vencido ou invalido.",
      impact: "negative",
      points: -25,
    });
  }

  const finalScore = clampScore(score);
  const label = finalScore >= 70 ? "alto" : finalScore >= 45 ? "medio" : "baixo";
  const marginMultiplier = label === "alto" ? 1.35 : label === "medio" ? 1.2 : 1.1;

  return {
    lotId: lot.id,
    score: finalScore,
    label,
    factors,
    maxSuggestedBidCents: Math.round(lot.minimumBidCents * marginMultiplier),
  };
}

