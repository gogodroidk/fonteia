import { describe, expect, it } from "vitest";
import type { ReceitaCatalogLot, ReceitaEditalCompletoRaw } from "@fonteia/sources";
import {
  decodeBase64ToBytes,
  ingestReceitaCatalog,
  isPdf,
  type CatalogSink,
  type EditalPdfEvidence,
} from "./ingest-receita-catalog";

// editais-disponiveis: um relevante (situacao 3) e um cancelado (situacao 14, deve ser filtrado).
const disponiveis = {
  agora: "2026-06-13 05:03",
  situacoes: [
    {
      situacao: 3,
      lista: [
        {
          edital: "0200100/000001/2026",
          edle: "200100/1/2026",
          codigoSituacao: 3,
          permitePF: true,
          orgao: "Receita Federal do Brasil",
          cidade: "SR2",
          dataFimPropostas: "2026-07-06 20:00",
          lotes: 2,
        },
      ],
    },
    {
      situacao: 14,
      lista: [
        {
          edital: "0999999/000009/2026",
          edle: "999999/9/2026",
          codigoSituacao: 14,
          permitePF: false,
          orgao: "RFB",
          cidade: "X",
          lotes: 1,
        },
      ],
    },
  ],
};

const editalCompleto: ReceitaEditalCompletoRaw = {
  edital: "0200100/000001/2026",
  edle: "200100/1/2026",
  permitePF: true,
  orgao: "Receita Federal do Brasil",
  cidade: "SR2",
  dataFimPropostas: "2026-07-06 20:00",
  listaLotes: [
    { loleNrSq: 1, nrAtribuido: 1, tipo: "MINERAL", valorMinimo: 850000, valorAvaliacao: 1500000, permitePF: false },
    { loleNrSq: 2, nrAtribuido: 2, valorMinimo: 1000, permitePF: true },
  ],
};

class MemorySink implements CatalogSink {
  editais: Array<{ edle: string; hash: string }> = [];
  lots: ReceitaCatalogLot[] = [];
  pdfs: Array<{ edle: string; pdf: EditalPdfEvidence }> = [];

  async upsertEdital(edital: ReceitaEditalCompletoRaw, contentHash: string): Promise<void> {
    this.editais.push({ edle: edital.edle, hash: contentHash });
  }
  async upsertLots(lots: ReceitaCatalogLot[]): Promise<number> {
    this.lots.push(...lots);
    return lots.length;
  }
  async putEditalPdf(edle: string, pdf: EditalPdfEvidence): Promise<void> {
    this.pdfs.push({ edle, pdf });
  }
}

function makeFetcher(): typeof fetch {
  return (async (url: string) => {
    const u = String(url);
    let body: unknown;
    if (u.includes("editais-disponiveis")) {
      body = disponiveis;
    } else if (u.includes("/edital-completo")) {
      body = { data: btoa("%PDF-1.7 edital de teste"), name: "Edital.pdf", length: 24 };
    } else if (u.includes("/api/edital/")) {
      body = editalCompleto;
    } else {
      throw new Error(`URL inesperada no teste: ${u}`);
    }
    return { ok: true, json: async () => body } as Response;
  }) as typeof fetch;
}

describe("ingestReceitaCatalog", () => {
  it("decodes base64 and detects %PDF magic bytes", () => {
    const bytes = decodeBase64ToBytes(btoa("%PDF-1.7 abc"));
    expect(isPdf(bytes)).toBe(true);
    expect(isPdf(decodeBase64ToBytes(btoa("not a pdf")))).toBe(false);
  });

  it("crawls only relevant situacoes, normalizes all lots, and stores the PDF as evidence", async () => {
    const sink = new MemorySink();
    const result = await ingestReceitaCatalog({
      sink,
      fetcher: makeFetcher(),
      sleep: async () => undefined, // sem espera real no teste
      log: () => undefined,
    });

    // situacao 14 (cancelado) é filtrada -> apenas 1 edital relevante
    expect(result.editaisSeen).toBe(1);
    expect(result.editaisIngested).toBe(1);
    expect(result.lotsUpserted).toBe(2);
    expect(result.pdfsStored).toBe(1);
    expect(result.errors).toEqual([]);

    expect(sink.editais[0]?.edle).toBe("200100/1/2026");
    expect(sink.editais[0]?.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(sink.lots.map((l) => l.id)).toEqual(["200100-1-2026-1", "200100-1-2026-2"]);
    expect(sink.lots[0]?.minimumBidCents).toBe(85_000_000);
    expect(sink.pdfs[0]?.pdf.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(isPdf(sink.pdfs[0]!.pdf.bytes)).toBe(true);
  });

  it("respects maxEditais and can skip the PDF step", async () => {
    const sink = new MemorySink();
    const result = await ingestReceitaCatalog({
      sink,
      fetcher: makeFetcher(),
      sleep: async () => undefined,
      includePdf: false,
      maxEditais: 1,
    });
    expect(result.pdfsStored).toBe(0);
    expect(sink.pdfs).toHaveLength(0);
    expect(result.editaisIngested).toBe(1);
  });
});
