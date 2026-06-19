/**
 * certidoes-helper.ts
 * Lógica de negócio para disparar os 9 kinds de certidão InfoSimples em paralelo
 * e computar o semáforo geral de regularidade de um CNPJ.
 */

import type { CertidaoResult } from "../infosimples/infosimples-client";
import { consultarCertidao } from "../infosimples/infosimples-client";

// ---------------------------------------------------------------------------
// Catálogo dos 9 kinds
// ---------------------------------------------------------------------------

export const CERTIDAO_KINDS = [
  { kind: "receita-federal-cnpj",    label: "Receita Federal — CNPJ" },
  { kind: "receita-federal-simples", label: "Simples Nacional" },
  { kind: "receita-federal-pgfn",    label: "PGFN — Dívida Ativa" },
  { kind: "tst-cndt",                label: "TST — Certidão de Débitos Trabalhistas" },
  { kind: "caixa-fgts",              label: "FGTS — Regularidade" },
  { kind: "transparencia-ceis",      label: "CEIS — Empresas Sancionadas" },
  { kind: "transparencia-cnep",      label: "CNEP — Cadastro de Punidos" },
  { kind: "tcu-inidoneo",            label: "TCU — Inidoneidade" },
  { kind: "mte-trabalho-escravo",    label: "MTE — Lista Suja do Trabalho Escravo" },
] as const;

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface CertidaoCardState {
  kind: string;
  label: string;
  result: CertidaoResult;
}

export type SemaforoGeral = "regular" | "atencao" | "irregular" | "indisponivel";

// ---------------------------------------------------------------------------
// computarSemaforo
// ---------------------------------------------------------------------------

/**
 * Reduz o array de cards num único status de semáforo.
 *
 * Prioridade (descendente):
 *   irregular  → qualquer card ok com status irregular
 *   atencao    → qualquer card ok com status atencao
 *   regular    → qualquer card ok com status regular
 *   indisponivel → nenhum card ok com status útil
 */
export function computarSemaforo(cards: CertidaoCardState[]): SemaforoGeral {
  const statuses = cards
    .map((c) => c.result)
    .filter((r): r is Extract<CertidaoResult, { state: "ok" }> => r.state === "ok")
    .map((r) => r.data.status);

  if (statuses.includes("irregular")) return "irregular";
  if (statuses.includes("atencao"))   return "atencao";
  if (statuses.includes("regular"))   return "regular";
  return "indisponivel";
}

// ---------------------------------------------------------------------------
// consultarTodasCertidoes
// ---------------------------------------------------------------------------

/**
 * Dispara os 9 kinds em paralelo e devolve o array de CertidaoCardState.
 *
 * Usa Promise.allSettled para garantir que uma falha isolada não cancela as demais.
 * Se uma promise for rejeitada (situação improvável — o cliente não lança),
 * o card recebe `{ state: 'error', message: ... }`.
 */
export async function consultarTodasCertidoes(
  cnpj: string,
): Promise<CertidaoCardState[]> {
  const settled = await Promise.allSettled(
    CERTIDAO_KINDS.map(({ kind }) => consultarCertidao(kind, cnpj)),
  );

  return CERTIDAO_KINDS.map(({ kind, label }, i) => {
    const outcome = settled[i];

    const result: CertidaoResult = (() => {
      if (outcome === undefined) {
        return { state: "error" as const, message: "Resultado ausente." };
      }
      if (outcome.status === "fulfilled") return outcome.value;
      return {
        state: "error" as const,
        message:
          outcome.reason instanceof Error
            ? outcome.reason.message
            : String(outcome.reason),
      };
    })();

    return { kind, label, result };
  });
}
