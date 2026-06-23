import { describe, expect, it } from "vitest";
import { parseExtrato, ptBrMoneyToCents } from "./receita-extrato";

// FIXTURE real do "Extrato do Leilão" (texto extraído do PDF). Cobre os casos
// difíceis: nome multi-linha (lote 7), CPF mascarado (lote 3), "Lote Não
// Arrematado" (5,6,9) e "Total Geral" (linha-somatório, deve ser ignorada).
const FIXTURE = `Lote      CNPJ/CPF              Arrematante                                Valor Arrematação
1         47.315.319/0001-70    CENTERTECH2 LTDA                                       41.000,00
2         50.845.512/0001-27    50.845.512 VALMIR FERREIRA DA SILVA                       11.511,00
3         ***.670.421-**        ELIZABETH ALVES VIEIRA SILVA                              57.100,00
4         29.969.683/0001-71    FUNDACAO PRIMEIRA POTENCIA                               211.000,00
5                               Lote Não Arrematado
6                               Lote Não Arrematado
7         43.703.387/0001-55    MCC IMPORTS COMERCIO DE ELETRONICOS, ACESSORIOS E IMPORTACAO   1.100,00
8         02.819.731/0001-99    MC VARIEDADES LTDA                                       101.600,00
9                               Lote Não Arrematado
10                              Total Geral                                              423.311,00`;

describe("ptBrMoneyToCents", () => {
  it("converte valores pt-BR em centavos", () => {
    expect(ptBrMoneyToCents("41.000,00")).toBe(4100000);
    expect(ptBrMoneyToCents("1.100,00")).toBe(110000);
    expect(ptBrMoneyToCents("423.311,00")).toBe(42331100);
    expect(ptBrMoneyToCents("57.100,00")).toBe(5710000);
    expect(ptBrMoneyToCents("11.511,00")).toBe(1151100);
  });

  it("rejeita o que não for moeda pt-BR (ex.: pedaço de CNPJ)", () => {
    expect(ptBrMoneyToCents("47.315.319")).toBeNull();
    expect(ptBrMoneyToCents("0001-70")).toBeNull();
    expect(ptBrMoneyToCents("")).toBeNull();
    expect(ptBrMoneyToCents("abc")).toBeNull();
  });
});

describe("parseExtrato (fixture oficial)", () => {
  const rows = parseExtrato(FIXTURE);
  const byLote = new Map(rows.map((r) => [r.lote, r]));

  it("não inclui cabeçalho nem 'Total Geral' como lote", () => {
    // 10 lotes (1..10); o lote 10 é 'Total Geral' → ignorado → 9 linhas.
    expect(rows.length).toBe(9);
    expect(byLote.has(10)).toBe(false);
    expect(rows.every((r) => r.lote >= 1 && r.lote <= 9)).toBe(true);
  });

  it("lote 1: CENTERTECH2 LTDA / 4100000", () => {
    const l = byLote.get(1)!;
    expect(l.arrematado).toBe(true);
    expect(l.doc).toBe("47.315.319/0001-70");
    expect(l.nome).toBe("CENTERTECH2 LTDA");
    expect(l.valorCents).toBe(4100000);
  });

  it("lote 2: nome que repete o CNPJ no início é mantido", () => {
    const l = byLote.get(2)!;
    expect(l.doc).toBe("50.845.512/0001-27");
    expect(l.nome).toBe("50.845.512 VALMIR FERREIRA DA SILVA");
    expect(l.valorCents).toBe(1151100);
  });

  it("lote 3: CPF mascarado preservado / 5710000", () => {
    const l = byLote.get(3)!;
    expect(l.arrematado).toBe(true);
    expect(l.doc).toBe("***.670.421-**");
    expect(l.nome).toBe("ELIZABETH ALVES VIEIRA SILVA");
    expect(l.valorCents).toBe(5710000);
  });

  it("lotes 5, 6 e 9: não arrematados (valor null, doc null)", () => {
    for (const n of [5, 6, 9]) {
      const l = byLote.get(n)!;
      expect(l.arrematado).toBe(false);
      expect(l.valorCents).toBeNull();
      expect(l.doc).toBeNull();
      expect(l.nome).toBeNull();
    }
  });

  it("lote 7: nome longo (que estaria quebrado) é juntado e valor = 110000", () => {
    const l = byLote.get(7)!;
    expect(l.doc).toBe("43.703.387/0001-55");
    expect(l.nome).toBe("MCC IMPORTS COMERCIO DE ELETRONICOS, ACESSORIOS E IMPORTACAO");
    expect(l.valorCents).toBe(110000);
  });

  it("lote 8: 101600 reais → 10160000 centavos", () => {
    const l = byLote.get(8)!;
    expect(l.doc).toBe("02.819.731/0001-99");
    expect(l.nome).toBe("MC VARIEDADES LTDA");
    expect(l.valorCents).toBe(10160000);
  });
});

describe("parseExtrato (robustez de layout)", () => {
  it("junta o nome do arrematante quebrado em várias linhas físicas", () => {
    const text = [
      "Lote CNPJ/CPF Arrematante Valor Arrematação",
      "7 43.703.387/0001-55 MCC IMPORTS COMERCIO DE ELETRONICOS,",
      "ACESSORIOS E IMPORTACAO 1.100,00",
      "8 02.819.731/0001-99 MC VARIEDADES LTDA 101.600,00",
    ].join("\n");
    const rows = parseExtrato(text);
    const l7 = rows.find((r) => r.lote === 7)!;
    expect(l7.nome).toBe("MCC IMPORTS COMERCIO DE ELETRONICOS, ACESSORIOS E IMPORTACAO");
    expect(l7.valorCents).toBe(110000);
    expect(rows.find((r) => r.lote === 8)!.valorCents).toBe(10160000);
  });

  it("lida com tudo colapsado numa única linha (unpdf mergePages)", () => {
    // unpdf às vezes funde a tabela inteira numa só linha, separada por espaços.
    const text =
      "Lote CNPJ/CPF Arrematante Valor Arrematação 1 47.315.319/0001-70 CENTERTECH2 LTDA 41.000,00";
    const rows = parseExtrato(text);
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({
      lote: 1,
      doc: "47.315.319/0001-70",
      nome: "CENTERTECH2 LTDA",
      valorCents: 4100000,
      arrematado: true,
    });
  });

  it("não confunde dígitos do CNPJ com o valor de arremate", () => {
    const text = "Lote CNPJ/CPF Arrematante Valor\n1 47.315.319/0001-70 CENTERTECH2 LTDA 41.000,00";
    const l = parseExtrato(text)[0]!;
    expect(l.valorCents).toBe(4100000); // não 47315319xx
  });

  it("texto vazio → []", () => {
    expect(parseExtrato("")).toEqual([]);
  });
});
