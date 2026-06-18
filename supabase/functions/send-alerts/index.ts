// Supabase Edge Function: "send-alerts"
// Disparador diário (via pg_cron) dos alertas de prazo por e-mail (Resend).
//
// Busca alertas ativos, ainda não notificados, com prazo entre agora e +3 dias,
// envia o e-mail via Resend e marca notified_at (idempotente — não reenvia).
//
// verify_jwt = TRUE: só o cron (com Authorization) dispara — não é público.
// Secrets (injetados/configurados): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { hasValidBearerSecret } from "../_shared/auth.ts";
import { fetchWithTimeout } from "../_shared/http.ts";

const RESEND_URL = "https://api.resend.com/emails";
const FROM = "Fonte.ia <alertas@olli.com.br>";
const DIAS_ANTES = 3;

interface AlertRow {
  id: string;
  lot_id: string;
  lot_label: string | null;
  edital: string | null;
  proposal_deadline: string | null;
  email: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function fmtPrazo(iso: string | null): string {
  if (!iso) return "(prazo não informado)";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

Deno.serve(async (req: Request) => {
  // OPT-IN: quando ALERTS_CRON_SECRET está configurado, exige o Bearer correspondente.
  // Sem o secret definido (env vazio), o gate é ignorado — cron atual não quebra.
  const cronSecret = Deno.env.get("ALERTS_CRON_SECRET") ?? "";
  if (cronSecret && !hasValidBearerSecret(req, cronSecret)) {
    return json({ ok: false, error: "nao_autorizado" }, 401);
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return json({ ok: false, error: "RESEND_API_KEY ausente" }, 503);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date();
  const limite = new Date(now.getTime() + DIAS_ANTES * 86_400_000);

  const { data, error } = await supabase
    .from("user_alerts")
    .select("id, lot_id, lot_label, edital, proposal_deadline, email")
    .eq("status", "active")
    .is("notified_at", null)
    .gte("proposal_deadline", now.toISOString())
    .lte("proposal_deadline", limite.toISOString())
    .limit(200);

  if (error) return json({ ok: false, error: error.message }, 500);

  const alerts = (data ?? []) as AlertRow[];
  let enviados = 0;
  const erros: Array<{ id: string; detail: string }> = [];

  for (const a of alerts) {
    const titulo = a.lot_label ?? `Lote ${a.lot_id}`;
    const prazo = fmtPrazo(a.proposal_deadline);
    const html = [
      `<div style='font-family:Arial,sans-serif;max-width:520px;margin:0 auto'>`,
      `<h2 style='color:#0B2240'>O prazo deste lote está chegando</h2>`,
      `<p style='font-size:15px;color:#333'><strong>${titulo}</strong></p>`,
      a.edital ? `<p style='color:#555;margin:4px 0'>Edital ${a.edital}</p>` : "",
      `<p style='font-size:15px;color:#333'>Prazo final da proposta: <strong>${prazo}</strong></p>`,
      `<p style='color:#555'>Confira o lote e o edital no portal oficial da Receita Federal antes do encerramento.</p>`,
      `<hr style='border:none;border-top:1px solid #eee;margin:18px 0'>`,
      `<p style='color:#999;font-size:12px'>Você recebeu porque criou um alerta para este lote na Fonte.ia. Mensagem informativa, não é assessoria jurídica ou financeira.</p>`,
      `</div>`,
    ].join("");

    try {
      const res = await fetchWithTimeout(RESEND_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM,
          to: a.email,
          subject: `Prazo chegando — ${titulo}`,
          html,
        }),
      }, 15000);
      if (!res.ok) {
        erros.push({ id: a.id, detail: `resend ${res.status}: ${(await res.text()).slice(0, 200)}` });
        continue;
      }
      const { error: updErr } = await supabase
        .from("user_alerts")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", a.id);
      if (updErr) {
        erros.push({ id: a.id, detail: `update notified_at falhou: ${updErr.message}` });
        continue;
      }
      enviados++;
    } catch (e) {
      erros.push({ id: a.id, detail: String(e) });
    }
  }

  return json({ ok: true, total: alerts.length, enviados, erros });
});
