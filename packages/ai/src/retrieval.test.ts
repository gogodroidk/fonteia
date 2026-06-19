import { describe, expect, it } from "vitest";
import {
  buildRetrievalContextBlock,
  extractEntitySource,
  hybridRank,
  normalizePtBr,
  reciprocalRankFusion,
  rerankCandidates,
  tokenizePtBr,
  type FusedCandidate,
  type RankedList,
  type RetrievalCandidate,
} from "./retrieval";

const c = (
  id: string,
  name: string,
  attributes: Record<string, unknown> = {},
  score?: number,
): RetrievalCandidate => ({ id, kind: "company", name, attributes, score });

describe("normalizePtBr / tokenizePtBr", () => {
  it("remove acentos, caixa e pontuacao", () => {
    expect(normalizePtBr("Construção SÃO-Paulo, Ltda.")).toBe("construcao sao paulo ltda");
  });

  it("tokeniza em termos unicos e descarta tokens de 1 char", () => {
    expect(tokenizePtBr("a obra de São Paulo e o metro")).toEqual([
      "obra",
      "de",
      "sao",
      "paulo",
      "metro",
    ]);
  });

  it("entrada vazia/ruido devolve lista vazia", () => {
    expect(tokenizePtBr("   . , ; ")).toEqual([]);
  });
});

describe("reciprocalRankFusion", () => {
  it("funde duas listas e promove itens presentes em ambas", () => {
    const vector: RankedList = {
      source: "vector",
      items: [c("a", "Alpha", {}, 0.9), c("b", "Beta", {}, 0.8), c("z", "Zeta", {}, 0.7)],
    };
    const keyword: RankedList = {
      source: "keyword",
      items: [c("b", "Beta"), c("a", "Alpha"), c("y", "Ypsilon")],
    };
    const fused = reciprocalRankFusion([vector, keyword]);
    const ids = fused.map((f) => f.id);
    // a e b aparecem em ambas → ficam acima de itens de lista unica (z, y)
    expect(ids.slice(0, 2).sort()).toEqual(["a", "b"]);
    expect(ids).toContain("y");
    expect(ids).toContain("z");
  });

  it("deduplica por id e preserva o maior score vetorial", () => {
    const fused = reciprocalRankFusion([
      { source: "vector", items: [c("a", "Alpha", {}, 0.6)] },
      { source: "keyword", items: [c("a", "Alpha", {})] }, // sem score
    ]);
    expect(fused).toHaveLength(1);
    expect(fused[0]?.score).toBe(0.6);
  });

  it("ignora itens sem id (defensivo) e e deterministico", () => {
    const bad = { id: "", kind: "x", name: "no-id", attributes: {} } as RetrievalCandidate;
    const fused = reciprocalRankFusion([{ source: "vector", items: [bad, c("a", "Alpha")] }]);
    expect(fused.map((f) => f.id)).toEqual(["a"]);
  });
});

describe("rerankCandidates", () => {
  const fuse = (items: RetrievalCandidate[]): FusedCandidate[] =>
    reciprocalRankFusion([{ source: "vector", items }]);

  it("coloca o match EXATO de nome no topo, acima do maior score vetorial", () => {
    const fused = fuse([
      c("vec", "Construtora Genérica do Brasil SA", {}, 0.95), // vetor alto, nome irrelevante
      c("exact", "Acme", {}, 0.2), // vetor baixo, mas nome == query
    ]);
    const ranked = rerankCandidates("Acme", fused);
    expect(ranked[0]?.id).toBe("exact");
  });

  it("prefixo e substring de nome pesam mais que so overlap de termo", () => {
    const fused = fuse([
      c("starts", "Petrobras Distribuidora", {}, 0.3),
      c("overlap", "Distribuidora de Bebidas Petro", {}, 0.3),
    ]);
    const ranked = rerankCandidates("Petrobras", fused);
    expect(ranked[0]?.id).toBe("starts");
  });

  it("e deterministico: mesma entrada => mesma ordem", () => {
    const items = [c("a", "Banco do Brasil", {}, 0.5), c("b", "Banco Bradesco", {}, 0.5)];
    const r1 = rerankCandidates("banco", fuse(items)).map((x) => x.id);
    const r2 = rerankCandidates("banco", fuse(items)).map((x) => x.id);
    expect(r1).toEqual(r2);
  });
});

describe("hybridRank", () => {
  it("funde, reranqueia e corta no limite (corte apos o reranking)", () => {
    const vector: RankedList = {
      source: "vector",
      items: [c("v1", "Empresa A", {}, 0.9), c("v2", "Empresa B", {}, 0.8)],
    };
    const keyword: RankedList = {
      source: "keyword",
      items: [c("k1", "Acme Comercio", {}), c("v1", "Empresa A", {})],
    };
    const top = hybridRank([vector, keyword], "Acme", 2);
    expect(top).toHaveLength(2);
    // "Acme" deve promover k1 ao topo apesar de vir só do keyword
    expect(top[0]?.id).toBe("k1");
  });

  it("lista unica (keyword falhou) ainda funciona — degradacao graciosa", () => {
    const only: RankedList = { source: "vector", items: [c("a", "X", {}, 0.5), c("b", "Y", {}, 0.4)] };
    const top = hybridRank([only], "qualquer", 10);
    expect(top.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("extractEntitySource / buildRetrievalContextBlock", () => {
  it("extrai URL e data de attributes (varias chaves)", () => {
    const src = extractEntitySource(
      c("a", "Lote 1", { sourceUrl: "https://x.gov.br/edital", collectedAt: "2026-06-10" }),
    );
    expect(src.sourceUrl).toBe("https://x.gov.br/edital");
    expect(src.date).toBe("2026-06-10");
  });

  it("monta bloco citavel numerado com fonte e data", () => {
    const block = buildRetrievalContextBlock([
      c("a", "Prefeitura X", { url: "https://x.gov.br", data: "2026-01-01" }),
      c("b", "Empresa Y", {}),
    ]);
    expect(block).toContain("[1] Prefeitura X");
    expect(block).toContain("fonte: https://x.gov.br");
    expect(block).toContain("[2] Empresa Y");
  });

  it("sem candidatos => bloco vazio (sinaliza evidencia insuficiente ao caller)", () => {
    expect(buildRetrievalContextBlock([])).toBe("");
  });
});
