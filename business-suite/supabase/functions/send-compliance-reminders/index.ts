// Supabase Edge Function: send-compliance-reminders
// Cron-triggered (pg_cron, daily). For every business with an active
// Business Suite subscription/trial, finds compliance obligations and
// document renewals due soon or overdue, emails the business owner via
// Resend (max one email per item per day), and logs to
// compliance_reminder_log. Requires RESEND_API_KEY and CRON_SECRET,
// already set as project-wide Edge Function secrets (shared with
// send-receivable-reminders).

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// How many days out (and how many days overdue/expired) we send reminders for.
const UPCOMING_THRESHOLDS = [14, 7, 3, 1, 0];
const OVERDUE_THRESHOLDS = [1, 3, 7, 14, 30];

function daysFromToday(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function shouldRemind(daysUntilDue: number): boolean {
  if (daysUntilDue >= 0) return UPCOMING_THRESHOLDS.includes(daysUntilDue);
  return OVERDUE_THRESHOLDS.includes(-daysUntilDue);
}

function emailShell(business: { name: string }, heading: string, bodyHtml: string): string {
  return `
    <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #FBF7EE; color: #232722;">
      <h1 style="font-size: 1.2rem; margin-bottom: 12px;">${heading}</h1>
      ${bodyHtml}
      <p style="font-size: 0.82rem; opacity: 0.6; margin-top: 24px;">
        Sent by KoboDocs Compliance Tracker for ${business.name}. This is an estimate based on the dates you entered, not legal or tax advice — confirm with your accountant or lawyer.
      </p>
    </div>
  `;
}

async function sendEmail(resendKey: string, fromAddress: string, to: string, subject: string, html: string) {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromAddress, to: [to], subject, html }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const cronSecret = req.headers.get("x-cron-secret") ?? "";
  if (cronSecret !== Deno.env.get("CRON_SECRET")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromAddress = Deno.env.get("RESEND_FROM_ADDRESS") ?? "KoboDocs <onboarding@resend.dev>";
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  let checkedCount = 0;
  let sentCount = 0;

  try {
    const { data: businesses } = await supabase
      .from("businesses")
      .select("id, name, owner_user_id, suite_status, suite_trial_ends_at, suite_expires_at");

    for (const business of businesses ?? []) {
      const trialActive = business.suite_status === "trial" && business.suite_trial_ends_at && new Date(business.suite_trial_ends_at) > now;
      const subActive = business.suite_status === "active" && business.suite_expires_at && new Date(business.suite_expires_at) > now;
      if (!trialActive && !subActive) continue;

      const { data: owner } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", business.owner_user_id)
        .maybeSingle();
      if (!owner?.email || !resendKey) continue;

      // Already-sent-today log, so we never double-email for the same item.
      const { data: sentToday } = await supabase
        .from("compliance_reminder_log")
        .select("obligation_id, compliance_document_id")
        .eq("business_id", business.id)
        .gte("sent_at", todayStart.toISOString());
      const remindedObligations = new Set((sentToday ?? []).map((r) => r.obligation_id).filter(Boolean));
      const remindedDocs = new Set((sentToday ?? []).map((r) => r.compliance_document_id).filter(Boolean));

      const { data: obligations } = await supabase
        .from("compliance_obligations")
        .select("id, title, obligation_type, due_date, status")
        .eq("business_id", business.id)
        .not("status", "in", "(completed,waived)");

      for (const ob of obligations ?? []) {
        checkedCount++;
        if (remindedObligations.has(ob.id)) continue;
        const days = daysFromToday(ob.due_date);
        if (days === null || !shouldRemind(days)) continue;

        const when = days === 0 ? "due today" : days > 0 ? `due in ${days} day(s)` : `${-days} day(s) overdue`;
        const html = emailShell(
          business,
          `Compliance reminder: ${ob.title}`,
          `<p style="font-size: 0.95rem; line-height: 1.6; opacity: 0.85;">"${ob.title}" is ${when} (${new Date(ob.due_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}). Log in to your Compliance Tracker to mark it done or update the date.</p>`
        );
        await sendEmail(resendKey, fromAddress, owner.email, `Compliance reminder: ${ob.title}`, html);
        await supabase.from("compliance_reminder_log").insert({
          business_id: business.id,
          obligation_id: ob.id,
          channel: "email",
          tone: days !== null && days < 0 ? "firm" : "polite",
        });
        sentCount++;
      }

      const { data: documents } = await supabase
        .from("compliance_documents")
        .select("id, name, expiry_date")
        .eq("business_id", business.id)
        .not("expiry_date", "is", null);

      for (const doc of documents ?? []) {
        checkedCount++;
        if (remindedDocs.has(doc.id)) continue;
        const days = daysFromToday(doc.expiry_date);
        if (days === null || !shouldRemind(days)) continue;

        const when = days === 0 ? "expires today" : days > 0 ? `expires in ${days} day(s)` : `expired ${-days} day(s) ago`;
        const html = emailShell(
          business,
          `Renewal reminder: ${doc.name}`,
          `<p style="font-size: 0.95rem; line-height: 1.6; opacity: 0.85;">"${doc.name}" ${when} (${new Date(doc.expiry_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}). Log in to your Compliance Tracker vault to upload a renewed copy.</p>`
        );
        await sendEmail(resendKey, fromAddress, owner.email, `Renewal reminder: ${doc.name}`, html);
        await supabase.from("compliance_reminder_log").insert({
          business_id: business.id,
          compliance_document_id: doc.id,
          channel: "email",
          tone: days !== null && days < 0 ? "firm" : "polite",
        });
        sentCount++;
      }
    }

    return new Response(JSON.stringify({ checked: checkedCount, sent: sentCount }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-compliance-reminders error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
