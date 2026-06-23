// Parser do "Extrato do Leilão" da Receita Federal (SLE).
//
// CÓPIA SINCRONIZADA de packages/sources/src/connectors/receita-extrato.ts —
// Edge Functions (Deno) não importam de packages/. O TESTE canônico vive lá
// (receita-extrato.test.ts, 13 casos). Mantenha as duas idênticas.
//
// O extrato é um PDF público (api/edital/{u}/{n}/{e}/extrato-leilao) com o
// RESULTADO de cada lote: número, CNPJ/CPF do arrematante (CPF mascarado pela
// Receita), nome e valor de arremate em Reais. É a única fonte do preço FINAL.
//
// Tabela esperada (texto extraído):  Lote | CNPJ/CPF | Arrematante | Valor Arrematação
// Módulo PURO (sem rede, sem Deno/Node API): recebe texto e devolve uma linha por lote.

export interface ExtratoLote {
  lote: number;
  doc: string | null;
  nome: string | null;
  valorCents: number | null;
  arrematado: boolean;
}

const MONEY_RE = /^\d{1,3}(?:\.\d{3})*,\d{2}$/;
export function ptBrMoneyToCents(raw: string): number | null {
  const s = raw.trim();
  if (!MONEY_RE.test(s)) return null;
  const cents = Number(s.replace(/\./g, "").replace(",", ""));
  return Number.isInteger(cents) && cents >= 0 ? cents : null;
}

const CNPJ_RE = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;
const CPF_MASKED_RE = /[\d*]{3}\.[\d*]{3}\.[\d*]{3}-[\d*]{2}/;
const DOC_RE = new RegExp(`${CNPJ_RE.source}|${CPF_MASKED_RE.source}`);

function findDoc(s: string): { doc: string; start: number; end: number } | null {
  const m = s.match(DOC_RE);
  if (!m || m.index == null) return null;
  return { doc: m[0], start: m.index, end: m.index + m[0].length };
}

const NAO_ARREMATADO_RE = /lote\s+n[aã]o\s+arrematad\w*/i;
const TOTAL_GERAL_RE = /total\s+geral/i;
const HEADER_RE = /lote\s+cnpj\/?cpf\s+arrematante\s+valor\s+arremata\w*/gi;

function squish(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

const TERMINATOR_RE = new RegExp(`${NAO_ARREMATADO_RE.source}|\\d{1,3}(?:\\.\\d{3})*,\\d{2}`, "gi");

const LOTE_NUM_RE = /(\d{1,5})(?![\d./-])/g;
function nextLoteNumber(s: string, from: number): { lote: number; numEnd: number } | null {
  LOTE_NUM_RE.lastIndex = from;
  const m = LOTE_NUM_RE.exec(s);
  if (!m || m.index == null) return null;
  return { lote: Number(m[1]), numEnd: m.index + m[1].length };
}

export function parseExtrato(text: string): ExtratoLote[] {
  if (!text) return [];

  const flat = text.replace(/ /g, " ").replace(/\s+/g, " ");
  const stream = flat.replace(HEADER_RE, " ");

  const out: ExtratoLote[] = [];
  let cursor = 0;

  TERMINATOR_RE.lastIndex = 0;
  let term: RegExpExecArray | null;
  while ((term = TERMINATOR_RE.exec(stream)) !== null) {
    const termText = term[0];
    const termEnd = TERMINATOR_RE.lastIndex;

    const segment = stream.slice(cursor, termEnd);
    cursor = termEnd;
    const termStartInSegment = segment.length - termText.length;

    const head = nextLoteNumber(segment, 0);
    if (!head) continue;

    if (TOTAL_GERAL_RE.test(segment)) continue;

    if (NAO_ARREMATADO_RE.test(termText)) {
      out.push({ lote: head.lote, doc: null, nome: null, valorCents: null, arrematado: false });
      continue;
    }

    const valorCents = ptBrMoneyToCents(termText);
    const between = segment.slice(head.numEnd, termStartInSegment);
    const doc = findDoc(between);
    const nome = doc ? squish(between.slice(doc.end)) || null : squish(between) || null;

    out.push({
      lote: head.lote,
      doc: doc ? doc.doc : null,
      nome,
      valorCents,
      arrematado: valorCents != null && valorCents > 0,
    });
  }

  return out;
}
