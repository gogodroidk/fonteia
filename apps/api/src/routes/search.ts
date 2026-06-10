import type { FonteiaEntity } from "@fonteia/domain";
import { jsonResponse, type ApiResponse, type RouteRequest } from "./types";

export const SAMPLE_ENTITIES: FonteiaEntity[] = [
  {
    id: "sample-auction-lot-001",
    kind: "auction_lot",
    name: "Lote Receita Federal - eletronicos variados",
    sourceIds: ["receita-leiloes-sle"],
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    editalId: "sample-edital",
    lotNumber: "001",
    city: "Santos",
    state: "SP",
    minimumBidCents: 150000,
    eligiblePersonTypes: ["pf", "pj"],
  },
  {
    id: "sample-source-politica-001",
    kind: "document",
    name: "Consulta exemplo sobre transparencia publica",
    sourceIds: ["portal-transparencia-api"],
    createdAt: "2026-06-10T00:00:00.000Z",
    updatedAt: "2026-06-10T00:00:00.000Z",
    url: "https://portaldatransparencia.gov.br/api-de-dados",
    mimeType: "text/html",
  },
];

export interface SearchBody {
  query: string;
  results: FonteiaEntity[];
}

export function searchEntities(request: RouteRequest): ApiResponse<SearchBody> {
  const query = request.query.get("q")?.trim() ?? "";
  const normalized = query.toLowerCase();

  const results = normalized
    ? SAMPLE_ENTITIES.filter((entity) => entity.name.toLowerCase().includes(normalized) || entity.kind.includes(normalized))
    : SAMPLE_ENTITIES;

  return jsonResponse({ query, results });
}

