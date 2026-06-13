/**
 * fipe-api.ts — Referência de preço FIPE para lotes de veículos da Receita.
 *
 * API: parallelum/fipe v2 (https://fipe.parallelum.com.br/api/v2) — gratuita,
 * sem auth (limite ~500 req/dia). A FIPE NÃO tem busca por texto livre: exige
 * navegação marca → modelo → ano. Os lotes da Receita só trazem texto descritivo,
 * então o match é heurístico — quando não dá pra casar com confiança, retornamos
 * `encontrado: false`. NUNCA chutamos preço.
 *
 * O valor FIPE é referência de mercado, não o valor do bem leiloado (que pode
 * estar avariado/sem documento). Use como orientação, confirme no edital.
 */

const FIPE_BASE_URL = "https://fipe.parallelum.com.br/api/v2";
const FETCH_TIMEOUT_MS = 8_000;

interface FipeBrand {
  code: string;
  name: string;
}
interface FipeModel {
  code: string;
  name: string;
}
interface FipeYear {
  code: string;
  name: string;
}
interface FipePrice {
  brand: string;
  model: string;
  modelYear: string;
  fuel: string;
  price: string;
  referenceMonth: string;
  codeFipe: string;
  vehicleType: number;
}

export type FipeVehicleType = "cars" | "motorcycles" | "trucks";

export interface FipePrecoNaoEncontrado {
  encontrado: false;
  fipeCents?: undefined;
  modelo?: undefined;
  fonte?: undefined;
}
export interface FipePrecoEncontrado {
  encontrado: true;
  fipeCents: number;
  modelo: string;
  fonte: string;
}
export type FipePrecoResponse = FipePrecoNaoEncontrado | FipePrecoEncontrado;

const NAO_ENCONTRADO: FipePrecoResponse = { encontrado: false };

/** true quando a categoria indica veículo (carro/moto/caminhão/utilitário). */
export function isVeiculo(category: string | undefined): boolean {
  if (!category) return false;
  const n = category.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
  return [
    "AUTOMOVEL",
    "VEICULO",
    "MOTOCICLETA",
    "MOTO",
    "CAMINHAO",
    "ONIBUS",
    "MICRO",
    "PICKUP",
    "UTILITARIO",
    "TRATOR",
    "REBOQUE",
  ].some((p) => n.includes(p));
}

function inferirTipoVeiculo(category: string | undefined): FipeVehicleType {
  if (!category) return "cars";
  const n = category.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
  if (n.includes("MOTO")) return "motorcycles";
  if (n.includes("CAMINHAO") || n.includes("ONIBUS") || n.includes("TRATOR") || n.includes("REBOQUE")) {
    return "trucks";
  }
  return "cars";
}

function parseFipePrice(priceStr: string): number | null {
  const cleaned = priceStr.replace(/R\$\s*/g, "").replace(/\./g, "").replace(",", ".").trim();
  const value = parseFloat(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100);
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function normalizeStr(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function casarMarca(termoBusca: string, brands: FipeBrand[]): FipeBrand | null {
  const texto = normalizeStr(termoBusca);
  let melhor: FipeBrand | null = null;
  let melhorLen = 0;
  for (const brand of brands) {
    const b = normalizeStr(brand.name);
    if (b.length > 0 && texto.includes(b) && b.length > melhorLen) {
      melhor = brand;
      melhorLen = b.length;
    }
  }
  return melhor;
}

function casarModelo(termoBusca: string, models: FipeModel[]): FipeModel | null {
  const tokens = new Set(normalizeStr(termoBusca).split(" "));
  let melhor: FipeModel | null = null;
  let melhorScore = 0;
  for (const model of models) {
    let score = 0;
    for (const token of normalizeStr(model.name).split(" ")) {
      if (token.length >= 2 && tokens.has(token)) score++;
    }
    if (score > melhorScore) {
      melhor = model;
      melhorScore = score;
    }
  }
  return melhorScore < 2 ? null : melhor;
}

function extrairAno(termoBusca: string): number | null {
  const matches = termoBusca.match(/\b(199\d|20[0-2]\d)\b/g);
  if (!matches || matches.length === 0) return null;
  const last = matches[matches.length - 1];
  return last ? parseInt(last, 10) : null;
}

/**
 * Tenta achar o preço FIPE a partir de um texto livre (descrição do lote).
 * Grácil: devolve `encontrado: false` em qualquer falha ou match fraco.
 */
export async function fetchFipePreco(
  termoBusca: string,
  category?: string | undefined,
): Promise<FipePrecoResponse> {
  if (!termoBusca || termoBusca.trim().length < 4) return NAO_ENCONTRADO;

  const vehicleType = inferirTipoVeiculo(category);

  const brands = await fetchJson<FipeBrand[]>(`${FIPE_BASE_URL}/${vehicleType}/brands`);
  if (!Array.isArray(brands) || brands.length === 0) return NAO_ENCONTRADO;

  const marca = casarMarca(termoBusca, brands);
  if (!marca) return NAO_ENCONTRADO;

  const models = await fetchJson<FipeModel[]>(
    `${FIPE_BASE_URL}/${vehicleType}/brands/${encodeURIComponent(marca.code)}/models`,
  );
  if (!Array.isArray(models) || models.length === 0) return NAO_ENCONTRADO;

  const modelo = casarModelo(termoBusca, models);
  if (!modelo) return NAO_ENCONTRADO;

  const years = await fetchJson<FipeYear[]>(
    `${FIPE_BASE_URL}/${vehicleType}/brands/${encodeURIComponent(marca.code)}/models/${encodeURIComponent(modelo.code)}/years`,
  );
  if (!Array.isArray(years) || years.length === 0) return NAO_ENCONTRADO;

  const ano = extrairAno(termoBusca);
  let anoSel: FipeYear | undefined;
  if (ano !== null) anoSel = years.find((y) => y.code.startsWith(String(ano)));
  if (!anoSel) anoSel = years[0];
  if (!anoSel) return NAO_ENCONTRADO;

  const fonte =
    `${FIPE_BASE_URL}/${vehicleType}/brands/${encodeURIComponent(marca.code)}/models/${encodeURIComponent(modelo.code)}/years/${encodeURIComponent(anoSel.code)}`;

  const priceData = await fetchJson<FipePrice>(fonte);
  if (!priceData || typeof priceData.price !== "string") return NAO_ENCONTRADO;

  const fipeCents = parseFipePrice(priceData.price);
  if (fipeCents === null || fipeCents <= 0) return NAO_ENCONTRADO;

  return {
    encontrado: true,
    fipeCents,
    modelo: `${priceData.brand} ${priceData.model} ${priceData.modelYear}`.trim(),
    fonte,
  };
}
