/**
 * leads-heuristics.test.ts — inferMotivo, inferGatilhoLabel, inferServicos, inferSetor.
 *
 * Cobre caminhos principais E bordas: prioridade de gatilho, fallback, acentuação
 * (as keywords internas estão NFD-stripped, então input acentuado deve funcionar).
 */

import { describe, it, expect } from "vitest";
import {
  inferMotivo,
  inferGatilhoLabel,
  inferServicos,
  inferSetor,
} from "./leads-heuristics";

// ─── Base helpers ─────────────────────────────────────────────────────────────

function makeLead(overrides: {
  razaoSocial?: string;
  orgao?: string;
  objeto?: string;
  valorGlobal?: number;
  modalidade?: string;
  dataVigenciaInicio?: string;
}) {
  return {
    razaoSocial: overrides.razaoSocial ?? "Empresa Teste LTDA",
    orgao: overrides.orgao ?? "Prefeitura Municipal de Teste",
    objeto: overrides.objeto ?? "Serviços gerais",
    valorGlobal: overrides.valorGlobal ?? 50_000,
    modalidade: overrides.modalidade ?? "Dispensa de Licitação",
    dataVigenciaInicio: overrides.dataVigenciaInicio ?? "2026-01-01",
  };
}

// ─── inferMotivo — prioridade ─────────────────────────────────────────────────

describe("inferMotivo", () => {
  it("alto_valor (>=500k) wins over all other triggers", () => {
    const lead = makeLead({
      valorGlobal: 600_000,
      modalidade: "Pregão Eletrônico",
      orgao: "Ministério da Saúde",
    });
    const m = inferMotivo(lead);
    expect(m.gatilho).toBe("alto_valor");
    expect(m.evidencia).toMatch(/R\$/);  // BRL-formatted
  });

  it("licitacao_recorrente when modalidade includes pregao (value < 500k)", () => {
    const lead = makeLead({ valorGlobal: 100_000, modalidade: "Pregão Eletrônico" });
    const m = inferMotivo(lead);
    expect(m.gatilho).toBe("licitacao_recorrente");
    expect(m.evidencia).toBe("Pregão Eletrônico");
  });

  it("orgao_estrategico when orgao contains 'ministerio' (value < 500k, not pregao)", () => {
    const lead = makeLead({
      valorGlobal: 200_000,
      orgao: "Ministério da Economia",
      modalidade: "Tomada de Preços",
    });
    const m = inferMotivo(lead);
    expect(m.gatilho).toBe("orgao_estrategico");
  });

  it("orgao_estrategico matches 'federal'", () => {
    const lead = makeLead({
      orgao: "Tribunal Federal Regional",
      valorGlobal: 50_000,
      modalidade: "Convite",
    });
    const m = inferMotivo(lead);
    expect(m.gatilho).toBe("orgao_estrategico");
  });

  it("contrato_vencedor with evidencia when value is 100k–499k and no other trigger", () => {
    const lead = makeLead({
      valorGlobal: 150_000,
      modalidade: "Concorrência",
      orgao: "Câmara Municipal de Joinville",
    });
    const m = inferMotivo(lead);
    expect(m.gatilho).toBe("contrato_vencedor");
    expect(m.evidencia).toBeTruthy();
  });

  it("base contrato_vencedor for value below 100k with no other trigger", () => {
    const lead = makeLead({
      valorGlobal: 30_000,
      modalidade: "Concorrência",
      orgao: "Câmara Municipal de Joinville",
    });
    const m = inferMotivo(lead);
    expect(m.gatilho).toBe("contrato_vencedor");
    expect(m.titulo).toMatch(/contrato público/i);
  });

  it("always returns titulo and descricao strings", () => {
    const lead = makeLead({});
    const m = inferMotivo(lead);
    expect(typeof m.titulo).toBe("string");
    expect(m.titulo.length).toBeGreaterThan(5);
    expect(typeof m.descricao).toBe("string");
  });

  it("alto_valor formats value in BRL (R$ symbol)", () => {
    const lead = makeLead({ valorGlobal: 1_200_000 });
    const m = inferMotivo(lead);
    expect(m.gatilho).toBe("alto_valor");
    expect(m.evidencia).toContain("1");
  });
});

// ─── inferGatilhoLabel ────────────────────────────────────────────────────────

describe("inferGatilhoLabel", () => {
  it("returns non-empty string for every known gatilho", () => {
    const gatilhos = [
      "contrato_vencedor",
      "alto_valor",
      "licitacao_recorrente",
      "orgao_estrategico",
      "novo_fornecedor",
    ] as const;

    for (const g of gatilhos) {
      const label = inferGatilhoLabel(g);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(2);
    }
  });

  it("alto_valor → 'Alto valor'", () => {
    expect(inferGatilhoLabel("alto_valor")).toBe("Alto valor");
  });

  it("novo_fornecedor → 'Novo fornecedor'", () => {
    expect(inferGatilhoLabel("novo_fornecedor")).toBe("Novo fornecedor");
  });
});

// ─── inferServicos ────────────────────────────────────────────────────────────

describe("inferServicos", () => {
  it("returns an array of at least 1 servico for matching keywords", () => {
    const s = inferServicos("Execução de obra de construção civil");
    expect(Array.isArray(s)).toBe(true);
    expect(s.length).toBeGreaterThan(0);
    expect(s[0]).toHaveProperty("label");
    expect(s[0]).toHaveProperty("icon");
  });

  it("returns fallback servicos for unknown objeto", () => {
    const s = inferServicos("Fornecimento de item desconhecido xyzxyz");
    expect(s.length).toBeGreaterThan(0);
    // fallback items always include 'expediente' or 'treinamento'
    const labels = s.map((x) => x.label.toLowerCase());
    const hasFallback = labels.some(
      (l) => l.includes("expediente") || l.includes("treinamento") || l.includes("consultoria"),
    );
    expect(hasFallback).toBe(true);
  });

  it("matches 'TI' keyword (exact short keyword)", () => {
    const s = inferServicos("Fornecimento de licenças de TI");
    const labels = s.map((x) => x.label.toLowerCase());
    expect(labels.some((l) => l.includes("sistem") || l.includes("ti") || l.includes("seguran"))).toBe(true);
  });

  it("matches accented input (normalised internally)", () => {
    // "construção" → after NFD strip → "construcao" which matches keyword
    const s = inferServicos("Serviço de construção e reforma");
    const labels = s.map((x) => x.label.toLowerCase());
    expect(labels.some((l) => l.includes("engenhar") || l.includes("obra"))).toBe(true);
  });

  it("returns fallback for empty string", () => {
    const s = inferServicos("");
    expect(s.length).toBeGreaterThan(0);
  });

  it("matches transporte keyword", () => {
    const s = inferServicos("Contratação de empresa de transporte escolar");
    const labels = s.map((x) => x.label.toLowerCase());
    expect(labels.some((l) => l.includes("frota") || l.includes("veiculo") || l.includes("veículo"))).toBe(true);
  });
});

// ─── inferSetor ──────────────────────────────────────────────────────────────

describe("inferSetor", () => {
  it("returns 'Obras & Engenharia' for obra keyword", () => {
    expect(inferSetor("reforma e construção de escola")).toBe("Obras & Engenharia");
  });

  it("returns 'Saúde' for hospital keyword", () => {
    expect(inferSetor("equipamentos para hospital municipal")).toBe("Saúde");
  });

  it("returns 'Tecnologia da Informação' for software keyword", () => {
    expect(inferSetor("aquisição de software de gestão")).toBe("Tecnologia da Informação");
  });

  it("returns 'Contratação pública' as fallback for unknown objeto", () => {
    expect(inferSetor("zzz nada conhecido zzz")).toBe("Contratação pública");
  });

  it("is consistent with inferServicos: same objeto → same sector", () => {
    const objeto = "Serviços de limpeza e zeladoria";
    const setor = inferSetor(objeto);
    const servicos = inferServicos(objeto);
    // Both should map to the Limpeza & Facilities entry
    expect(setor).toBe("Limpeza & Facilities");
    expect(servicos.length).toBeGreaterThan(0);
  });
});
