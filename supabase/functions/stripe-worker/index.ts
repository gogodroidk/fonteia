// Resgatado de produção em 2026-07-07 (Onda 1) — fonte da verdade era só o deploy;
// NÃO editar sem re-deployar.
//
// Mesma origem/natureza de supabase/functions/stripe-webhook/index.ts (ver o
// cabeçalho lá para o contexto completo): esta função faz parte do instalador
// oficial do pacote "stripe-experiment-sync" v1.0.31 (= @supabase/stripe-sync-engine),
// integração "Stripe Sync Engine" de um clique do Supabase Dashboard.
// verify_jwt=false, version=6 em produção.
//
// Este é o WORKER de reconciliação periódica: puxa objetos do Stripe via API e
// sincroniza para o schema `stripe.*` (tabelas espelho, não `public.subscriptions`).
// Disparado a cada minuto pelo pg_cron job "stripe-sync-worker" (ver
// docs/OPERACOES-CRON.md), que só chama esta função se não houver uma janela de
// "skip" ativa no Vault (secret `stripe_sync_skip_until`).
//
// Autenticação: Bearer token comparado contra o secret do Vault
// `stripe_sync_worker_secret` (não é o JWT anon/service_role do Supabase).
//
// Só o entrypoint próprio (fim do bundle, ~47k linhas de vendor omitidas —
// mesmo motivo explicado em stripe-webhook/index.ts). Exatamente como está em
// produção:
//
// ----------------------------------------------------------------------------
var dbUrl = Deno.env.get("SUPABASE_DB_URL");
if (!dbUrl) {
  throw new Error("SUPABASE_DB_URL secret not configured");
}
var SYNC_INTERVAL = Number(Deno.env.get("SYNC_INTERVAL")) || 60 * 60 * 24 * 7;
var rateLimit = Number(Deno.env.get("RATE_LIMIT")) || 25;
var workerCount = Number(Deno.env.get("WORKER_COUNT")) || 10;
var schemaName = Deno.env.get("SYNC_SCHEMA_NAME") ?? "stripe";
var syncTablesSchemaName = Deno.env.get("SYNC_TABLES_SCHEMA_NAME") ?? schemaName;
var sql3 = postgres(dbUrl, { max: 1, prepare: false }); // `postgres` = import "npm:postgres"
var stripeSync = await StripeSync.create({
  poolConfig: { connectionString: dbUrl, max: 1 },
  stripeSecretKey: Deno.env.get("STRIPE_SECRET_KEY"),
  enableSigma: false,
  partnerId: "pp_supabase",
  schemaName,
  syncTablesSchemaName
});
var objects = stripeSync.getSupportedSyncObjects();
var tableNames = objects.map(
  (obj) => stripeSync.resourceRegistry[obj].tableName
);
Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }
  const token = authHeader.substring(7);
  const vaultResult = await sql3`
    SELECT decrypted_secret
    FROM vault.decrypted_secrets
    WHERE name = 'stripe_sync_worker_secret'
  `;
  if (vaultResult.length === 0) {
    return new Response("Worker secret not configured in vault", { status: 500 });
  }
  const storedSecret = vaultResult[0].decrypted_secret;
  if (token !== storedSecret) {
    return new Response("Forbidden: Invalid worker secret", { status: 403 });
  }
  const runKey = await stripeSync.reconciliationSync(
    objects,
    tableNames,
    true,
    "edge-worker",
    SYNC_INTERVAL
  );
  if (runKey === null) {
    const activeSkipResult = await sql3`SELECT decrypted_secret::timestamptz::text AS skip_until
      FROM vault.decrypted_secrets
      WHERE name = 'stripe_sync_skip_until'
        AND decrypted_secret::timestamptz >= NOW()
      LIMIT 1`;
    let skipUntil = activeSkipResult[0]?.skip_until;
    if (!skipUntil) {
      skipUntil = new Date(Date.now() + 60 * 60 * 1e3).toISOString();
      await sql3`DELETE FROM vault.secrets WHERE name = 'stripe_sync_skip_until'`;
      await sql3`SELECT vault.create_secret(
        ${skipUntil},
        'stripe_sync_skip_until'
      )`;
    }
    const completedRun = await stripeSync.postgresClient.getCompletedRun(
      stripeSync.accountId,
      SYNC_INTERVAL
    );
    const message = `Skipping resync — a successful run completed at ${completedRun?.runStartedAt.toISOString()} (within ${SYNC_INTERVAL}s window). Cron paused until ${skipUntil}.`;
    console.log(message);
    return new Response(JSON.stringify({ skipped: true, message }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  await stripeSync.postgresClient.resetStuckRunningObjects(runKey.accountId, runKey.runStartedAt, 1);
  const workers = Array.from(
    { length: workerCount },
    () => new StripeSyncWorker(
      stripeSync.stripe,
      stripeSync.config,
      stripeSync.sigma,
      stripeSync.postgresClient,
      stripeSync.accountId,
      stripeSync.resourceRegistry,
      stripeSync.sigmaRegistry,
      runKey,
      stripeSync.upsertAny.bind(stripeSync),
      Infinity,
      rateLimit
    )
  );
  const MAX_EXECUTION_MS = 2e4;
  workers.forEach((worker) => worker.start());
  await Promise.race([
    Promise.all(workers.map((w) => w.waitUntilDone())),
    new Promise((resolve) => setTimeout(resolve, MAX_EXECUTION_MS))
  ]);
  workers.forEach((w) => w.shutdown());
  const totals = await stripeSync.postgresClient.getObjectSyncedCounts(
    stripeSync.accountId,
    runKey.runStartedAt
  );
  const totalSynced = Object.values(totals).reduce(
    (sum, n) => sum + n,
    0
  );
  console.log(`Finished: ${totalSynced} objects synced`, totals);
  return new Response(JSON.stringify({ totals }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
});
// ----------------------------------------------------------------------------
//
// `StripeSync` / `StripeSyncWorker` / `postgres` vêm do bundle vendor — este
// arquivo sozinho NÃO compila/roda fora do bundle completo. Não editar aqui
// esperando refletir em produção.
