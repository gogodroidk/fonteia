// Parser do "Extrato do Leilão" da Receita Federal (SLE).
//
// O extrato é um PDF público (endpoint api/edital/{u}/{n}/{e}/extrato-leilao do
// SLE) que lista o RESULTADO de cada lote: número do lote, CNPJ/CPF do
// arrematante (CPF de pessoa física vem MASCARADO pela própria Receita), nome do
// arrematante e o valor de arrematação em Reais. É a única fonte do preço FINAL
// (arremate) — a base histórica só tem lance mínimo + avaliação.
//
// Tabela esperada (texto extraído):
//   Lote | CNPJ/CPF | Arrematante | Valor Arrematação
//
// Este módulo é PURO (sem rede, sem Deno/Node API): recebe o texto já extraído do
// PDF e devolve uma linha por lote. É a fonte-da-verdade da lógica de parsing — a
// Edge Function `ingest-receita-atas` carrega uma cópia idêntica em
// supabase/functions/ingest-receita-atas/parse-extrato.ts (Edge Functions não
// importam de packages/). Mantenha as duas sincronizadas; o teste vive aqui.

/** Uma linha do extrato (um lote do edital). */
export interface ExtratoLote {
  /** Número do lote (nrAtribuido), como inteiro. */
  lote: number;
  /** CNPJ (14 díg.) ou CPF MASCARADO ("***.670.421-**"), exatamente como no PDF. */
  doc: string | null;
  /** Nome do arrematante (pode ter sido quebrado em várias linhas; aqui já unido). */
  nome: string | null;
  /** Valor de arremate em centavos. null quando o lote não foi arrematado. */
  valorCents: number | null;
  /** true se houve arremate (doc/nome/valor presentes); false p/ "Lote Não Arrematado". */
  arrematado: boolean;
}

// "41.000,00" / "1.100,00" / "423.311,00" → centavos (inteiro). Aceita só o
// formato pt-BR (milhar com ponto, decimal com vírgula e exatamente 2 casas).
// Retorna null se não casar (evita confundir "47.315.319" de um CNPJ com valor).
const MONEY_RE = /^\d{1,3}(?:\.\d{3})*,\d{2}$/;
export function ptBrMoneyToCents(raw: string): number | null {
  const s = raw.trim();
  if (!MONEY_RE.test(s)) return null;
  const cents = Number(s.replace(/\./g, "").replace(",", ""));
  return Number.isInteger(cents) && cents >= 0 ? cents : null;
}

// CNPJ completo (00.000.000/0000-00) ou CPF mascarado pela Receita
// (***.670.421-** e variações com asteriscos). Também aceita CNPJ/CPF sem máscara
// (só dígitos com a pontuação) por robustez, sem alterar o que será persistido.
const CNPJ_RE = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;
const CPF_MASKED_RE = /[\d*]{3}\.[\d*]{3}\.[\d*]{3}-[\d*]{2}/;
const DOC_RE = new RegExp(`${CNPJ_RE.source}|${CPF_MASKED_RE.source}`);

// Captura, em qualquer ponto da string, um documento (CNPJ ou CPF mascarado).
function findDoc(s: string): { doc: string; start: number; end: number } | null {
  const m = s.match(DOC_RE);
  if (!m || m.index == null) return null;
  return { doc: m[0], start: m.index, end: m.index + m[0].length };
}

const NAO_ARREMATADO_RE = /lote\s+n[aã]o\s+arrematad\w*/i;
const TOTAL_GERAL_RE = /total\s+geral/i;
// Frase de cabeçalho da tabela — removida do texto antes de segmentar os lotes,
// pois quando o PDF é extraído com mergePages ela pode ficar colada na 1ª linha
// de dados ("...Valor Arrematação 1 47.315.319/0001-70 ...").
const HEADER_RE = /lote\s+cnpj\/?cpf\s+arrematante\s+valor\s+arremata\w*/gi;

/** Normaliza espaços internos e apara as pontas. */
function squish(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// Um "terminador" de registro de lote: o texto sempre encerra um lote em uma
// destas marcas. Segmentar por elas torna o parser independente de quebras de
// linha (unpdf às vezes funde tudo; às vezes quebra o nome em várias linhas).
//   1) "Lote Não Arrematado";
//   2) valor de arremate (moeda pt-BR) — também encerra a linha "Total Geral".
const TERMINATOR_RE = new RegExp(`${NAO_ARREMATADO_RE.source}|\\d{1,3}(?:\\.\\d{3})*,\\d{2}`, "gi");

// Primeiro inteiro "isolado" (número do lote) a partir de `from`. Isolado = não
// seguido por ".", "/" ou "-" (que indicariam CNPJ/CPF/valor) nem por outro
// dígito (que indicaria um número maior).
const LOTE_NUM_RE = /(\d{1,5})(?![\d./-])/g;
function nextLoteNumber(s: string, from: number): { lote: number; numEnd: number } | null {
  LOTE_NUM_RE.lastIndex = from;
  const m = LOTE_NUM_RE.exec(s);
  if (!m || m.index == null || m[1] === undefined) return null;
  return { lote: Number(m[1]), numEnd: m.index + m[1].length };
}

/**
 * Parseia o texto do Extrato do Leilão em uma linha por lote.
 *
 * É independente de quebras de linha: segmenta o texto inteiro por TERMINADORES
 * de registro (valor pt-BR | "Lote Não Arrematado"). Para cada segmento, o
 * número do lote é o primeiro inteiro isolado e o nome é o texto entre o
 * documento e o terminador. Funciona tanto quando o PDF mantém colunas por linha
 * quanto quando `unpdf` funde tudo numa linha só.
 *
 * Regras:
 *  - "Lote Não Arrematado" → arrematado=false, valorCents=null, doc/nome=null.
 *  - "Total Geral" → ignorado (é o somatório do edital).
 *  - Cabeçalho e ruído sem número de lote → ignorados.
 *  - doc preservado exatamente como veio (CPF já mascarado pela Receita).
 */
export function parseExtrato(text: string): ExtratoLote[] {
  if (!text) return [];

  // Normaliza: NBSP → espaço, quebras → espaço, colapsa espaços. A segmentação é
  // feita por conteúdo (terminadores), então a estrutura de linhas é irrelevante.
  // O NBSP literal no primeiro regex é intencional (é justamente o que normalizamos).
  // eslint-disable-next-line no-irregular-whitespace
  const flat = text.replace(/ /g, " ").replace(/\s+/g, " ");
  // Remove a(s) frase(s) de cabeçalho, onde quer que estejam.
  const stream = flat.replace(HEADER_RE, " ");

  const out: ExtratoLote[] = [];
  let cursor = 0;

  TERMINATOR_RE.lastIndex = 0;
  let term: RegExpExecArray | null;
  while ((term = TERMINATOR_RE.exec(stream)) !== null) {
    const termText = term[0];
    const termEnd = TERMINATOR_RE.lastIndex;

    // Segmento = do fim do registro anterior até o fim deste terminador. Todas as
    // posições abaixo são RELATIVAS ao `segment` (não ao `stream`).
    const segment = stream.slice(cursor, termEnd);
    cursor = termEnd;
    const termStartInSegment = segment.length - termText.length;

    // Número do lote: primeiro inteiro isolado do segmento.
    const head = nextLoteNumber(segment, 0);
    if (!head) continue; // ruído sem número de lote — ignora.

    // "Total Geral <valor>" → é a linha-somatório do edital; descarta.
    if (TOTAL_GERAL_RE.test(segment)) continue;

    // Lote não arrematado.
    if (NAO_ARREMATADO_RE.test(termText)) {
      out.push({ lote: head.lote, doc: null, nome: null, valorCents: null, arrematado: false });
      continue;
    }

    // Lote arrematado: o terminador é o valor de arremate.
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
