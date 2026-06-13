import { describe, expect, it } from "vitest";
import {
  editalApiUrl,
  fetchEditaisDisponiveis,
  fetchEditalCompleto,
  listAllEditais,
  lotePortalUrl,
  normalizeEditalLots,
  parseEdle,
  type ReceitaEditaisDisponiveisPayload,
  type ReceitaEditalCompletoRaw,
} from "./receita-leiloes-catalog";

const disponiveis: ReceitaEditaisDisponiveisPayload = {
  agora: "2026-06-13 05:03",
  situacoes: [
    {
      situacao: 2,
      lista: [
        {
          edital: "0717600/000004/2026",
          edle: "717600/4/2026",
          codigoSituacao: 2,
          permitePF: false,
          orgao: "RFB",
          cidade: "RIO DE JANEIRO",
          dataFimPropostas: "2026-07-15 21:00",
          lotes: 40,
        },
      ],
    },
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
          lotes: 191,
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
    {
      loleNrSq: 1,
      nrAtribuido: 1,
      tipo: "PRODUTO MINERAL",
      situacaoLote: 11,
      valorMinimo: 850000,
      valorAvaliacao: 1500000,
      possuiImagens: true,
      permitePF: false,
      imagens: [{ imllNrSq: 530697, src: "https://storagegw.estaleiro.serpro.gov.br/a.jpg", w: 1200, h: 1600 }],
    },
    { loleNrSq: 2, nrAtribuido: 2, valorMinimo: 1000, permitePF: true },
  ],
};

describe("Receita SLE catalog connector", () => {
  it("parses edle into unidade/numero/exercicio", () => {
    expect(parseEdle("200100/1/2026")).toEqual({ unidade: "200100", numero: "1", exercicio: "2026" });
  });

  it("builds API and human portal URLs from edle", () => {
    expect(editalApiUrl("200100/1/2026")).toBe(
      "https://www25.receita.fazenda.gov.br/sle-sociedade/api/edital/200100/1/2026",
    );
    expect(lotePortalUrl("200100/1/2026", 139)).toContain("/portal/edital/200100/1/2026/lote/139");
  });

  it("flattens ALL editais across situacao groups (not just destaques)", () => {
    const all = listAllEditais(disponiveis);
    expect(all).toHaveLength(2);
    expect(all.map((e) => e.edle)).toContain("717600/4/2026");
  });

  it("normalizes every lot of an edital (reais->cents, lot-level PF overrides edital)", () => {
    const lots = normalizeEditalLots(editalCompleto, "2026-06-13T05:03:00-03:00");
    expect(lots).toHaveLength(2);
    const [first, second] = lots;

    expect(first).toMatchObject({
      id: "200100-1-2026-1",
      edle: "200100/1/2026",
      lotNumber: "1",
      displayNumber: "1",
      minimumBidCents: 85_000_000,
      valorAvaliacaoCents: 150_000_000,
      category: "PRODUTO MINERAL",
      eligiblePersonTypes: ["pj"], // lote permitePF=false sobrepõe o edital permitePF=true
    });
    expect(first?.imageUrl).toContain("storagegw");

    expect(second?.eligiblePersonTypes).toEqual(["pf", "pj"]); // lote permitePF=true
    expect(second?.minimumBidCents).toBe(100_000);
  });

  it("uses an injected fetcher so tests never depend on Receita uptime", async () => {
    const fakeFetch = (async (url: string) =>
      ({
        ok: true,
        json: async () => (String(url).includes("editais-disponiveis") ? disponiveis : editalCompleto),
      }) as Response) as typeof fetch;

    const catalogo = await fetchEditaisDisponiveis(fakeFetch);
    expect(catalogo.situacoes).toHaveLength(2);

    const edital = await fetchEditalCompleto("200100/1/2026", fakeFetch);
    expect(edital.listaLotes).toHaveLength(2);
  });
});
