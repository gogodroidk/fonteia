// Backfill de HISTÓRICO COMPLETO de licitações do PNCP via dump bulk (CSV anual).
//
// POR QUÊ: a API de consulta (`/v1/contratacoes/publicacao`, usada por
// `ingest-pncp`) tem rate limit agressivo — confirmado ao vivo em 2026-07-07,
// UFs de alto volume (SP, MG, RS, PR) travam com 429 persistente por volta da
// 7ª página mesmo com retry/backoff (ver supabase/functions/ingest-pncp). Para
// um backfill histórico completo (2021-2026), a fonte certa é o dump bulk que
// a SEGES/ComprasGov publica no Repositório de Dados Abertos.
//
// FONTE VERIFICADA AO VIVO (2026-07-07):
//   https://repositorio.dados.gov.br/seges/comprasgov/anual/{ANO}/comprasGOV-anual-VW_FT_PNCP_COMPRA-{ANO}.csv
// Existem pastas 2021..2026 (a mais recente cobre o ano corrente até a última
// carga). Também existe um "-latest.csv" na raiz de anual/, mas ele parece ser
// cumulativo/instável (tamanho não bate com a soma dos anos) — preferimos os
// arquivos POR ANO, que são estáveis e Last-Modified fixo por ano fechado.
//
// Existe também VW_FT_PNCP_COMPRA_ITEM-{ANO}.csv (itens de cada compra, ~2-10x
// maior) e VW_DM_PNCP_ITEM_RESULTADO-{ANO}.csv (resultado/homologação por
// item). NÃO usamos nenhum dos dois aqui: nosso `PncpLicitacao` normalizado é
// por CONTRATAÇÃO (não por item), e VW_FT_PNCP_COMPRA já traz todos os campos
// que precisamos (valor estimado/homologado agregado, datas, órgão, UF,
// modalidade, situação, amparo legal). Um dump de itens seria a fonte certa
// SE algum dia modelarmos "item de licitação" como entidade própria.
//
// SCHEMA: as colunas mudam de nome entre safras. 2021-2024 usam nomes "curtos"
// (ex.: `data_atualizacao`, `ano_compra`, `amparo_legal_codigo`); 2025-2026
// usam o mesmo campo com sufixo `_pncp` (ex.: `data_atualizacao_pncp`,
// `ano_compra_pncp`). O parser abaixo aceita as duas variantes por coluna
// (ver COLUMN_ALIASES) e resolve pelo header real do arquivo — nunca por
// posição fixa.
//
// STREAMING: o arquivo de 2025 tem ~340MB e ~1.9M linhas; nunca carregamos o
// arquivo inteiro em memória. Usamos o body da resposta fetch como stream e
// `csv-parse` no modo streaming (Transform), que também lida corretamente com
// campos entre aspas contendo vírgula/quebra de linha (confirmado ao vivo:
// ~18% das "linhas" ingênuas do dump 2025 têm quebra de linha embutida em
// `objeto_compra`/`informacao_complementar`).
//
// GRAVAÇÃO: mesma RPC `public.ingest_pncp` usada pela ingestão incremental via
// API — o upsert já é idempotente por `numeroControlePNCP`, então rodar o
// mesmo ano duas vezes (ou sobrepor com a API incremental) não duplica nada.
// Lotes de 200 itens por chamada de RPC (mesmo tamanho de `RPC_BATCH` em
// supabase/functions/ingest-pncp/index.ts).
//
// CLI:
//   tsx services/ingest/src/jobs/ingest-pncp-bulk.ts --ano=2025
//   tsx services/ingest/src/jobs/ingest-pncp-bulk.ts --ano=2025 --limit=5000 --dry-run
//   tsx services/ingest/src/jobs/ingest-pncp-bulk.ts --arquivo=https://.../outro.csv --ano=2025
//
// Parâmetros:
//   --ano=YYYY        ano do dump (obrigatório, salvo se --arquivo apontar p/ URL completa)
//   --arquivo=<url>   sobrepõe a URL default (útil p/ testar um espelho ou arquivo local file://)
//   --limit=N         processa só as N primeiras linhas de dado (teste rápido)
//   --dry-run         faz parse + normalização mas NÃO grava no banco (não exige DATABASE_URL)
//   --batch=N         tamanho do lote de upsert via RPC (default 200, teto 500)
//   --log-every=N     log de progresso a cada N linhas (default 10000)

import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import {
  parsePncpDate,
  reaisToCents,
  modalidadeNome,
  contratacaoPortalUrl,
  type PncpLicitacao,
  type PncpContratacaoRaw,
  type PncpOrgaoEntidadeRaw,
  type PncpUnidadeOrgaoRaw,
  type PncpAmparoLegalRaw,
} from "@fonteia/sources";
import { parse as parseCsv } from "csv-parse";

// ---------------------------------------------------------------------------
// Config / CLI
// ---------------------------------------------------------------------------

export const COMPRASGOV_ANUAL_BASE =
  "https://repositorio.dados.gov.br/seges/comprasgov/anual";

export function bulkCompraCsvUrl(ano: number): string {
  return `${COMPRASGOV_ANUAL_BASE}/${ano}/comprasGOV-anual-VW_FT_PNCP_COMPRA-${ano}.csv`;
}

export const PNCP_BULK_SOURCE_ID = "pncp-contratacoes";
const DEFAULT_RPC_BATCH = 200;
const MAX_RPC_BATCH = 500;
const DEFAULT_LOG_EVERY = 10_000;

export interface CliOptions {
  ano?: number;
  arquivo?: string;
  limit?: number;
  dryRun: boolean;
  batch: number;
  logEvery: number;
}

export function parseCliArgs(argv: readonly string[]): CliOptions {
  const opts: CliOptions = { dryRun: false, batch: DEFAULT_RPC_BATCH, logEvery: DEFAULT_LOG_EVERY };
  for (const arg of argv) {
    if (arg === "--dry-run") {
      opts.dryRun = true;
      continue;
    }
    const eq = arg.indexOf("=");
    if (!arg.startsWith("--") || eq === -1) continue;
    const key = arg.slice(2, eq);
    const value = arg.slice(eq + 1);
    switch (key) {
      case "ano": {
        const n = Number(value);
        if (Number.isInteger(n)) opts.ano = n;
        break;
      }
      case "arquivo":
        opts.arquivo = value;
        break;
      case "limit": {
        const n = Number(value);
        if (Number.isInteger(n) && n > 0) opts.limit = n;
        break;
      }
      case "batch": {
        const n = Number(value);
        if (Number.isInteger(n) && n > 0) opts.batch = Math.min(n, MAX_RPC_BATCH);
        break;
      }
      case "log-every": {
        const n = Number(value);
        if (Number.isInteger(n) && n > 0) opts.logEvery = n;
        break;
      }
      default:
        break;
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Mapeamento de colunas — aceita as duas safras de nomes (com/sem sufixo _pncp).
// A chave é o nome CANÔNICO que usamos internamente; o valor é a lista de
// aliases aceitos no header real do CSV, em ordem de preferência.
// ---------------------------------------------------------------------------

const COLUMN_ALIASES: Record<string, readonly string[]> = {
  numero_controle_pncp: ["numero_controle_PNCP", "numero_controle_pncp"],
  numero_compra: ["numero_compra"],
  ano_compra: ["ano_compra_pncp", "ano_compra"],
  processo: ["processo"],
  objeto_compra: ["objeto_compra"],
  informacao_complementar: ["informacao_complementar"],
  modalidade_id: ["modalidade_id_pncp", "modalidade_id", "codigo_modalidade"],
  modalidade_nome: ["modalidade_nome"],
  modo_disputa_nome: ["modo_disputa_nome_pncp", "modo_disputa_nome"],
  situacao_compra_id: ["situacao_compra_id_pncp", "situacao_compra_id"],
  situacao_compra_nome: ["situacao_compra_nome_pncp", "situacao_compra_nome"],
  tipo_instrumento_codigo: [
    "tipo_instrumento_convocatorio_codigo_pncp",
    "tipo_instrumento_convocatorio_codigo",
  ],
  tipo_instrumento_nome: ["tipo_instrumento_convocatorio_nome"],
  valor_total_estimado: ["valor_total_estimado"],
  valor_total_homologado: ["valor_total_homologado"],
  srp: ["srp"],
  data_publicacao_pncp: ["data_publicacao_pncp"],
  data_inclusao: ["data_inclusao_pncp", "data_inclusao"],
  data_atualizacao: ["data_atualizacao_pncp", "data_atualizacao"],
  data_abertura_proposta: ["data_abertura_proposta_pncp", "data_abertura_proposta"],
  data_encerramento_proposta: ["data_encerramento_proposta_pncp", "data_encerramento_proposta"],
  orgao_entidade_cnpj: ["orgao_entidade_cnpj"],
  orgao_entidade_razao_social: ["orgao_entidade_razao_social"],
  orgao_entidade_esfera_id: ["orgao_entidade_esfera_id"],
  orgao_entidade_poder_id: ["orgao_entidade_poder_id"],
  unidade_orgao_nome_unidade: ["unidade_orgao_nome_unidade"],
  unidade_orgao_uf_sigla: ["unidade_orgao_uf_sigla"],
  unidade_orgao_uf_nome: ["unidade_orgao_uf_nome"],
  unidade_orgao_municipio_nome: ["unidade_orgao_municipio_nome"],
  unidade_orgao_codigo_ibge: ["unidade_orgao_codigo_ibge"],
  amparo_legal_codigo: ["amparo_legal_codigo_pncp", "amparo_legal_codigo"],
  amparo_legal_nome: ["amparo_legal_nome"],
  link_sistema_origem: ["link_sistema_origem"],
  contratacao_excluida: ["contratacao_excluida"],
};

/** Resolve, para cada campo canônico, o índice da coluna no header real do CSV. */
export function resolveColumnIndex(header: readonly string[]): Record<string, number> {
  const indexByName = new Map<string, number>();
  header.forEach((name, i) => indexByName.set(name, i));

  const resolved: Record<string, number> = {};
  for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const idx = indexByName.get(alias);
      if (idx !== undefined) {
        resolved[canonical] = idx;
        break;
      }
    }
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Normalização: linha CSV (array de strings, na ordem do header original) ->
// mesmo shape que `normalizeContratacao` produz a partir do JSON da API.
// Reaproveita os helpers de `@fonteia/sources` para manter EXATAMENTE a mesma
// forma de dado entre a ingestão incremental (API) e o backfill (bulk CSV).
// ---------------------------------------------------------------------------

function cell(row: readonly string[], cols: Record<string, number>, key: string): string | undefined {
  const idx = cols[key];
  if (idx === undefined) return undefined;
  const value = row[idx];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function toBool(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return undefined;
}

function toInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}

/** true quando a linha deve ser descartada (contratação marcada como excluída no PNCP). */
export function isExcluida(row: readonly string[], cols: Record<string, number>): boolean {
  return toBool(cell(row, cols, "contratacao_excluida")) === true;
}

/**
 * Normaliza uma linha do CSV bulk para o mesmo `PncpLicitacao` que a ingestão
 * incremental produz a partir do JSON da API — mesma forma de dado, duas
 * fontes. Retorna `undefined` quando a linha não tem numeroControlePNCP
 * (chave natural obrigatória) ou está marcada como excluída.
 */
export function normalizeCsvRow(
  row: readonly string[],
  cols: Record<string, number>,
  collectedAt: string,
): PncpLicitacao | undefined {
  const numeroControlePNCP = cell(row, cols, "numero_controle_pncp");
  if (!numeroControlePNCP) return undefined;
  if (isExcluida(row, cols)) return undefined;

  const modalidadeIdNum = toInt(cell(row, cols, "modalidade_id"));
  const modalidade =
    cell(row, cols, "modalidade_nome") ??
    (modalidadeIdNum !== undefined ? modalidadeNome(modalidadeIdNum) : "Não informado");

  const orgaoRazaoSocial = cell(row, cols, "orgao_entidade_razao_social");
  const unidadeNome = cell(row, cols, "unidade_orgao_nome_unidade");
  const linkOrigem = cell(row, cols, "link_sistema_origem");
  const sourceUrl =
    linkOrigem && linkOrigem.startsWith("https://")
      ? linkOrigem
      : contratacaoPortalUrl(numeroControlePNCP);

  // Monta um PncpContratacaoRaw equivalente ao que a API devolveria, para
  // guardar em `raw` (auditoria/trilha de fonte) com a MESMA forma de dado
  // independente do canal de ingestão. Construído incrementalmente (em vez de
  // um único objeto literal) porque `exactOptionalPropertyTypes` proíbe
  // atribuir `undefined` explicitamente a uma chave opcional — cada campo só
  // entra no objeto quando o valor realmente existe na linha do CSV.
  const raw: PncpContratacaoRaw = { numeroControlePNCP };
  if (modalidadeIdNum !== undefined) raw.modalidadeId = modalidadeIdNum;
  const modalidadeNomeCol = cell(row, cols, "modalidade_nome");
  if (modalidadeNomeCol !== undefined) raw.modalidadeNome = modalidadeNomeCol;
  const modoDisputaNomeCol = cell(row, cols, "modo_disputa_nome");
  if (modoDisputaNomeCol !== undefined) raw.modoDisputaNome = modoDisputaNomeCol;
  const situacaoCompraIdCol = toInt(cell(row, cols, "situacao_compra_id"));
  if (situacaoCompraIdCol !== undefined) raw.situacaoCompraId = situacaoCompraIdCol;
  const situacaoCompraNomeCol = cell(row, cols, "situacao_compra_nome");
  if (situacaoCompraNomeCol !== undefined) raw.situacaoCompraNome = situacaoCompraNomeCol;
  const tipoInstrumentoCodigoCol = toInt(cell(row, cols, "tipo_instrumento_codigo"));
  if (tipoInstrumentoCodigoCol !== undefined) raw.tipoInstrumentoConvocatorioCodigo = tipoInstrumentoCodigoCol;
  const tipoInstrumentoNomeCol = cell(row, cols, "tipo_instrumento_nome");
  if (tipoInstrumentoNomeCol !== undefined) raw.tipoInstrumentoConvocatorioNome = tipoInstrumentoNomeCol;
  const valorTotalEstimadoCol = cell(row, cols, "valor_total_estimado");
  raw.valorTotalEstimado = valorTotalEstimadoCol !== undefined ? Number(valorTotalEstimadoCol) : null;
  const valorTotalHomologadoCol = cell(row, cols, "valor_total_homologado");
  raw.valorTotalHomologado = valorTotalHomologadoCol !== undefined ? Number(valorTotalHomologadoCol) : null;
  const srpCol = toBool(cell(row, cols, "srp"));
  if (srpCol !== undefined) raw.srp = srpCol;
  const dataPublicacaoPncpCol = cell(row, cols, "data_publicacao_pncp");
  if (dataPublicacaoPncpCol !== undefined) raw.dataPublicacaoPncp = dataPublicacaoPncpCol;
  const dataInclusaoCol = cell(row, cols, "data_inclusao");
  if (dataInclusaoCol !== undefined) raw.dataInclusao = dataInclusaoCol;
  const dataAtualizacaoCol = cell(row, cols, "data_atualizacao");
  if (dataAtualizacaoCol !== undefined) raw.dataAtualizacao = dataAtualizacaoCol;
  raw.dataAberturaProposta = cell(row, cols, "data_abertura_proposta") ?? null;
  raw.dataEncerramentoProposta = cell(row, cols, "data_encerramento_proposta") ?? null;

  const orgaoCnpjCol = cell(row, cols, "orgao_entidade_cnpj");
  const orgaoPoderIdCol = cell(row, cols, "orgao_entidade_poder_id");
  const orgaoEsferaIdCol = cell(row, cols, "orgao_entidade_esfera_id");
  const orgaoEntidade: PncpOrgaoEntidadeRaw = {};
  if (orgaoCnpjCol !== undefined) orgaoEntidade.cnpj = orgaoCnpjCol;
  if (orgaoRazaoSocial !== undefined) orgaoEntidade.razaoSocial = orgaoRazaoSocial;
  if (orgaoPoderIdCol !== undefined) orgaoEntidade.poderId = orgaoPoderIdCol;
  if (orgaoEsferaIdCol !== undefined) orgaoEntidade.esferaId = orgaoEsferaIdCol;
  raw.orgaoEntidade = orgaoEntidade;

  const ufNomeCol = cell(row, cols, "unidade_orgao_uf_nome");
  const ufSiglaCol = cell(row, cols, "unidade_orgao_uf_sigla");
  const municipioNomeCol = cell(row, cols, "unidade_orgao_municipio_nome");
  const codigoIbgeCol = cell(row, cols, "unidade_orgao_codigo_ibge");
  const unidadeOrgao: PncpUnidadeOrgaoRaw = {};
  if (ufNomeCol !== undefined) unidadeOrgao.ufNome = ufNomeCol;
  if (ufSiglaCol !== undefined) unidadeOrgao.ufSigla = ufSiglaCol;
  if (municipioNomeCol !== undefined) unidadeOrgao.municipioNome = municipioNomeCol;
  if (codigoIbgeCol !== undefined) unidadeOrgao.codigoIbge = codigoIbgeCol;
  if (unidadeNome !== undefined) unidadeOrgao.nomeUnidade = unidadeNome;
  raw.unidadeOrgao = unidadeOrgao;

  const amparoLegalCodigoCol = toInt(cell(row, cols, "amparo_legal_codigo"));
  const amparoLegalNomeCol = cell(row, cols, "amparo_legal_nome");
  if (amparoLegalCodigoCol !== undefined || amparoLegalNomeCol !== undefined) {
    const amparoLegal: PncpAmparoLegalRaw = {};
    if (amparoLegalCodigoCol !== undefined) amparoLegal.codigo = amparoLegalCodigoCol;
    if (amparoLegalNomeCol !== undefined) amparoLegal.nome = amparoLegalNomeCol;
    raw.amparoLegal = amparoLegal;
  }
  raw.linkSistemaOrigem = linkOrigem ?? null;

  const numeroCompra = cell(row, cols, "numero_compra");
  if (numeroCompra !== undefined) raw.numeroCompra = numeroCompra;
  const anoCompra = toInt(cell(row, cols, "ano_compra"));
  if (anoCompra !== undefined) raw.anoCompra = anoCompra;
  const processo = cell(row, cols, "processo");
  if (processo !== undefined) raw.processo = processo;
  const objetoCompra = cell(row, cols, "objeto_compra");
  if (objetoCompra !== undefined) raw.objetoCompra = objetoCompra;
  const informacaoComplementar = cell(row, cols, "informacao_complementar");
  if (informacaoComplementar !== undefined) raw.informacaoComplementar = informacaoComplementar;

  const licitacao: PncpLicitacao = {
    id: numeroControlePNCP,
    sourceId: PNCP_BULK_SOURCE_ID,
    numeroControlePNCP,
    objeto: objetoCompra ?? "",
    orgao: orgaoRazaoSocial ?? unidadeNome ?? "Órgão não informado",
    modalidade,
    valorEstimadoCents: reaisToCents(cell(row, cols, "valor_total_estimado")),
    dataPublicacao: parsePncpDate(cell(row, cols, "data_publicacao_pncp")),
    dataAbertura: parsePncpDate(cell(row, cols, "data_abertura_proposta")),
    dataEncerramento: parsePncpDate(cell(row, cols, "data_encerramento_proposta")),
    sourceUrl,
    collectedAt,
    raw,
  };

  if (numeroCompra !== undefined) licitacao.numeroCompra = numeroCompra;
  if (anoCompra !== undefined) licitacao.anoCompra = anoCompra;
  if (processo !== undefined) licitacao.processo = processo;
  const orgaoCnpj = cell(row, cols, "orgao_entidade_cnpj");
  if (orgaoCnpj !== undefined) licitacao.orgaoCnpj = orgaoCnpj;
  if (unidadeNome !== undefined) licitacao.unidade = unidadeNome;
  const ufSigla = cell(row, cols, "unidade_orgao_uf_sigla");
  if (ufSigla !== undefined) licitacao.uf = ufSigla;
  const ufNome = cell(row, cols, "unidade_orgao_uf_nome");
  if (ufNome !== undefined) licitacao.ufNome = ufNome;
  const municipio = cell(row, cols, "unidade_orgao_municipio_nome");
  if (municipio !== undefined) licitacao.municipio = municipio;
  const codigoIbge = cell(row, cols, "unidade_orgao_codigo_ibge");
  if (codigoIbge !== undefined) licitacao.codigoIbge = codigoIbge;
  const esfera = cell(row, cols, "orgao_entidade_esfera_id");
  if (esfera !== undefined) licitacao.esfera = esfera;
  const poder = cell(row, cols, "orgao_entidade_poder_id");
  if (poder !== undefined) licitacao.poder = poder;
  if (modalidadeIdNum !== undefined) licitacao.modalidadeId = modalidadeIdNum;
  const modoDisputa = cell(row, cols, "modo_disputa_nome");
  if (modoDisputa !== undefined) licitacao.modoDisputa = modoDisputa;
  const situacaoId = toInt(cell(row, cols, "situacao_compra_id"));
  if (situacaoId !== undefined) licitacao.situacaoId = situacaoId;
  const situacao = cell(row, cols, "situacao_compra_nome");
  if (situacao !== undefined) licitacao.situacao = situacao;
  const instrumento = cell(row, cols, "tipo_instrumento_nome");
  if (instrumento !== undefined) licitacao.instrumento = instrumento;
  const valorHomologado = cell(row, cols, "valor_total_homologado");
  if (valorHomologado !== undefined) licitacao.valorHomologadoCents = reaisToCents(valorHomologado);
  const srp = toBool(cell(row, cols, "srp"));
  if (srp !== undefined) licitacao.srp = srp;
  const amparoLegalNome = cell(row, cols, "amparo_legal_nome");
  if (amparoLegalNome !== undefined) licitacao.amparoLegal = amparoLegalNome;

  return licitacao;
}

// ---------------------------------------------------------------------------
// Streaming: baixa o CSV via fetch e faz parse incremental linha a linha.
// Nunca materializa o arquivo inteiro em memória — o body da resposta é lido
// como stream Web (ReadableStream) e alimentado ao parser do csv-parse via
// `Readable.fromWeb`, que também processa incrementalmente.
// ---------------------------------------------------------------------------

export interface StreamRowsOptions {
  url: string;
  fetcher?: typeof fetch;
  /** Processa no máximo N linhas de DADO (exclui header). 0/undefined = sem limite. */
  limit?: number;
}

/**
 * Consome o CSV remoto linha a linha via callback, sem materializar o arquivo
 * inteiro. `onRow` recebe o array de campos crus (na ordem do header real) e o
 * mapa de colunas resolvido a partir do header. Resolve a Promise quando o
 * stream termina (ou quando `limit` é atingido).
 */
export async function streamCsvRows(
  opts: StreamRowsOptions,
  onRow: (row: string[], cols: Record<string, number>) => void,
): Promise<{ rowsSeen: number }> {
  const fetcher = opts.fetcher ?? fetch;
  const response = await fetcher(opts.url);
  if (!response.ok || !response.body) {
    throw new Error(`Falha ao baixar ${opts.url}: HTTP ${response.status}`);
  }

  const { Readable } = await import("node:stream");
  const nodeStream = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);

  const parser = parseCsv({
    columns: false,
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: false,
  });

  let cols: Record<string, number> | undefined;
  let rowsSeen = 0;
  let stopped = false;

  await new Promise<void>((resolve, reject) => {
    parser.on("readable", () => {
      if (stopped) return;
      let record: string[] | null;
      while ((record = parser.read() as string[] | null) !== null) {
        if (!cols) {
          cols = resolveColumnIndex(record);
          continue;
        }
        rowsSeen += 1;
        onRow(record, cols);
        if (opts.limit && rowsSeen >= opts.limit) {
          stopped = true;
          parser.destroy();
          nodeStream.destroy();
          break;
        }
      }
      if (stopped) resolve();
    });
    parser.on("error", (err) => {
      if (stopped) return;
      reject(err);
    });
    parser.on("end", () => resolve());
    nodeStream.on("error", (err) => {
      if (stopped) return;
      reject(err);
    });
    nodeStream.pipe(parser);
  });

  return { rowsSeen };
}

// ---------------------------------------------------------------------------
// Persistência: mesma RPC `ingest_pncp` usada pela ingestão incremental,
// chamada em lotes via Pool `pg` direto (padrão de `ingest-receita-leiloes`).
// ---------------------------------------------------------------------------

function createPoolFromEnv(env: NodeJS.ProcessEnv): Pool | undefined {
  if (!env.DATABASE_URL) return undefined;
  return new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
}

async function ingestBatch(pool: Pool, items: PncpLicitacao[], collectedAt: string): Promise<number> {
  const result = await pool.query<{ ingest_pncp: number }>(
    "select public.ingest_pncp($1::jsonb) as ingest_pncp",
    [JSON.stringify({ collectedAt, items })],
  );
  return result.rows[0]?.ingest_pncp ?? items.length;
}

/**
 * Transporte alternativo quando não há DATABASE_URL: chama a MESMA RPC via
 * PostgREST (`/rest/v1/rpc/ingest_pncp`) com a service key — exatamente o que
 * as Edge Functions fazem via supabase-js. Útil em máquinas sem o password do
 * Postgres (a service key é obtida via Management API, nunca persistida).
 */
type BatchWriter = (items: PncpLicitacao[], collectedAt: string) => Promise<number>;

function createRestWriterFromEnv(env: NodeJS.ProcessEnv): BatchWriter | undefined {
  const baseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !serviceKey) return undefined;
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/rest/v1/rpc/ingest_pncp`;
  // Retry com backoff para falhas TRANSITÓRIAS (rede/5xx/429): PostgREST pode
  // reiniciar ou recusar conexão momentaneamente sob carga (visto ao vivo:
  // "delayed connect error: 111"). A RPC é idempotente, então repetir o mesmo
  // lote é seguro. 4xx (exceto 429) não re-tenta — é erro nosso, falha honesta.
  return async (items, collectedAt) => {
    // 8 tentativas, backoff 2s→60s (cap): sobrevive a rebuild de schema cache do
    // PostgREST pós-upgrade (PGRST002), que dura mais que um blip de rede.
    const attempts = 8;
    let lastErr: Error | undefined;
    for (let attempt = 0; attempt < attempts; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, Math.min(60_000, 2000 * 2 ** (attempt - 1))));
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ p_payload: { collectedAt, items } }),
        });
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        continue; // erro de rede puro: re-tenta
      }
      if (res.ok) {
        const data: unknown = await res.json().catch(() => undefined);
        return typeof data === "number" ? data : items.length;
      }
      const body = await res.text().catch(() => "");
      lastErr = new Error(`RPC ingest_pncp via PostgREST falhou: ${res.status} ${body.slice(0, 300)}`);
      if (res.status < 500 && res.status !== 429) throw lastErr; // 4xx real: não insiste
    }
    throw lastErr ?? new Error("RPC ingest_pncp: falha após retries");
  };
}

// ---------------------------------------------------------------------------
// Orquestração principal
// ---------------------------------------------------------------------------

export interface IngestPncpBulkOptions {
  ano: number;
  arquivo?: string;
  limit?: number;
  dryRun?: boolean;
  batchSize?: number;
  logEvery?: number;
  pool?: Pool;
  fetcher?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  log?: (msg: string) => void;
}

export interface IngestPncpBulkResult {
  url: string;
  rowsSeen: number;
  rowsExcluidas: number;
  rowsSemNumeroControle: number;
  normalized: number;
  deduped: number;
  ingested: number;
  dryRun: boolean;
}

export async function ingestPncpBulk(options: IngestPncpBulkOptions): Promise<IngestPncpBulkResult> {
  const url = options.arquivo ?? bulkCompraCsvUrl(options.ano);
  const dryRun = options.dryRun ?? false;
  const batchSize = Math.min(options.batchSize ?? DEFAULT_RPC_BATCH, MAX_RPC_BATCH);
  const logEvery = options.logEvery ?? DEFAULT_LOG_EVERY;
  const log = options.log ?? ((msg: string) => console.log(msg));
  const collectedAt = new Date().toISOString();

  const createdPool = dryRun || options.pool ? undefined : createPoolFromEnv(options.env ?? process.env);
  const pool = dryRun ? undefined : options.pool ?? createdPool;
  const restWriter = dryRun || pool ? undefined : createRestWriterFromEnv(options.env ?? process.env);

  if (!dryRun && !pool && !restWriter) {
    throw new Error(
      "Sem credenciais de escrita — defina DATABASE_URL (Postgres direto) OU " +
        "SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (PostgREST), ou use --dry-run para testar o parser sem banco.",
    );
  }

  const seen = new Set<string>();
  let buffer: PncpLicitacao[] = [];
  let normalized = 0;
  let deduped = 0;
  let ingested = 0;
  let rowsExcluidas = 0;
  let rowsSemNumeroControle = 0;
  const pendingFlushes: Promise<void>[] = [];

  const flush = async (items: PncpLicitacao[]): Promise<void> => {
    if (items.length === 0) return;
    if (dryRun) {
      ingested += items.length;
      return;
    }
    ingested += pool ? await ingestBatch(pool, items, collectedAt) : await restWriter!(items, collectedAt);
  };

  log(`[ingest-pncp-bulk] ano=${options.ano} url=${url} dryRun=${dryRun} batch=${batchSize}`);

  const streamOptions: StreamRowsOptions = { url };
  if (options.fetcher !== undefined) streamOptions.fetcher = options.fetcher;
  if (options.limit !== undefined) streamOptions.limit = options.limit;

  let linhasProcessadas = 0;

  const { rowsSeen } = await streamCsvRows(
    streamOptions,
    (row, cols) => {
      linhasProcessadas += 1;

      if (isExcluida(row, cols)) {
        rowsExcluidas += 1;
      } else {
        const licitacao = normalizeCsvRow(row, cols, collectedAt);
        if (!licitacao) {
          rowsSemNumeroControle += 1;
        } else {
          normalized += 1;
          if (seen.has(licitacao.numeroControlePNCP)) {
            deduped += 1;
          } else {
            seen.add(licitacao.numeroControlePNCP);
            buffer.push(licitacao);

            if (buffer.length >= batchSize) {
              const batch = buffer;
              buffer = [];
              // Serializa os flushes (não dispara N chamadas de RPC concorrentes —
              // mantém a ordem e evita saturar o pool de conexões).
              const previous = pendingFlushes[pendingFlushes.length - 1] ?? Promise.resolve();
              pendingFlushes.push(previous.then(() => flush(batch)));
            }
          }
        }
      }

      if (linhasProcessadas % logEvery === 0) {
        log(
          `[ingest-pncp-bulk] progresso: ${linhasProcessadas} linhas lidas | ` +
            `${normalized} normalizadas | ${deduped} dedup | ${ingested} gravadas`,
        );
      }
    },
  );

  await Promise.all(pendingFlushes);
  await flush(buffer);

  log(
    `[ingest-pncp-bulk] concluído: ${rowsSeen} linhas | ${normalized} normalizadas | ` +
      `${rowsExcluidas} excluídas | ${rowsSemNumeroControle} sem numeroControlePNCP | ` +
      `${deduped} dedup | ${ingested} gravadas (dryRun=${dryRun})`,
  );

  await createdPool?.end();

  return {
    url,
    rowsSeen,
    rowsExcluidas,
    rowsSemNumeroControle,
    normalized,
    deduped,
    ingested,
    dryRun,
  };
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  // `pathToFileURL` normaliza corretamente barras/drive-letter no Windows
  // (produz "file:///C:/..." com 3 barras) — comparar via string manual
  // ("file://" + path) quebra em Windows porque `import.meta.url` real usa
  // 3 barras para paths absolutos com drive letter.
  return import.meta.url === pathToFileURL(entry).href;
}

if (isMainModule()) {
  const opts = parseCliArgs(process.argv.slice(2));
  if (!opts.ano && !opts.arquivo) {
    console.error(
      "Uso: tsx ingest-pncp-bulk.ts --ano=2025 [--arquivo=<url>] [--limit=N] [--dry-run] [--batch=N] [--log-every=N]",
    );
    process.exit(1);
  }
  const jobOptions: IngestPncpBulkOptions = {
    ano: opts.ano ?? new Date().getUTCFullYear(),
    dryRun: opts.dryRun,
    batchSize: opts.batch,
    logEvery: opts.logEvery,
  };
  if (opts.arquivo !== undefined) jobOptions.arquivo = opts.arquivo;
  if (opts.limit !== undefined) jobOptions.limit = opts.limit;

  ingestPncpBulk(jobOptions)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
