// Resgatado de produção em 2026-07-07 (Onda 1) — fonte da verdade era só o deploy;
// NÃO editar sem re-deployar.
//
// ============================================================================
// ATENÇÃO — isto NÃO é um webhook customizado da Fonte.ia.
// ============================================================================
//
// A Edge Function "stripe-webhook" ativa em produção (projeto pwiuiihsyazghdsrpshg,
// verify_jwt=false, version=6, ~1.08M chars de bundle) é o instalador oficial do
// pacote npm "stripe-experiment-sync" v1.0.31 — nome antigo/deprecated do que hoje
// é o "@supabase/stripe-sync-engine" (https://github.com/stripe/sync-engine),
// distribuído pelo Supabase Dashboard como integração "Stripe Sync Engine" de
// um clique (gera 3 funções: stripe-setup, stripe-webhook, stripe-worker).
//
// O bundle publicado tem ~47.000 linhas: quase tudo é o pacote inteiro
// (StripeSync, StripeSyncWorker, todos os schemas de todas as tabelas Stripe,
// suporte a Sigma/data warehouse, migrations embarcadas, etc.) compilado inline
// pelo `deno bundle` / CLI do Supabase. NÃO reproduzimos esse vendor bundle
// aqui (já existe publicamente no pacote npm e no repo oficial do Stripe) —
// isso seria ruído puro no git, nunca seria lido nem editado por nós.
//
// O que ESTE arquivo contém: só o entrypoint específico (a parte final do
// bundle, marcada no source original como "// src/supabase/edge-functions/
// stripe-webhook.ts"), que é a única peça de configuração "nossa" (qual env var
// usa, qual schema, como decide o status HTTP). Abaixo, exatamente como está em
// produção:
//
// ----------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  const schemaName = Deno.env.get("SYNC_SCHEMA_NAME") ?? "stripe";
  const syncTablesSchemaName = Deno.env.get("SYNC_TABLES_SCHEMA_NAME") ?? schemaName;
  if (!dbUrl) {
    return new Response(JSON.stringify({ error: "SUPABASE_DB_URL not set" }), { status: 500 });
  }
  const stripeSync = await StripeSync.create({
    poolConfig: { connectionString: dbUrl, max: 1 },
    stripeSecretKey: Deno.env.get("STRIPE_SECRET_KEY"),
    partnerId: "pp_supabase",
    schemaName,
    syncTablesSchemaName
  });
  try {
    const rawBody = new Uint8Array(await req.arrayBuffer());
    await stripeSync.webhook.processWebhook(rawBody, sig);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    const err = error;
    console.error("Webhook processing error:", error);
    const isSignatureError = err.message?.includes("signature") || err.type === "StripeSignatureVerificationError";
    const status = isSignatureError ? 400 : 500;
    return new Response(JSON.stringify({ error: err.message }), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  } finally {
    await stripeSync.postgresClient.pool.end();
  }
});
// ----------------------------------------------------------------------------
//
// `StripeSync` acima vem do bundle vendor (import "npm:stripe-experiment-sync"
// / classe StripeSync exportada pelo pacote) — este arquivo sozinho NÃO
// compila/roda fora do bundle completo. Para reproduzir o deploy real,
// reinstale a integração "Stripe Sync Engine" pelo Supabase Dashbolog (Database
// → Integrations) ou rode `npx @supabase/stripe-sync-engine` conforme a doc
// oficial — não tente copiar/colar só este arquivo.
//
// ============================================================================
// ACHADO CRÍTICO (ver relatório da Onda 1 para detalhes completos):
// ============================================================================
//
// Este webhook grava eventos Stripe raw no schema `stripe.*` (tabelas
// stripe.subscriptions, stripe.customers, stripe.checkout_sessions, etc. —
// espelho 1:1 dos objetos da API Stripe). ELE NÃO ESCREVE em `public.subscriptions`,
// que é a tabela que `public.my_plan()` e `public.admin_list_plans()` realmente
// leem para liberar acesso pago. Não existe trigger nem função ligando os dois
// schemas (confirmado via information_schema.triggers em produção).
//
// Em produção, `public.subscriptions` tem HOJE (2026-07-07) uma única linha,
// inserida manualmente (`stripe_subscription_id = 'manual-trial-igoreluisa'`,
// plan_id='pro', status='trialing', criada em 2026-06-20) — ou seja, NENHUM
// pagamento real via Stripe jamais escreveu em `public.subscriptions` em
// produção. O caminho pagamento→acesso (`my_plan()`) está, na prática,
// desconectado do Stripe Sync Engine que roda de fato.
//
// O código de referência que FARIA essa ponte (lendo checkout.session.completed
// / customer.subscription.* e fazendo upsert em `public.subscriptions` com
// plan_id/status/user_id) existe só em `services/stripe-webhook/src/worker.ts`
// (Cloudflare Worker, versionado, NUNCA deployado — confirmado: não há Workers
// de Stripe na Cloudflare da conta). Esse worker.ts é a lógica correta a seguir,
// mas precisa ser portado para uma Edge Function própria (ex.: um 4º endpoint,
// não misturado com o Stripe Sync Engine) e apontado no Stripe Dashboard.
