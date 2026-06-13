// receita-localidades.ts
// Normaliza a "cidade" dos editais da Receita para um rótulo limpo.
//
// Alguns editais trazem em `cidade` o nome da SUPERINTENDÊNCIA REGIONAL
// (ex.: "SUPERINTENDÊNCIA REGIONAL DA RECEITA FEDERAL DO BRASIL DA 2ª REGIÃO FISCAL")
// em vez de uma cidade de verdade. Aqui mapeamos cada Região Fiscal para a
// cidade-sede da Superintendência — anotado e fixo, conforme a estrutura oficial
// da Receita Federal (10 Regiões Fiscais).

/** Cidade-sede de cada Superintendência Regional da Receita Federal (1ª a 10ª RF). */
const REGIAO_FISCAL_SEDE: Readonly<Record<number, string>> = {
  1: "Brasília/DF",
  2: "Belém/PA",
  3: "Fortaleza/CE",
  4: "Recife/PE",
  5: "Salvador/BA",
  6: "Belo Horizonte/MG",
  7: "Rio de Janeiro/RJ",
  8: "São Paulo/SP",
  9: "Curitiba/PR",
  10: "Porto Alegre/RS",
};

const SMALL_WORDS = new Set(["de", "da", "do", "das", "dos", "e"]);

/** Title Case para nomes de cidade em CAIXA ALTA, preservando acentos e palavras pequenas. */
function titleCaseCity(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      if (word.length === 0) return word;
      if (i > 0 && SMALL_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/**
 * Rótulo amigável para a "cidade" de um lote. Converte o texto de Superintendência
 * Regional em "Cidade/UF" (sede da Região Fiscal) e dá Title Case a nomes em CAIXA ALTA.
 * Nunca inventa: se não reconhece o padrão, devolve o texto original.
 */
export function displayCity(rawCity: string | undefined | null): string {
  const raw = (rawCity ?? "").trim();
  if (raw === "") return "Local não informado";

  const rf = raw.match(/(\d{1,2})\s*ª?\s*regi[ãa]o\s*fiscal/i);
  if (rf?.[1]) {
    const sede = REGIAO_FISCAL_SEDE[Number(rf[1])];
    if (sede) return sede;
  }

  // Caixa alta (ex.: "FORTALEZA", "FOZ DO IGUAÇU") -> Title Case.
  if (raw === raw.toUpperCase()) return titleCaseCity(raw);
  return raw;
}

/** true quando a "cidade" é, na verdade, uma Superintendência Regional (sem cidade real). */
export function isSuperintendencia(rawCity: string | undefined | null): boolean {
  return /superintend|regi[ãa]o\s*fiscal/i.test(rawCity ?? "");
}

/** Remove acentos e baixa a caixa — base para busca tolerante a acento. */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
