export const RECEITA_LEILOES_DESTAQUES_URL =
  "https://www25.receita.fazenda.gov.br/sle-sociedade/api/portal/destaques";

export interface ReceitaLeiloesDestaqueRaw {
  permitePF: boolean;
  orgao: string;
  cidade: string;
  edital: string;
  edle: string;
  dtFimProposta: string;
  destaque: boolean;
  imagemDestaque?: string;
  numero: number;
  lote: number;
  valor: number;
}

export interface ReceitaLeiloesDestaquesPayload {
  agora: string;
  destaques: ReceitaLeiloesDestaqueRaw[];
}

export interface ReceitaLeilaoLot {
  id: string;
  sourceId: "receita-leiloes-sle";
  edital: string;
  edle: string;
  lotNumber: string;
  displayNumber: string;
  city: string;
  agency: string;
  minimumBidCents: number;
  proposalDeadline: string;
  eligiblePersonTypes: Array<"pf" | "pj">;
  imageUrl?: string;
  sourceUrl: string;
  collectedAt: string;
  raw: ReceitaLeiloesDestaqueRaw;
}

function parseReceitaDate(value: string): string {
  const [datePart, timePart = "00:00"] = value.split(" ");
  const [year, month, day] = datePart?.split("-") ?? [];

  if (!year || !month || !day) {
    return value;
  }

  return `${year}-${month}-${day}T${timePart}:00-03:00`;
}

function buildLotId(raw: ReceitaLeiloesDestaqueRaw): string {
  return `${raw.edle.replaceAll("/", "-")}-${raw.lote}`;
}

export function normalizeReceitaDestaque(raw: ReceitaLeiloesDestaqueRaw, collectedAt: string): ReceitaLeilaoLot {
  const lot: ReceitaLeilaoLot = {
    id: buildLotId(raw),
    sourceId: "receita-leiloes-sle",
    edital: raw.edital,
    edle: raw.edle,
    lotNumber: String(raw.lote),
    displayNumber: String(raw.numero),
    city: raw.cidade,
    agency: raw.orgao,
    minimumBidCents: Math.round(raw.valor * 100),
    proposalDeadline: parseReceitaDate(raw.dtFimProposta),
    eligiblePersonTypes: raw.permitePF ? ["pf", "pj"] : ["pj"],
    sourceUrl: RECEITA_LEILOES_DESTAQUES_URL,
    collectedAt,
    raw,
  };

  if (raw.imagemDestaque) {
    lot.imageUrl = raw.imagemDestaque;
  }

  return lot;
}

export function normalizeReceitaDestaquesPayload(payload: ReceitaLeiloesDestaquesPayload): ReceitaLeilaoLot[] {
  const collectedAt = parseReceitaDate(payload.agora);
  return payload.destaques.map((raw) => normalizeReceitaDestaque(raw, collectedAt));
}

export async function fetchReceitaLeiloesDestaques(fetcher: typeof fetch = fetch): Promise<ReceitaLeilaoLot[]> {
  const response = await fetcher(RECEITA_LEILOES_DESTAQUES_URL, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Receita Leiloes request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as ReceitaLeiloesDestaquesPayload;
  return normalizeReceitaDestaquesPayload(payload);
}
