import { describe, expect, it } from "vitest";
import {
  buildCrossReferenceBlock,
  cnpjRoot,
  extractCnpj,
  extractValueBRL,
  formatBRLCompact,
  formatCnpj,
  labelForKind,
  summarizeCrossReference,
} from "./cross-reference";
import type { RetrievalCandidate } from "./retrieval";

const ent = (
  id: string,
  kind: string,
  name: string,
  attributes: Record<string, unknown> = {},
): RetrievalCandidate => ({ id, kind, name, attributes });

describe("extractCnpj / cnpjRoot / formatCnpj", () => {
  it("extrai CNPJ de attributes.cnpj (14 digitos)", () => {
    expect(extractCnpj(ent("x", "company", "ACME", { cnpj: "43.008.291/0001-77" }))).toBe(
      "43008291000177",
    );
  });

  it("usa o id quando ele e o proprio CNPJ", () => {
    expect(extractCnpj({ id: "43008291000177", attributes: {} })).toBe("43008291000177");
  });

  it("retorna null quando nao ha CNPJ valido", () => {
    expect(extractCnpj({ id: "faf:123", attributes: { nome: "X" } })).toBeNull();
    expect(extractCnpj({ id: "123", attributes: { cnpj: "123" } })).toBeNull();
  });

  it("raiz = 8 primeiros digitos; formato com mascara", () => {
    expect(cnpjRoot("43008291000177")).toBe("43008291");
    expect(formatCnpj("43008291000177")).toBe("43.008.291/0001-77");
  });
});

describe("extractValueBRL / formatBRLCompact", () => {
  it("le valor pt-BR em string (ponto=milhar, virgula=decimal)", () => {
    expect(extractValueBRL({ valorMulta: "396.237,13" })).toBeCloseTo(396237.13, 2);
  });

  it("le number em reais e *Cents em centavos", () => {
    expect(extractValueBRL({ valor: 1500 })).toBe(1500);
    expect(extractValueBRL({ valueCents: 150000 })).toBe(1500);
  });

  it("ignora o que nao e monetario", () => {
    expect(extractValueBRL({ nome: "X", uf: "SP" })).toBeNull();
    expect(extractValueBRL({ valorMulta: "0,00" })).toBe(0);
  });

  it("formata compacto (mil/mi/bi)", () => {
    expect(formatBRLCompact(396237)).toBe("R$ 396 mil");
    expect(formatBRLCompact(1_200_000)).toBe("R$ 1,2 mi");
    expect(formatBRLCompact(2_000_000_000)).toBe("R$ 2,0 bi");
  });
});

describe("labelForKind", () => {
  it("singular/plural pt-BR; fallback para kind cru", () => {
    expect(labelForKind("public_contract", 1)).toBe("1 contrato público");
    expect(labelForKind("public_contract", 3)).toBe("3 contratos públicos");
    expect(labelForKind("sanction", 2)).toBe("2 sanções");
    expect(labelForKind("kind_desconhecido", 4)).toBe("4 kind_desconhecido");
  });
});

describe("summarizeCrossReference", () => {
  const anchor = ent("anchor-id", "company", "ACME LTDA", { cnpj: "00002776000140" });
  const related: RetrievalCandidate[] = [
    ent("c1", "public_contract", "Contrato 1", { valor: 100000, sourceUrl: "https://pncp.gov.br/c1" }),
    ent("c2", "public_contract", "Contrato 2", { valor: 50000 }),
    ent("s1", "sanction", "Multa CNEP", { valorMulta: "396.237,13", sourceUrl: "https://portaldatransparencia.gov.br/s1" }),
    ent("anchor-id", "company", "ACME LTDA", {}), // a propria ancora: deve ser ignorada
    ent("", "x", "sem id", {}), // defensivo: sem id, ignorado
  ];

  it("conta e soma por kind, excluindo a ancora e itens sem id", () => {
    const sum = summarizeCrossReference(anchor, "00002776000140", related);
    expect(sum.totalRelated).toBe(3);
    const contracts = sum.groups.find((g) => g.kind === "public_contract");
    expect(contracts?.count).toBe(2);
    expect(contracts?.totalValueBRL).toBe(150000);
  });

  it("ordena sinais de atencao (sancao) ANTES dos demais", () => {
    const sum = summarizeCrossReference(anchor, "00002776000140", related);
    expect(sum.groups[0]?.kind).toBe("sanction");
    expect(sum.groups[0]?.attention).toBe(true);
  });

  it("deduplica relacionados pelo id", () => {
    const dup = [
      ent("c1", "public_contract", "Contrato 1", {}),
      ent("c1", "public_contract", "Contrato 1 (dup)", {}),
    ];
    const sum = summarizeCrossReference(anchor, "00002776000140", dup);
    expect(sum.totalRelated).toBe(1);
  });
});

describe("buildCrossReferenceBlock", () => {
  const anchor = ent("anchor-id", "company", "ACME LTDA", {});

  it("monta bloco citavel com contagens, valor e marca de atencao", () => {
    const sum = summarizeCrossReference(anchor, "00002776000140", [
      ent("c1", "public_contract", "Contrato 1", { valor: 100000, sourceUrl: "https://pncp.gov.br/c1" }),
      ent("s1", "sanction", "Multa", { valorMulta: "396.237,13", sourceUrl: "https://portaldatransparencia.gov.br/s1" }),
    ]);
    const block = buildCrossReferenceBlock(sum);
    expect(block).toContain("Cruzamento por CNPJ 00.002.776/0001-40");
    expect(block).toContain("1 sanção");
    expect(block).toContain("sinal de atenção");
    expect(block).toContain("1 contrato público");
    expect(block).toContain("fonte: https://pncp.gov.br/c1");
  });

  it("sem relacionados => bloco vazio (preserva 'evidencia insuficiente')", () => {
    const sum = summarizeCrossReference(anchor, "00002776000140", []);
    expect(buildCrossReferenceBlock(sum)).toBe("");
  });
});
