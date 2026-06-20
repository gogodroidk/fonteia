/**
 * idoneidade.ts — Módulo de lógica pura para verificação de compliance/idoneidade
 * de empresas no Cérebro.
 *
 * Dispara 7 kinds do infosimples-proxy em paralelo e computa o semáforo
 * (selo) consolidado. Nenhum JSX, nenhuma dependência React.
 */

import {
  consultarCertidao,
  type CertidaoResult,
} from "../infosimples/infosimples-client";

// ─── Kinds de compliance (subconjunto de 7 dos 9 suportados) ─────────────────

export const IDONEIDADE_KINDS = [
  { kind: "transparencia-ceis",   label: "CEIS — Empresas Sancionadas" },
  { kind: "transparencia-cnep",   label: "CNEP — Cadastro de Punidos" },
  { kind: "tcu-inidoneo",         label: "TCU — Inidoneidade" },
  { kind: "mte-trabalho-escravo", label: "MTE — Lista Suja Trabalho Escravo" },
  { kind: "receita-federal-pgfn", label: "PGFN — Dívida Ativa" },
  { kind: "tst-cndt",             label: "TST — Débitos Trabalhistas" },
  { kind: "caixa-fgts",           label: "FGTS — Regularidade" },
] as const;

export type IdoneidadeKindStr = (typeof IDONEIDADE_KINDS)[number]["kind"];

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Resultado de um kind de compliance. */
export interface IdoneidadeCardState {
  kind: IdoneidadeKindStr;
  label: string;
  result: CertidaoResult;
}

/**
 * Semáforo consolidado.
 * - irregular: qualquer card ok com status irregular
 * - atencao:   qualquer card ok com status atencao (sem irregular)
 * - regular:   todos os cards ok têm status regular
 * - indisponivel: nenhum card ok
 */
export type IdoneidadeSelo = "irregular" | "atencao" | "regular" | "indisponivel";

// ─── Computar selo ────────────────────────────────────────────────────────────

/**
 * Computa o semáforo consolidado a partir do array de cards de idoneidade.
 *
 * Prioridade: irregular > atencao > regular > indisponivel.
 */
export function computarSelo(cards: IdoneidadeCardState[]): IdoneidadeSelo {
  let hasRegular = false;
  for (const card of cards) {
    if (card.result.state !== "ok") continue;
    const { status } = card.result.data;
    if (status === "irregular") return "irregular";
    if (status === "atencao") {
      // Não retorna imediatamente: pode haver irregular mais à frente.
      // Mas como o loop já verificou irregular antes, podemos acumular.
      // Na prática, se chegarmos aqui é pq não há irregular ainda —
      // mas precisamos continuar o loop para checar os restantes.
      // Usamos uma flag intermediária.
    }
    if (status === "regular") hasRegular = true;
  }

  // Segunda passagem para atencao (não misturar com irregular acima).
  for (const card of cards) {
    if (card.result.state !== "ok") continue;
    const { status } = card.result.data;
    if (status === "atencao") return "atencao";
  }

  if (hasRegular) return "regular";
  return "indisponivel";
}

// ─── Verificar idoneidade ─────────────────────────────────────────────────────

/**
 * Dispara os 7 kinds de compliance em paralelo para um dado CNPJ.
 * Usa `Promise.allSettled` — nunca lança. Se uma promise é rejeitada
 * (evento improvável, pois consultarCertidao nunca lança), o card
 * correspondente recebe `{ state: 'error', message: '...' }`.
 *
 * @param cnpj - CNPJ (14 dígitos, com ou sem pontuação — a Edge normaliza).
 * @returns Array com um IdoneidadeCardState por kind, na mesma ordem de IDONEIDADE_KINDS.
 */
export async function verificarIdoneidade(
  cnpj: string,
): Promise<IdoneidadeCardState[]> {
  const settled = await Promise.allSettled(
    IDONEIDADE_KINDS.map(({ kind }) => consultarCertidao(kind, cnpj)),
  );

  return IDONEIDADE_KINDS.map(({ kind, label }, idx) => {
    const entry = settled[idx];
    let result: CertidaoResult;

    if (entry === undefined || entry.status === "rejected") {
      const msg =
        entry?.status === "rejected" && entry.reason instanceof Error
          ? entry.reason.message
          : "Erro desconhecido na consulta.";
      result = { state: "error", message: msg };
    } else {
      result = entry.value;
    }

    return { kind, label, result };
  });
}
