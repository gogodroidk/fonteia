import type { LeilaoOpportunityScore } from "@fonteia/scoring";
import { normalizeReceitaDestaquesPayload, type ReceitaLeilaoLot, type ReceitaLeiloesDestaquesPayload } from "@fonteia/sources";
import { createMemoryLeiloesRepository, type LeiloesRepository } from "../repositories/leiloes-repository";
import { jsonResponse, notFound, type ApiResponse } from "./types";

const samplePayload: ReceitaLeiloesDestaquesPayload = {
  agora: "2026-06-10 02:40",
  destaques: [
    {
      permitePF: false,
      orgao: "Receita Federal",
      cidade: "BELEM",
      edital: "0200100/0000001/2026",
      edle: "200100/1/2026",
      dtFimProposta: "2026-07-06 20:00",
      destaque: true,
      imagemDestaque: "https://storagegw.estaleiro.serpro.gov.br/sle-pro-publico/arquivos/images/sample-belem.jpg",
      numero: 136,
      lote: 136,
      valor: 4000,
    },
    {
      permitePF: true,
      orgao: "Receita Federal",
      cidade: "FORTALEZA",
      edital: "0317900/0000002/2026",
      edle: "317900/2/2026",
      dtFimProposta: "2026-06-26 21:00",
      destaque: true,
      imagemDestaque: "https://storagegw.estaleiro.serpro.gov.br/sle-pro-publico/arquivos/images/sample-fortaleza.jpg",
      numero: 250,
      lote: 216,
      valor: 118805,
    },
  ],
};

export const SAMPLE_LEILAO_LOTS: ReceitaLeilaoLot[] = normalizeReceitaDestaquesPayload(samplePayload);
const defaultRepository = createMemoryLeiloesRepository(SAMPLE_LEILAO_LOTS);

export async function getLeilaoLots(
  repository: LeiloesRepository = defaultRepository,
): Promise<ApiResponse<{ sourceStatus: "fragile_operational"; lots: ReceitaLeilaoLot[] }>> {
  return jsonResponse({
    sourceStatus: "fragile_operational",
    lots: await repository.listLots(),
  });
}

export async function getLeilaoLot(
  lotId: string,
  repository: LeiloesRepository = defaultRepository,
): Promise<ApiResponse<ReceitaLeilaoLot | { error: string; path: string }>> {
  const lot = await repository.getLot(lotId);

  if (!lot) {
    return notFound(`/leiloes/lotes/${lotId}`);
  }

  return jsonResponse(lot);
}

export async function getLeilaoLotScore(
  lotId: string,
  repository: LeiloesRepository = defaultRepository,
): Promise<ApiResponse<LeilaoOpportunityScore | { error: string; path: string }>> {
  const score = await repository.getLotScore(lotId);

  if (!score) {
    return notFound(`/leiloes/lotes/${lotId}/score`);
  }

  return jsonResponse(score);
}
