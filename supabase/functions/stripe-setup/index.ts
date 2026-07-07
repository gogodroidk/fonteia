// Resgatado de produção em 2026-07-07 (Onda 1) — fonte da verdade era só o deploy;
// NÃO editar sem re-deployar.
//
// Mesma origem/natureza de supabase/functions/stripe-webhook/index.ts (ver o
// cabeçalho lá para o contexto completo): esta função faz parte do instalador
// oficial do pacote "stripe-experiment-sync" v1.0.31 (= @supabase/stripe-sync-engine),
// integração "Stripe Sync Engine" de um clique do Supabase Dashboard.
// verify_jwt=false, version=6 em produção.
//
// Esta é a função de SETUP/STATUS/UNINSTALL da integração:
//   GET    -> status da instalação (versão do pacote, sync_runs recentes)
//   POST   -> roda as migrations embarcadas no schema `stripe.*`, cria/atualiza
//             o "managed webhook" no Stripe apontando para
//             {SUPABASE_URL}/functions/v1/stripe-webhook
//   DELETE -> desinstala tudo: remove o webhook do lado do Stripe, desagenda os
//             pg_cron jobs "stripe-sync-worker"/"stripe-sigma-worker", apaga os
//             secrets do Vault, dropa o schema `stripe` inteiro (CASCADE) e
//             deleta as 4 Edge Functions (stripe-setup, stripe-webhook,
//             stripe-worker, sigma-data-worker) via Management API.
//
// Autenticação: Bearer <access_token> = token de management API do Supabase
// (usado pelo próprio Dashboard ao clicar "Configure"/"Uninstall" na integração),
// NÃO é o JWT do usuário final nem o anon/service_role key do projeto.
//
// Só o entrypoint próprio (fim do bundle, ~48k linhas de vendor omitidas —
// mesmo motivo explicado em stripe-webhook/index.ts). Exatamente como está em
// produção:
//
// ----------------------------------------------------------------------------
var MGMT_API_BASE_RAW = Deno.env.get("MANAGEMENT_API_URL") || "https://api.supabase.com";
var MGMT_API_BASE = MGMT_API_BASE_RAW.match(/^https?:\/\//) ? MGMT_API_BASE_RAW : `https://${MGMT_API_BASE_RAW}`;

async function deleteEdgeFunction(projectRef, functionSlug, accessToken) {
  const url = `${MGMT_API_BASE}/v1/projects/${projectRef}/functions/${functionSlug}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    }
  });
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(`Failed to delete function ${functionSlug}: ${response.status} ${text}`);
  }
}

async function deleteSecret(projectRef, secretName, accessToken) {
  const url = `${MGMT_API_BASE}/v1/projects/${projectRef}/secrets`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify([secretName])
  });
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    console.warn(`Failed to delete secret ${secretName}: ${response.status} ${text}`);
  }
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    return new Response(JSON.stringify({ error: "SUPABASE_URL not set" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }
  const accessToken = authHeader.substring(7);

  if (req.method === "GET") {
    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!dbUrl) {
      return new Response(JSON.stringify({ error: "SUPABASE_DB_URL not set" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    let sql3;
    try {
      sql3 = postgres(dbUrl, { max: 1, prepare: false }); // `postgres` = import "npm:postgres"
      const schemaName = Deno.env.get("SYNC_SCHEMA_NAME") ?? "stripe";
      const commentResult = await sql3`
        SELECT obj_description(oid, 'pg_namespace') as comment
        FROM pg_namespace
        WHERE nspname = ${schemaName}
      `;
      const comment = commentResult[0]?.comment || null;
      let syncStatus = [];
      if (comment) {
        try {
          const syncSchema = Deno.env.get("SYNC_TABLES_SCHEMA_NAME") ?? schemaName;
          const safeSchema = syncSchema.replace(/"/g, '""');
          syncStatus = await sql3.unsafe(`
            SELECT DISTINCT ON (account_id)
              account_id, started_at, closed_at, status, error_message,
              total_processed, total_objects, complete_count, error_count,
              running_count, pending_count, triggered_by, max_concurrent
            FROM "${safeSchema}"."sync_runs"
            ORDER BY account_id, started_at DESC
          `);
        } catch (err) {
          console.warn("sync_runs query failed (may not exist yet):", err);
        }
      }
      const parsedComment = parseSchemaComment(comment);
      return new Response(
        JSON.stringify({
          package_version: VERSION,
          installation_status: parsedComment.status,
          sync_status: syncStatus
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache, no-store, must-revalidate"
          }
        }
      );
    } catch (error) {
      const err = error;
      console.error("Status query error:", error);
      return new Response(
        JSON.stringify({
          error: err.message,
          package_version: VERSION,
          installation_status: "not_installed"
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    } finally {
      if (sql3) await sql3.end();
    }
  }

  if (req.method === "DELETE") {
    let stripeSync2 = null;
    try {
      const dbUrl = Deno.env.get("SUPABASE_DB_URL");
      if (!dbUrl) {
        throw new Error("SUPABASE_DB_URL environment variable is not set");
      }
      const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (!stripeKey) {
        throw new Error("STRIPE_SECRET_KEY environment variable is required for uninstall");
      }
      const schemaName = Deno.env.get("SYNC_SCHEMA_NAME") ?? "stripe";
      const syncTablesSchemaName = Deno.env.get("SYNC_TABLES_SCHEMA_NAME") ?? schemaName;
      stripeSync2 = await StripeSync.create({
        poolConfig: { connectionString: dbUrl, max: 2 },
        stripeSecretKey: stripeKey,
        schemaName,
        syncTablesSchemaName
      });
      try {
        const webhooks = await stripeSync2.webhook.listManagedWebhooks();
        for (const webhook of webhooks) {
          try {
            await stripeSync2.webhook.deleteManagedWebhook(webhook.id);
            console.log(`Deleted webhook: ${webhook.id}`);
          } catch (err) {
            console.warn(`Could not delete webhook ${webhook.id}:`, err);
          }
        }
      } catch (err) {
        console.warn(`Could not get webooks:`, err);
      }
      try {
        await stripeSync2.postgresClient.query(`
          DO $$
          BEGIN
            IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stripe-sync-worker') THEN
              PERFORM cron.unschedule('stripe-sync-worker');
            END IF;
            IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stripe-sigma-worker') THEN
              PERFORM cron.unschedule('stripe-sigma-worker');
            END IF;
          END $$;
        `);
      } catch (err) {
        console.warn("Could not unschedule pg_cron job:", err);
      }
      try {
        await stripeSync2.postgresClient.query(`
          DELETE FROM vault.secrets
          WHERE name IN ('stripe_sync_worker_secret', 'stripe_sigma_worker_secret')
        `);
      } catch (err) {
        console.warn("Could not delete vault secret:", err);
      }
      try {
        const dropSchema = syncTablesSchemaName.replace(/"/g, '""');
        await stripeSync2.postgresClient.query(
          `DROP FUNCTION IF EXISTS "${dropSchema}".trigger_sigma_worker()`
        );
      } catch (err) {
        console.warn("Could not drop sigma trigger function:", err);
      }
      try {
        await stripeSync2.postgresClient.query(
          `SELECT pg_terminate_backend(pid)
           FROM pg_locks l
           JOIN pg_class c ON l.relation = c.oid
           JOIN pg_namespace n ON c.relnamespace = n.oid
           WHERE n.nspname = $1 AND l.pid != pg_backend_pid()`,
          [syncTablesSchemaName]
        );
      } catch (err) {
        console.warn("Could not terminate connections:", err);
      }
      const schemasToDrop = [...new Set([schemaName, syncTablesSchemaName])];
      let dropAttempts = 0;
      const maxAttempts = 3;
      while (dropAttempts < maxAttempts) {
        try {
          for (const s of schemasToDrop) {
            const safe = s.replace(/"/g, '""');
            await stripeSync2.postgresClient.query(`DROP SCHEMA IF EXISTS "${safe}" CASCADE`);
          }
          break;
        } catch (err) {
          const error = err;
          dropAttempts++;
          if (dropAttempts >= maxAttempts) {
            throw new Error(
              `Failed to drop schema after ${maxAttempts} attempts. There may be active connections or locks on the stripe schema. Error: ${error.message}`
            );
          }
          await new Promise((resolve) => setTimeout(resolve, 1e3));
        }
      }
      await stripeSync2.postgresClient.pool.end();
      try {
        await deleteSecret(projectRef, "STRIPE_SECRET_KEY", accessToken);
      } catch (err) {
        console.warn("Could not delete STRIPE_SECRET_KEY secret:", err);
      }
      try {
        await deleteSecret(projectRef, "MANAGEMENT_API_URL", accessToken);
      } catch (err) {
        console.warn("Could not delete MANAGEMENT_API_URL secret:", err);
      }
      try {
        await deleteSecret(projectRef, "ENABLE_SIGMA", accessToken);
      } catch (err) {
        console.warn("Could not delete ENABLE_SIGMA secret:", err);
      }
      try {
        await deleteEdgeFunction(projectRef, "stripe-setup", accessToken);
      } catch (err) {
        console.warn("Could not delete stripe-setup function:", err);
      }
      try {
        await deleteEdgeFunction(projectRef, "stripe-webhook", accessToken);
      } catch (err) {
        console.warn("Could not delete stripe-webhook function:", err);
      }
      try {
        await deleteEdgeFunction(projectRef, "stripe-worker", accessToken);
      } catch (err) {
        console.warn("Could not delete stripe-worker function:", err);
      }
      try {
        await deleteEdgeFunction(projectRef, "sigma-data-worker", accessToken);
      } catch (err) {
        console.warn("Could not delete sigma-data-worker function:", err);
      }
      return new Response(
        JSON.stringify({
          success: true,
          message: "Uninstall complete"
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    } catch (error) {
      const err = error;
      console.error("Uninstall error:", error);
      if (stripeSync2) {
        try {
          await stripeSync2.postgresClient.pool.end();
        } catch (cleanupErr) {
          console.warn("Cleanup failed:", cleanupErr);
        }
      }
      return new Response(JSON.stringify({ success: false, error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  let stripeSync = null;
  try {
    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!dbUrl) {
      throw new Error("SUPABASE_DB_URL environment variable is not set");
    }
    const enableSigma = (Deno.env.get("ENABLE_SIGMA") ?? "false") === "true";
    const schemaName = Deno.env.get("SYNC_SCHEMA_NAME") ?? "stripe";
    const syncTablesSchemaName = Deno.env.get("SYNC_TABLES_SCHEMA_NAME") ?? schemaName;
    await runMigrationsFromContent(
      {
        databaseUrl: dbUrl,
        enableSigma,
        stripeApiVersion: Deno.env.get("STRIPE_API_VERSION") ?? "2020-08-27",
        schemaName,
        syncTablesSchemaName
      },
      embeddedMigrations
    );
    stripeSync = await StripeSync.create({
      poolConfig: { connectionString: dbUrl, max: 2 }, // Need 2 for advisory lock + queries
      stripeSecretKey: Deno.env.get("STRIPE_SECRET_KEY"),
      schemaName,
      syncTablesSchemaName
    });
    await stripeSync.postgresClient.query("SELECT pg_advisory_unlock_all()");
    const supabaseUrl2 = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl2) {
      throw new Error("SUPABASE_URL environment variable is not set");
    }
    const webhookUrl = `${supabaseUrl2}/functions/v1/stripe-webhook`;
    const webhook = await stripeSync.webhook.findOrCreateManagedWebhook(webhookUrl);
    await stripeSync.postgresClient.pool.end();
    return new Response(
      JSON.stringify({
        success: true,
        message: "Setup complete",
        webhookId: webhook.id
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );
  } catch (error) {
    const err = error;
    console.error("Setup error:", error);
    if (stripeSync) {
      try {
        await stripeSync.postgresClient.query("SELECT pg_advisory_unlock_all()");
        await stripeSync.postgresClient.pool.end();
      } catch (cleanupErr) {
        console.warn("Cleanup failed:", cleanupErr);
      }
    }
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
// ----------------------------------------------------------------------------
//
// `StripeSync`, `runMigrationsFromContent`, `embeddedMigrations`, `VERSION`,
// `parseSchemaComment`, `postgres` vêm do bundle vendor — este arquivo sozinho
// NÃO compila/roda fora do bundle completo. O DELETE acima é DESTRUTIVO (dropa
// o schema `stripe` inteiro com CASCADE) — nunca chamar em produção sem
// confirmação explícita do dono.
