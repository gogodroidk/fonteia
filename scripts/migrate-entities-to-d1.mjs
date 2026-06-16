#!/usr/bin/env node
// @ts-check
/* eslint-disable no-console */

/*
 * ============================================================================
 *  Fonte.ia — Migração: Supabase Postgres `public.entities` -> Cloudflare D1
 * ============================================================================
 *
 *  O QUE FAZ
 *  ---------
 *  Lê linhas da tabela Postgres `public.entities` (Supabase) em lotes com
 *  PAGINAÇÃO POR KEYSET (WHERE id > $lastId ORDER BY id), gera SQL
 *  `INSERT OR REPLACE INTO entities (...)` e grava no D1 `fonteia-data`
 *  chamando o `wrangler d1 execute ... --remote --file=<arquivo.sql>`.
 *
 *  É resumível (checkpoint em disco), idempotente (INSERT OR REPLACE) e seguro
 *  para interromper a qualquer momento (Ctrl-C) — basta rodar de novo que ele
 *  continua de onde parou.
 *
 *  ATENÇÃO — auction_lot
 *  ---------------------
 *  O filtro `WHERE kind <> 'auction_lot'` NUNCA é removido. Lotes de leilão
 *  (auction_lot) NÃO devem ser migrados — eles têm ciclo de vida próprio
 *  (live na Receita). São ~169.000 linhas (excluindo auction_lot) a migrar.
 *  Se algum dia precisar contar, rode no Postgres:
 *      SELECT count(*) FROM public.entities WHERE kind <> 'auction_lot';
 *
 *  COLUNAS
 *  -------
 *  Origem (SELECT explícito — NÃO selecionamos embedding nem geometry):
 *      id, kind, name, normalized_name, cnpj, cpf_hash, ibge_code,
 *      external_ids, attributes, source_ids, created_at, updated_at
 *  Destino D1 (já criado, NÃO recriar):
 *      entities(id TEXT PRIMARY KEY, kind TEXT, name TEXT, normalized_name TEXT,
 *               cnpj TEXT, cpf_hash TEXT, ibge_code TEXT, external_ids TEXT,
 *               attributes TEXT, source_ids TEXT, created_at TEXT, updated_at TEXT)
 *  - external_ids / attributes  -> JSON.stringify(obj) e gravado como TEXT.
 *  - source_ids                 -> é text[] no Postgres; vira um JSON array (TEXT).
 *  - created_at / updated_at     -> ISO-8601 UTC terminando em 'Z'
 *                                   (ex.: '2026-06-16T12:25:45Z').
 *
 *  DEPENDÊNCIA `pg`
 *  ----------------
 *  Este script usa a lib `pg` (node-postgres). No monorepo ela JÁ é dependência
 *  de `apps/api` e `services/ingest` (pg@8.21.0 no pnpm-lock), MAS pode NÃO estar
 *  içada (hoisted) para o `node_modules` da RAIZ. Se ao rodar você vir
 *  "ERR_MODULE_NOT_FOUND: Cannot find package 'pg'", instale na raiz:
 *
 *      pnpm add -Dw pg
 *
 *  (-w = workspace root, -D = devDependency). Alternativamente, rode o script a
 *  partir de um workspace que já tenha `pg` — mas o caminho mais simples é
 *  `pnpm add -Dw pg`.
 *
 *  -------------------------------------------------------------------------
 *  USO
 *  -------------------------------------------------------------------------
 *  Variáveis de ambiente OBRIGATÓRIAS:
 *      SUPABASE_DB_URL        URL de conexão Postgres (postgres://...). Pegue em:
 *                             Supabase Dashboard > Project Settings > Database >
 *                             "Connection string". Use o POOLER em modo SESSION
 *                             (Session mode) — host tipo:
 *                               aws-0-<região>.pooler.supabase.com:5432
 *                             e usuário tipo:
 *                               postgres.pwiuiihsyazghdsrpshg
 *                             Lembre de URL-encodar a senha se tiver caracteres
 *                             especiais. SSL é exigido (o script já força TLS).
 *      CLOUDFLARE_API_TOKEN   token com permissão de D1 Edit (usado pelo wrangler)
 *      CLOUDFLARE_ACCOUNT_ID  id da conta Cloudflare (usado pelo wrangler)
 *                             (alternativa: ter feito `wrangler login` antes)
 *
 *  Variáveis OPCIONAIS:
 *      BATCH_SIZE=200         linhas lidas por página do Postgres (keyset)
 *      ROWS_PER_INSERT=50     tuplas por statement INSERT OR REPLACE (limite/statement)
 *      RESET=1                apaga o checkpoint e recomeça do zero
 *      DRY_RUN=1              gera os .sql em ./scripts/dry-run-sql/ e NÃO chama wrangler
 *      TOTAL_ESTIMATE=169000  só p/ exibir progresso "X / ~169000"
 *      WRANGLER_CONFIG=services/api/wrangler.toml   (default já é este)
 *      MAX_RETRIES=3          tentativas por página antes de desistir
 *      RETRY_BASE_MS=2000      backoff base entre tentativas (ms)
 *
 *  EXECUÇÃO NORMAL (migra de verdade):
 *      SUPABASE_DB_URL='postgres://postgres.pwiuiihsyazghdsrpshg:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres' \
 *      CLOUDFLARE_API_TOKEN='...' CLOUDFLARE_ACCOUNT_ID='...' \
 *      node scripts/migrate-entities-to-d1.mjs
 *
 *      (ou, garantindo que o `pg` da raiz seja resolvido:)
 *      pnpm exec node scripts/migrate-entities-to-d1.mjs
 *
 *  DRY-RUN (valida a geração/escapamento do SQL, sem tocar no D1):
 *      DRY_RUN=1 SUPABASE_DB_URL='postgres://...' node scripts/migrate-entities-to-d1.mjs
 *      # inspecione os arquivos em scripts/dry-run-sql/
 *
 *  RESUMIR (padrão — basta rodar de novo; ele lê o checkpoint):
 *      node scripts/migrate-entities-to-d1.mjs
 *
 *  RECOMEÇAR DO ZERO (ignora/apaga o checkpoint):
 *      RESET=1 node scripts/migrate-entities-to-d1.mjs
 *
 *  -------------------------------------------------------------------------
 *  COMO É RESUMÍVEL / IDEMPOTENTE
 *  -------------------------------------------------------------------------
 *  - Checkpoint: scripts/.migrate-d1-checkpoint.json
 *      { lastId, migrated, startedAt, updatedAt }
 *  - Ao iniciar, se o checkpoint existe (e RESET != 1), retoma de `lastId`.
 *  - O checkpoint só é AVANÇADO depois que o wrangler grava a página com sucesso
 *    (exit 0). Se o wrangler falhar, o script PARA sem avançar -> rodar de novo
 *    reprocessa a MESMA página.
 *  - INSERT OR REPLACE torna o reprocessamento seguro (sobrescreve por PK `id`).
 *  - Escrita do checkpoint é atômica (tmp file + rename).
 *
 *  NOTA SOBRE wrangler 4.x
 *  -----------------------
 *  Forma canônica (database NAME, não o binding):
 *      npx wrangler d1 execute fonteia-data --remote --file=./batch.sql \
 *          --config services/api/wrangler.toml
 *  `--remote` = banco D1 de produção (não o local). `--file` aceita um .sql com
 *  vários statements separados por ';'. Mantemos cada INSERT com no máx.
 *  ROWS_PER_INSERT tuplas para respeitar o limite ~100KB por statement do D1.
 * ============================================================================
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Resolução de caminhos (o script funciona de qualquer cwd, mas assumimos que
// é chamado a partir da raiz do monorepo para o --config relativo bater).
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // .../fonteia/scripts
const REPO_ROOT = path.resolve(__dirname, '..'); // .../fonteia
const CHECKPOINT_PATH = path.join(__dirname, '.migrate-d1-checkpoint.json');
const DRY_RUN_DIR = path.join(__dirname, 'dry-run-sql');

// ---------------------------------------------------------------------------
// Configuração via env
// ---------------------------------------------------------------------------
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL;
const BATCH_SIZE = clampInt(process.env.BATCH_SIZE, 200, 1, 10000);
const ROWS_PER_INSERT = clampInt(process.env.ROWS_PER_INSERT, 50, 1, 1000);
const RESET = process.env.RESET === '1';
const DRY_RUN = process.env.DRY_RUN === '1';
const TOTAL_ESTIMATE = clampInt(process.env.TOTAL_ESTIMATE, 169000, 0, 100_000_000);
const WRANGLER_CONFIG = process.env.WRANGLER_CONFIG || 'services/api/wrangler.toml';
const MAX_RETRIES = clampInt(process.env.MAX_RETRIES, 3, 1, 10);
const RETRY_BASE_MS = clampInt(process.env.RETRY_BASE_MS, 2000, 100, 60000);

// Nome do banco D1 (NÃO é o binding "DB"; o `d1 execute` quer o database name).
const D1_DATABASE_NAME = 'fonteia-data';

// Colunas migradas (ordem fixa — usada no SELECT e no INSERT).
// IMPORTANTE: NÃO incluir embedding nem geometry.
const COLUMNS = [
  'id',
  'kind',
  'name',
  'normalized_name',
  'cnpj',
  'cpf_hash',
  'ibge_code',
  'external_ids',
  'attributes',
  'source_ids',
  'created_at',
  'updated_at',
];

// Colunas que são JSON object/array no JS e devem ser serializadas com JSON.stringify.
const JSON_OBJECT_COLUMNS = new Set(['external_ids', 'attributes']);
// Coluna text[] no Postgres -> JSON array string no D1.
const ARRAY_COLUMNS = new Set(['source_ids']);
// Colunas de timestamp -> ISO-8601 UTC 'Z'.
const TIMESTAMP_COLUMNS = new Set(['created_at', 'updated_at']);

// ---------------------------------------------------------------------------
// Carregamento da lib `pg` (com mensagem clara se não estiver instalada na raiz)
// ---------------------------------------------------------------------------
async function loadPgClient() {
  // Tentamos via import dinâmico (resolve a partir deste arquivo) e, como
  // fallback, via createRequire a partir da raiz do repo, cobrindo o caso de
  // o `pg` existir só dentro de um workspace.
  try {
    const mod = await import('pg');
    return mod.default ?? mod;
  } catch (errImport) {
    try {
      const requireFromRoot = createRequire(path.join(REPO_ROOT, 'noop.js'));
      // eslint-disable-next-line import/no-dynamic-require, global-require
      return requireFromRoot('pg');
    } catch (errRequire) {
      console.error(
        [
          '',
          '✗ Não consegui carregar a lib `pg` (node-postgres).',
          '  Ela é dependência de apps/api e services/ingest, mas pode não estar',
          '  içada para o node_modules da RAIZ. Instale na raiz e rode de novo:',
          '',
          '      pnpm add -Dw pg',
          '',
          '  (ou rode o script com `pnpm exec node scripts/migrate-entities-to-d1.mjs`)',
          '',
          `  Detalhe import: ${errImport?.message ?? errImport}`,
          `  Detalhe require: ${errRequire?.message ?? errRequire}`,
        ].join('\n'),
      );
      process.exit(1);
    }
  }
}

// ===========================================================================
//  Helpers de escapamento de SQL (CRÍTICO — segurança e correção)
// ===========================================================================

/**
 * Escapa um valor TEXT para SQLite/D1: dobra aspas simples e envolve em aspas.
 * Ex.: O'Brien -> 'O''Brien'. null/undefined -> NULL (literal, sem aspas).
 * @param {unknown} value
 * @returns {string}
 */
function sqlText(value) {
  if (value === null || value === undefined) return 'NULL';
  const str = String(value);
  return `'${str.replace(/'/g, "''")}'`;
}

/**
 * Serializa um objeto/array JSON e devolve como literal TEXT escapado.
 * null/undefined -> NULL. Strings que já vierem do pg como texto também são
 * aceitas (re-serializamos só se for objeto).
 * @param {unknown} value
 * @returns {string}
 */
function sqlJson(value) {
  if (value === null || value === undefined) return 'NULL';
  // O driver `pg` já faz parse de colunas jsonb/json para objeto JS.
  // Se por algum motivo vier string, mantemos como está (assume-se JSON válido).
  const jsonStr = typeof value === 'string' ? value : JSON.stringify(value);
  return sqlText(jsonStr);
}

/**
 * Converte um text[] do Postgres (que o `pg` entrega como array JS) em um
 * JSON array string escapado. Também tolera string única ou null.
 * @param {unknown} value
 * @returns {string}
 */
function sqlArrayAsJson(value) {
  if (value === null || value === undefined) return 'NULL';
  if (Array.isArray(value)) return sqlText(JSON.stringify(value));
  // Fallback defensivo: valor escalar -> array de 1 elemento.
  return sqlText(JSON.stringify([value]));
}

/**
 * Converte um timestamp em ISO-8601 UTC terminando em 'Z' (sem milissegundos),
 * ex.: '2026-06-16T12:25:45Z'. Aceita Date (o `pg` entrega timestamptz como
 * Date), string ou null. Strings inválidas viram NULL para não quebrar o batch.
 * @param {unknown} value
 * @returns {string}
 */
function sqlTimestampUtc(value) {
  if (value === null || value === undefined) return 'NULL';
  let date;
  if (value instanceof Date) {
    date = value;
  } else {
    date = new Date(String(value));
  }
  if (Number.isNaN(date.getTime())) return 'NULL';
  // toISOString() -> '2026-06-16T12:25:45.123Z'; cortamos os milissegundos.
  const iso = date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return sqlText(iso);
}

/**
 * Constrói o literal SQL de UMA tupla VALUES (...) para uma linha.
 * @param {Record<string, unknown>} row
 * @returns {string} ex.: ('id','kind',...)
 */
function buildValuesTuple(row) {
  const parts = COLUMNS.map((col) => {
    const v = row[col];
    if (JSON_OBJECT_COLUMNS.has(col)) return sqlJson(v);
    if (ARRAY_COLUMNS.has(col)) return sqlArrayAsJson(v);
    if (TIMESTAMP_COLUMNS.has(col)) return sqlTimestampUtc(v);
    return sqlText(v); // id, kind, name, normalized_name, cnpj, cpf_hash, ibge_code
  });
  return `(${parts.join(',')})`;
}

/**
 * Gera o SQL completo de uma página: vários statements INSERT OR REPLACE,
 * cada um com no máximo ROWS_PER_INSERT tuplas (respeita limite/statement do D1).
 * @param {Array<Record<string, unknown>>} rows
 * @returns {string}
 */
function buildPageSql(rows) {
  const colList = COLUMNS.join(', ');
  const header = `INSERT OR REPLACE INTO entities (${colList}) VALUES`;
  const statements = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_INSERT) {
    const chunk = rows.slice(i, i + ROWS_PER_INSERT);
    const tuples = chunk.map(buildValuesTuple).join(',\n');
    statements.push(`${header}\n${tuples};`);
  }
  // Cabeçalho informativo no topo do arquivo (comentário SQL).
  const banner =
    `-- Fonte.ia migrate batch — gerado em ${new Date().toISOString()}\n` +
    `-- ${rows.length} linhas em ${statements.length} statement(s) ` +
    `(max ${ROWS_PER_INSERT} tuplas/statement)\n`;
  return `${banner}${statements.join('\n')}\n`;
}

// ===========================================================================
//  Checkpoint (resumível) — leitura/gravação atômica
// ===========================================================================

/** @returns {{ lastId: string|null, migrated: number, startedAt: string, updatedAt: string }} */
function loadCheckpoint() {
  const empty = {
    lastId: null,
    migrated: 0,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  if (RESET) {
    if (fs.existsSync(CHECKPOINT_PATH)) {
      fs.rmSync(CHECKPOINT_PATH, { force: true });
      console.log(`↺ RESET=1 — checkpoint removido (${CHECKPOINT_PATH}). Recomeçando do zero.`);
    }
    return empty;
  }
  if (!fs.existsSync(CHECKPOINT_PATH)) return empty;
  try {
    const parsed = JSON.parse(fs.readFileSync(CHECKPOINT_PATH, 'utf8'));
    return {
      lastId: parsed.lastId ?? null,
      migrated: Number(parsed.migrated) || 0,
      startedAt: parsed.startedAt ?? empty.startedAt,
      updatedAt: parsed.updatedAt ?? empty.updatedAt,
    };
  } catch (err) {
    console.warn(
      `⚠ Checkpoint corrompido (${err?.message ?? err}). Começando do zero. ` +
        'Use RESET=1 para silenciar este aviso.',
    );
    return empty;
  }
}

/**
 * Grava o checkpoint de forma atômica (tmp + rename no mesmo diretório).
 * @param {{ lastId: string|null, migrated: number, startedAt: string }} cp
 */
function saveCheckpoint(cp) {
  const payload = {
    lastId: cp.lastId,
    migrated: cp.migrated,
    startedAt: cp.startedAt,
    updatedAt: new Date().toISOString(),
  };
  const tmp = path.join(__dirname, `.migrate-d1-checkpoint.${process.pid}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmp, CHECKPOINT_PATH); // rename é atômico no mesmo filesystem
}

// ===========================================================================
//  Wrangler (gravação no D1) — com retry/backoff
// ===========================================================================

/**
 * Executa `wrangler d1 execute fonteia-data --remote --file=<sqlFile>`.
 * Resolve com { code, stdout, stderr }. NÃO lança em exit != 0 (o chamador decide).
 * @param {string} sqlFile caminho absoluto do .sql
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
function runWranglerExecute(sqlFile) {
  return new Promise((resolve) => {
    // Usamos `npx wrangler` para não depender de um bin global; o wrangler 4.99
    // está nas devDeps do monorepo. cwd = raiz do repo para o --config relativo.
    const args = [
      'wrangler',
      'd1',
      'execute',
      D1_DATABASE_NAME,
      '--remote',
      `--file=${sqlFile}`,
      '--config',
      WRANGLER_CONFIG,
      '--yes', // wrangler 4.x: confirma prompts não-interativos (evita travar)
    ];
    const child = spawn('npx', args, {
      cwd: REPO_ROOT,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      // ex.: npx/wrangler não encontrado
      resolve({ code: 127, stdout, stderr: `${stderr}\n[spawn error] ${err.message}` });
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
}

/**
 * Tenta gravar a página no D1 com até MAX_RETRIES tentativas (backoff exponencial).
 * @param {string} sqlFile
 * @param {number} pageNum
 * @returns {Promise<boolean>} true se gravou; false se esgotou as tentativas.
 */
async function writePageWithRetry(sqlFile, pageNum) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const { code, stdout, stderr } = await runWranglerExecute(sqlFile);
    if (code === 0) {
      if (attempt > 1) console.log(`  ✓ página ${pageNum} gravada na tentativa ${attempt}.`);
      return true;
    }
    console.error(
      `  ✗ wrangler falhou (página ${pageNum}, tentativa ${attempt}/${MAX_RETRIES}, exit=${code}).`,
    );
    if (stderr.trim()) console.error(`    stderr: ${truncate(stderr.trim(), 1200)}`);
    if (stdout.trim()) console.error(`    stdout: ${truncate(stdout.trim(), 600)}`);
    if (attempt < MAX_RETRIES) {
      const waitMs = RETRY_BASE_MS * 2 ** (attempt - 1); // 2s, 4s, 8s...
      console.error(`    aguardando ${waitMs}ms antes de tentar de novo...`);
      await sleep(waitMs);
    }
  }
  return false;
}

// ===========================================================================
//  Utilitários
// ===========================================================================

/** Inteiro saneado a partir de env, com default e limites. */
function clampInt(raw, def, min, max) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  if (Number.isNaN(n)) return def;
  return Math.min(Math.max(n, min), max);
}

function truncate(s, n) {
  return s.length > n ? `${s.slice(0, n)}…(${s.length - n} chars omitidos)` : s;
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function fmtElapsed(ms) {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
}

// ===========================================================================
//  Main
// ===========================================================================

async function main() {
  // --- Validação de pré-requisitos -----------------------------------------
  if (!SUPABASE_DB_URL) {
    console.error(
      '✗ Falta SUPABASE_DB_URL. Pegue em: Supabase Dashboard > Project Settings >\n' +
        '  Database > Connection string (use o POOLER em modo Session). Veja o\n' +
        '  bloco de comentário no topo deste arquivo.',
    );
    process.exit(1);
  }
  if (!DRY_RUN) {
    // No modo real precisamos de credenciais Cloudflare (a menos que tenha feito
    // `wrangler login`). Não bloqueamos por completo, mas avisamos.
    if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
      console.warn(
        '⚠ CLOUDFLARE_API_TOKEN e/ou CLOUDFLARE_ACCOUNT_ID não definidos.\n' +
          '  O wrangler vai tentar usar credenciais do `wrangler login`. Se a\n' +
          '  gravação falhar por auth, exporte essas variáveis e rode de novo\n' +
          '  (o script é resumível).',
      );
    }
  }

  const Pg = await loadPgClient();
  const { Client } = Pg;

  // Conexão direta via connection string. SSL exigido pelo pooler do Supabase.
  // rejectUnauthorized:false é o padrão pragmático com o pooler (cadeia self-managed);
  // se preferir validar a CA, passe a CA via ?sslmode=verify-full no URL.
  const client = new Client({
    connectionString: SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
    // Mantém a conexão saudável em migrações longas.
    keepAlive: true,
    statement_timeout: 0,
    query_timeout: 0,
  });

  const checkpoint = loadCheckpoint();
  const runStart = Date.now();

  // Modo DRY-RUN: prepara a pasta de saída.
  if (DRY_RUN) {
    fs.mkdirSync(DRY_RUN_DIR, { recursive: true });
    console.log(`● DRY_RUN=1 — SQL será gravado em ${DRY_RUN_DIR} e o wrangler NÃO será chamado.`);
  }

  console.log('────────────────────────────────────────────────────────────');
  console.log(' Fonte.ia — Migração entities  ->  D1 (fonteia-data)');
  console.log('────────────────────────────────────────────────────────────');
  console.log(`  modo            : ${DRY_RUN ? 'DRY-RUN' : 'REAL (grava no D1)'}`);
  console.log(`  BATCH_SIZE      : ${BATCH_SIZE} (linhas/página, keyset)`);
  console.log(`  ROWS_PER_INSERT : ${ROWS_PER_INSERT} (tuplas/statement)`);
  console.log(`  wrangler config : ${WRANGLER_CONFIG}`);
  console.log(`  filtro          : kind <> 'auction_lot'  (auction_lot NUNCA migra)`);
  console.log(`  estimativa total: ~${TOTAL_ESTIMATE.toLocaleString('pt-BR')} linhas`);
  console.log(`  checkpoint      : ${CHECKPOINT_PATH}`);
  console.log(
    `  retomando de    : ${checkpoint.lastId ? `id > ${checkpoint.lastId}` : 'início (sem checkpoint)'}` +
      `  (já migradas: ${checkpoint.migrated.toLocaleString('pt-BR')})`,
  );
  console.log('────────────────────────────────────────────────────────────');

  // Query keyset: WHERE kind <> 'auction_lot' AND (id > $1 OR $1 IS NULL) ORDER BY id LIMIT $2.
  // Usamos um parâmetro $1 que pode ser NULL na primeira página; o predicado
  // ($1::uuid IS NULL OR id > $1::uuid) cobre os dois casos sem branch no JS.
  // ORDER BY id garante ordem estável p/ keyset (id é uuid PK -> único).
  const SELECT_SQL = `
    SELECT ${COLUMNS.join(', ')}
    FROM public.entities
    WHERE kind <> 'auction_lot'
      AND ($1::uuid IS NULL OR id > $1::uuid)
    ORDER BY id
    LIMIT $2
  `;

  let lastId = checkpoint.lastId;
  let migrated = checkpoint.migrated;
  let pageNum = 0;
  let aborted = false;

  // Captura Ctrl-C para encerrar de forma limpa (checkpoint já está salvo do
  // último sucesso; nada a fazer além de sair com mensagem amigável).
  let interrupted = false;
  const onSigint = () => {
    interrupted = true;
    console.log('\n⏸  Interrompido (SIGINT). O checkpoint reflete a última página gravada.');
    console.log('   Rode de novo para retomar de onde parou.');
  };
  process.on('SIGINT', onSigint);

  try {
    await client.connect();
    // Garante UTC nas conversões de timestamp do lado do servidor (defensivo).
    await client.query("SET TIME ZONE 'UTC'");

    while (!interrupted) {
      const pageStart = Date.now();
      const res = await client.query(SELECT_SQL, [lastId, BATCH_SIZE]);
      const rows = res.rows;
      if (rows.length === 0) break; // acabou

      pageNum += 1;
      const sql = buildPageSql(rows);
      const newLastId = String(rows[rows.length - 1].id);

      if (DRY_RUN) {
        // Grava o SQL para inspeção e NÃO chama o wrangler.
        const outFile = path.join(
          DRY_RUN_DIR,
          `page-${String(pageNum).padStart(5, '0')}.sql`,
        );
        fs.writeFileSync(outFile, sql, 'utf8');
      } else {
        // Grava em arquivo temporário e chama o wrangler com retry.
        const tmpFile = path.join(
          os.tmpdir(),
          `fonteia-d1-batch-${process.pid}-${pageNum}.sql`,
        );
        fs.writeFileSync(tmpFile, sql, 'utf8');
        const ok = await writePageWithRetry(tmpFile, pageNum);
        // Limpa o tmp independentemente (o conteúdo já foi enviado ou falhou).
        fs.rmSync(tmpFile, { force: true });
        if (!ok) {
          aborted = true;
          console.error(
            `\n✗ Abortando na página ${pageNum} após ${MAX_RETRIES} tentativas.\n` +
              `  Checkpoint NÃO avançado (lastId=${lastId ?? 'início'}).\n` +
              '  Corrija o problema (auth/D1/SQL) e rode de novo — vai retomar daqui.',
          );
          break;
        }
      }

      // Sucesso desta página -> avança estado e PERSISTE o checkpoint.
      migrated += rows.length;
      lastId = newLastId;
      if (!DRY_RUN) {
        saveCheckpoint({ lastId, migrated, startedAt: checkpoint.startedAt });
      }

      // Log de progresso.
      const elapsed = Date.now() - runStart;
      const pageMs = Date.now() - pageStart;
      const pct = TOTAL_ESTIMATE > 0 ? ((migrated / TOTAL_ESTIMATE) * 100).toFixed(1) : '?';
      console.log(
        `migrated ${migrated.toLocaleString('pt-BR')} / ~${TOTAL_ESTIMATE.toLocaleString('pt-BR')}` +
          ` (${pct}%)  lastId=${lastId}  página=${pageNum} (${rows.length} linhas em ${pageMs}ms)` +
          `  elapsed=${fmtElapsed(elapsed)}`,
      );
    }
  } catch (err) {
    aborted = true;
    console.error(`\n✗ Erro fatal: ${err?.stack ?? err}`);
    console.error(
      '  O checkpoint reflete a última página gravada com sucesso. Rode de novo p/ retomar.',
    );
  } finally {
    process.off('SIGINT', onSigint);
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }

  // --- Resumo final ---------------------------------------------------------
  const elapsed = Date.now() - runStart;
  console.log('────────────────────────────────────────────────────────────');
  if (DRY_RUN) {
    console.log(
      `● DRY-RUN concluído. ${pageNum} arquivo(s) .sql gerados em ${DRY_RUN_DIR}.\n` +
        `  Linhas processadas nesta execução: ${(migrated - checkpoint.migrated).toLocaleString('pt-BR')}.\n` +
        '  (DRY-RUN não altera o checkpoint nem o D1.)',
    );
  } else if (interrupted || aborted) {
    console.log(
      `⏹  Execução encerrada sem completar. Total migrado (acumulado): ` +
        `${migrated.toLocaleString('pt-BR')}. lastId=${lastId ?? 'início'}.`,
    );
  } else {
    console.log(
      `✓ Migração COMPLETA. Total migrado (acumulado): ${migrated.toLocaleString('pt-BR')}.` +
        `  lastId final=${lastId ?? '(nenhuma linha)'}.`,
    );
  }
  console.log(`  tempo desta execução: ${fmtElapsed(elapsed)}`);
  console.log('────────────────────────────────────────────────────────────');

  // Exit code: 0 se completou ou dry-run ok; 1 se abortou por erro.
  process.exit(aborted ? 1 : 0);
}

main().catch((err) => {
  console.error(`✗ Falha não tratada: ${err?.stack ?? err}`);
  process.exit(1);
});
