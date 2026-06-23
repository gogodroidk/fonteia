// Parser do "Extrato do Leilão" da Receita Federal (SLE). Módulo PURO.
//
// LINHA A LINHA (robusto): só processa linhas que começam com o número do lote.
// O preâmbulo do documento (MINISTÉRIO…, Data:, Edital Nº…, UA: 0517800…,
// Processo…) e os cabeçalhos de página NÃO começam com um número de lote, então
// são naturalmente ignorados — sem poluir a associação lote↔valor. O texto chega
// já reconstruído por POSIÇÃO (uma linha visual por linha), então o valor de cada
// lote está na mesma linha do seu número.
//
// Tabela: Lote | CNPJ/CPF | Arrematante | Valor Arrematação.
// CPF de pessoa física já vem MASCARADO da Receita; CNPJ é público.

export interface ExtratoLote {
  lote: number;
  doc: string | null;
  nome: string | null;
  valorCents: number | null;
  arrematado: boolean;
}

const MONEY_ANCHORED = /^\d{1,3}(?:\.\d{3})*,\d{2}$/;
const MONEY_GLOBAL = /\d{1,3}(?:\.\d{3})*,\d{2}/g;

export function ptBrMoneyToCents(raw: string): number | null {
  const s = raw.trim();
  if (!MONEY_ANCHORED.test(s)) return null;
  const cents = Number(s.replace(/\./g, "").replace(",", ""));
  return Number.isInteger(cents) && cents >= 0 ? cents : null;
}

const CNPJ_RE = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;
const CPF_MASKED_RE = /[\d*]{3}\.[\d*]{3}\.[\d*]{3}-[\d*]{2}/;
const DOC_RE = new RegExp(`${CNPJ_RE.source}|${CPF_MASKED_RE.source}`);

function findDoc(s: string): { doc: string; end: number } | null {
  const m = s.match(DOC_RE);
  if (!m || m.index == null) return null;
  return { doc: m[0], end: m.index + m[0].length };
}

const NAO_ARREMATADO_RE = /n[aã]o\s+arrematad\w*/i;
const TOTAL_GERAL_RE = /total\s+geral/i;
const LOTE_LINE_RE = /^(\d{1,5})\s+(.+)$/;

// "Total Geral .... 423.311,00" — somatório oficial, usado para VALIDAR o parsing
// (a soma dos arremates deve bater com isto; senão o edital é pulado).
const TOTAL_GERAL_VALUE_RE = /total\s+geral\D*(\d{1,3}(?:\.\d{3})*,\d{2})/i;
export function parseTotalGeral(text: string): number | null {
  if (!text) return null;
  const m = text.replace(/\s+/g, " ").match(TOTAL_GERAL_VALUE_RE);
  return m && m[1] ? ptBrMoneyToCents(m[1]) : null;
}

export function parseExtrato(text: string): ExtratoLote[] {
  if (!text) return [];
  const out: ExtratoLote[] = [];

  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/\s+/g, " ").trim();
    if (!line || TOTAL_GERAL_RE.test(line)) continue;

    const m = line.match(LOTE_LINE_RE);
    if (!m || m[1] === undefined || m[2] === undefined) continue; // não é linha de lote
    const lote = Number(m[1]);
    const rest = m[2];

    if (NAO_ARREMATADO_RE.test(rest)) {
      out.push({ lote, doc: null, nome: null, valorCents: null, arrematado: false });
      continue;
    }

    const monies = rest.match(MONEY_GLOBAL);
    if (!monies || monies.length === 0) continue; // linha de lote sem valor → ignora
    const valorCents = ptBrMoneyToCents(monies[monies.length - 1] ?? "");

    const doc = findDoc(rest);
    let nome = doc ? rest.slice(doc.end) : rest;
    nome = nome.replace(MONEY_GLOBAL, "").replace(/\s+/g, " ").trim();

    out.push({
      lote,
      doc: doc ? doc.doc : null,
      nome: nome || null,
      valorCents,
      arrematado: valorCents != null && valorCents > 0,
    });
  }

  return out;
}
