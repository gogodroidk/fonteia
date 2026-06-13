// Supabase Edge Function: "send-alerts"
// Envia alertas de prazo por e-mail via Resend para usuários que cadastraram
// um alerta e cujo lote tem prazo chegando em até 3 dias (e ainda no futuro).
//
// Projetada para rodar via pg_cron 1x/dia (ex.: 8h BRT = 11h UTC).
// Idempotente: marca notified_at após cada envio bem-sucedido — re-rodar não duplica.
//
// Secrets necessários (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY          obrigatório (resend.com → API Keys)
//   SUPABASE_URL            injetado automaticamente
//   SUPABASE_SERVICE_ROLE_KEY injetado automaticamente
//
// Deploy: Edge Functions → Create function "send-alerts" → cole este arquivo → Deploy.
// Pode manter Verify JWT LIGADO; o cron manda Authorization automaticamente.
//
// API Resend confirmada: POST https://api.resend.com/emails
// Fonte: https://resend.com/docs/api-reference/emails/send-email (consultado 2026-06-13)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// ─── Config ──────────────────────────────────────────────────────────────────

// Alertas com prazo até AHEAD_DAYS dias a partir de agora serão notificados.
const AHEAD_DAYS = 3;
const RESEND_ENDPOINT = "https://api.resend.com/emails";
// Remetente verificado no Resend (domínio fontebrasil.online já configurado).
const FROM_ADDRESS = "Fonte.ia <alertas@fontebrasil.online>";

// ─── Types ───────────────────────────────────────────────────────────────────

interface UserAlert {
  id: string;
  user_id: string;
  lot_id: string;
  lot_label: string | null;
  edital: string | null;
  proposal_deadline: string | null;
  email: string;
  channel: string;
}

interface SendResult {
  alertId: string;
  email: string;
  ok: boolean;
  resendId?: string;
  error?: string;
}

// ─── E-mail helpers ───────────────────────────────────────────────────────────

function formatDeadlinePtBR(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

function buildEmailHtml(alert: UserAlert): string {
  const label = alert.lot_label ?? `Lote ${alert.lot_id}`;
  const edital = alert.edital ? ` (Edital ${alert.edital})` : "";
  const deadlineFormatted = alert.proposal_deadline
    ? formatDeadlinePtBR(alert.proposal_deadline)
    : "em breve";
  const days = alert.proposal_deadline ? daysUntil(alert.proposal_deadline) : null;
  const urgenciaTexto =
    days !== null
      ? days <= 1
        ? "O prazo vence <strong>amanhã</strong>!"
        : `Faltam apenas <strong>${days} dias</strong>.`
      : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Alerta de prazo — Fonte.ia</title>
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:560px;background:#ffffff;border-radius:12px;
                      box-shadow:0 2px 12px rgba(0,0,0,.08);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:#0b2240;padding:24px 32px;">
              <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-.02em;">
                Fonte.ia
              </span>
              <span style="color:#5ba3ff;font-size:13px;font-weight:600;margin-left:10px;">
                by Olli
              </span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 32px 24px;">
              <p style="margin:0 0 8px;font-size:13px;color:#6b7280;text-transform:uppercase;
                         letter-spacing:.06em;font-weight:700;">
                Alerta de prazo
              </p>
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:800;color:#0b2240;
                          line-height:1.25;">
                O prazo de um lote que você acompanha está chegando
              </h1>
              <div style="background:#f0f9f5;border-left:4px solid #0b6048;
                          border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
                <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#0b2240;">
                  ${label}${edital}
                </p>
                <p style="margin:0;font-size:14px;color:#374151;">
                  Prazo final: <strong>${deadlineFormatted}</strong>
                </p>
                ${urgenciaTexto ? `<p style="margin:10px 0 0;font-size:13.5px;color:#b45309;">${urgenciaTexto}</p>` : ""}
              </div>
              <p style="margin:0 0 24px;font-size:14px;color:#4b5563;line-height:1.6;">
                Confira o edital oficial antes de propor. O prazo é contado pela
                Receita Federal — chegue com antecedência para evitar imprevistos.
              </p>
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="background:#0b2240;border-radius:8px;">
                    <a href="https://fontebrasil.online/leiloes"
                       style="display:inline-block;padding:14px 28px;color:#ffffff;
                              font-size:14px;font-weight:700;text-decoration:none;">
                      Ver lote na Fonte.ia →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px 28px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:11.5px;color:#9ca3af;line-height:1.6;">
                Você recebeu este e-mail porque cadastrou um alerta na Fonte.ia.
                Para cancelar, acesse <a href="https://fontebrasil.online/alertas"
                style="color:#6b7280;">fontebrasil.online/alertas</a> e remova o alerta.<br />
                Fonte.ia by Olli · Dados públicos oficiais · Não constitui assessoria jurídica ou financeira.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildEmailText(alert: UserAlert): string {
  const label = alert.lot_label ?? `Lote ${alert.lot_id}`;
  const edital = alert.edital ? ` (Edital ${alert.edital})` : "";
  const deadlineFormatted = alert.proposal_deadline
    ? formatDeadlinePtBR(alert.proposal_deadline)
    : "em breve";
  const days = alert.proposal_deadline ? daysUntil(alert.proposal_deadline) : null;
  return [
    "Fonte.ia — Alerta de prazo",
    "",
    `Lote: ${label}${edital}`,
    `Prazo final: ${deadlineFormatted}`,
    days !== null ? `Dias restantes: ${days}` : "",
    "",
    "Acesse: https://fontebrasil.online/leiloes",
    "",
    "Para cancelar este alerta: https://fontebrasil.online/alertas",
    "Fonte.ia by Olli — dados públicos oficiais. Não constitui assessoria jurídica ou financeira.",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

// ─── Resend sender ───────────────────────────────────────────────────────────

async function sendViaResend(
  resendKey: string,
  alert: UserAlert,
): Promise<{ ok: true; resendId: string } | { ok: false; error: string }> {
  const label = alert.lot_label ?? `Lote ${alert.lot_id}`;
  const edital = alert.edital ? ` — Edital ${alert.edital}` : "";
  const days = alert.proposal_deadline ? daysUntil(alert.proposal_deadline) : null;
  const urgencia = days !== null && days <= 1 ? " ⚠ URGENTE" : "";

  const subject = `[Fonte.ia] Prazo se aproximando: ${label}${edital}${urgencia}`;

  let resp: Response;
  try {
    resp = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [alert.email],
        subject,
        html: buildEmailHtml(alert),
        text: buildEmailText(alert),
        tags: [
          { name: "source", value: "send-alerts" },
          { name: "lot_id", value: alert.lot_id.slice(0, 64) },
        ],
      }),
    });
  } catch (err) {
    return { ok: false, error: `fetch error: ${String(err)}` };
  }

  if (resp.ok) {
    interface ResendOk { id: string }
    const data = (await resp.json()) as ResendOk;
    return { ok: true, resendId: data.id };
  }

  let errorBody = "";
  try {
    errorBody = JSON.stringify(await resp.json());
  } catch {
    errorBody = await resp.text();
  }
  return { ok: false, error: `Resend ${resp.status}: ${errorBody}` };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (_request: Request): Promise<Response> => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey   = Deno.env.get("RESEND_API_KEY");

  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ ok: false, error: "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados." }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
  if (!resendKey) {
    return new Response(
      JSON.stringify({ ok: false, error: "RESEND_API_KEY não configurado. Configure em Edge Functions → Secrets." }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Busca alertas ativos, ainda não notificados, com prazo nos próximos AHEAD_DAYS dias
  // e que ainda não venceram.
  const now        = new Date();
  const cutoff     = new Date(now.getTime() + AHEAD_DAYS * 86_400_000);
  const nowIso     = now.toISOString();
  const cutoffIso  = cutoff.toISOString();

  const { data: alerts, error: fetchErr } = await supabase
    .from("user_alerts")
    .select("id, user_id, lot_id, lot_label, edital, proposal_deadline, email, channel")
    .eq("status", "active")
    .is("notified_at", null)
    .gte("proposal_deadline", nowIso)    // ainda no futuro
    .lte("proposal_deadline", cutoffIso) // dentro da janela de 3 dias
    .limit(200);                         // proteção contra volume inesperado

  if (fetchErr) {
    console.error("[send-alerts] erro ao buscar alertas:", fetchErr.message);
    return new Response(
      JSON.stringify({ ok: false, error: fetchErr.message }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  const rows = (alerts ?? []) as UserAlert[];
  if (rows.length === 0) {
    console.log("[send-alerts] nenhum alerta pendente para enviar.");
    return new Response(
      JSON.stringify({ ok: true, enviados: 0, erros: 0 }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  const results: SendResult[] = [];

  for (const alert of rows) {
    // Apenas e-mail por enquanto (outros canais futuros podem ser adicionados aqui).
    if (alert.channel !== "email") {
      results.push({ alertId: alert.id, email: alert.email, ok: false, error: "canal não suportado" });
      continue;
    }

    let sendResult: Awaited<ReturnType<typeof sendViaResend>>;
    try {
      sendResult = await sendViaResend(resendKey, alert);
    } catch (err) {
      const errMsg = `exceção inesperada: ${String(err)}`;
      console.error(`[send-alerts] alerta ${alert.id}:`, errMsg);
      results.push({ alertId: alert.id, email: alert.email, ok: false, error: errMsg });
      continue;
    }

    if (sendResult.ok) {
      // Marca notified_at — idempotente: não reenvia mesmo que a função rode de novo.
      const { error: updateErr } = await supabase
        .from("user_alerts")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", alert.id);

      if (updateErr) {
        // E-mail saiu mas o mark falhou — loga, mas não trata como erro de envio.
        console.error(`[send-alerts] falha ao marcar notified_at para ${alert.id}:`, updateErr.message);
      }

      console.log(`[send-alerts] ✓ enviado para ${alert.email} (resendId=${sendResult.resendId})`);
      results.push({ alertId: alert.id, email: alert.email, ok: true, resendId: sendResult.resendId });
    } else {
      console.error(`[send-alerts] ✗ falha no envio para ${alert.email}:`, sendResult.error);
      results.push({ alertId: alert.id, email: alert.email, ok: false, error: sendResult.error });
    }
  }

  const enviados = results.filter((r) => r.ok).length;
  const erros    = results.filter((r) => !r.ok).length;

  console.log(`[send-alerts] concluído: ${enviados} enviados, ${erros} erros de ${rows.length} alertas.`);

  return new Response(
    JSON.stringify({ ok: true, enviados, erros, total: rows.length, results }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
});
