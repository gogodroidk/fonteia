/**
 * custo-total.ts — Estimativa de custo total de arremate em leilão da Receita.
 *
 * AVISO: são ESTIMATIVAS com defaults genéricos. Comissão, tributos (ICMS/IOF),
 * retirada, frete e encargos variam por edital. Nunca decida sem ler o edital.
 */

export interface CustoTotalInput {
  /** Lance (arremate) em centavos. */
  lanceCents: number;
  /** Comissão do leiloeiro em % (0–100). Default 5. */
  comissaoLeiloeiroPct?: number | undefined;
  /** Tributos estimados sobre o lance em % (0–100). Default 0 (= "varia, confira o edital"). */
  tributosPct?: number | undefined;
  /** Custos fixos adicionais em centavos (retirada, frete). Default 0. */
  outrosCents?: number | undefined;
}

export interface CustoTotalResult {
  lanceCents: number;
  comissaoCents: number;
  tributosCents: number;
  outrosCents: number;
  totalCents: number;
  parametros: { comissaoLeiloeiroPct: number; tributosPct: number };
}

const DEFAULT_COMISSAO_PCT = 5;
const DEFAULT_TRIBUTOS_PCT = 0;

/**
 * Custo total estimado = lance + comissão(%·lance) + tributos(%·lance) + outros.
 * Percentuais aplicados sobre o lance (a base exata pode diferir por edital).
 */
export function estimarCustoTotal(input: CustoTotalInput): CustoTotalResult {
  const {
    lanceCents,
    comissaoLeiloeiroPct = DEFAULT_COMISSAO_PCT,
    tributosPct = DEFAULT_TRIBUTOS_PCT,
    outrosCents = 0,
  } = input;

  const comissaoCents = Math.round(lanceCents * (comissaoLeiloeiroPct / 100));
  const tributosCents = Math.round(lanceCents * (tributosPct / 100));
  const totalCents = lanceCents + comissaoCents + tributosCents + outrosCents;

  return {
    lanceCents,
    comissaoCents,
    tributosCents,
    outrosCents,
    totalCents,
    parametros: { comissaoLeiloeiroPct, tributosPct },
  };
}
