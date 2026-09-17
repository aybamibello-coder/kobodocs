// Supabase Edge Function: send-form-notification
// Called (fire-and-forget) by the public form/survey fill pages right after
// a successful submission. Two independent emails, both optional and
// controlled by the form/survey owner's settings:
//   1. Owner notification -- "someone just responded", with a small
//      answer summary and a link to the responses tab.
//   2. Respondent confirmation -- only sent if the owner enabled it AND
//      the client found an email-type field/question in the answers.
// No auth required (same public-anon pattern as submit-rsvp): the caller
// supplies the slug, not a form/survey id, and this function looks the
// rest up itself with the service role key. Never blocks or breaks
// submission either way -- always returns 200.
//
// Requires RESEND_API_KEY (and optionally RESEND_FROM_ADDRESS) as Edge
// Function secrets -- already configured project-wide for send-welcome-email.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("RESEND_FROM_ADDRESS") ?? "KoboDocs <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error("Resend send failed:", await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("send-form-notification: Resend error:", err);
    return false;
  }
}

function wrap(inner: string): string {
  return `
    <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #FBF7EE; color: #232722;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-weight: 700; font-size: 1.4rem;">KoboDocs</span>
      </div>
      ${inner}
      <p style="font-size: 0.78rem; opacity: 0.5; text-align: center; margin-top: 32px;">
        KoboDocs — built for Nigeria, one Naira at a time.
      </p>
    </div>
  `;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const result = { owner_notified: false, respondent_confirmed: false };

  try {
    const { product, slug, answers, field_labels, respondent_email } = await req.json();

    if (product !== "form" && product !== "survey") return ok(result);
    if (!slug || typeof slug !== "string") return ok(result);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const table = product === "form" ? "forms" : "surveys";

    const { data: item, error: itemErr } = await supabase
      .from(table)
      .select("id, owner_id, title, settings")
      .eq("slug", slug)
      .maybeSingle();

    if (itemErr || !item) return ok(result);

    const settings = item.settings || {};
    const summaryRows = (answers && field_labels)
      ? Object.entries(field_labels)
          .map(([id, label]) => {
            const v = (answers as Record<string, unknown>)[id];
            if (v === null || v === undefined || v === "") return null;
            const display = Array.isArray(v) ? v.join(", ") : (typeof v === "object" ? JSON.stringify(v) : String(v));
            return `<tr><td style="padding:4px 10px 4px 0; opacity:0.6; vertical-align:top; white-space:nowrap;">${label}</td><td style="padding:4px 0;">${display}</td></tr>`;
          })
          .filter(Boolean)
          .join("")
      : "";

    // ---------- Owner notification ----------
    if (settings.notifyOwner !== false) {
      const { data: owner } = await supabase.from("profiles").select("email").eq("id", item.owner_id).maybeSingle();
      if (owner?.email) {
        const dashPath = product === "form" ? `/forms/app/form/?id=${item.id}` : `/survey/app/survey/?id=${item.id}`;
        const html = wrap(`
          <h1 style="font-size:1.3rem; margin-bottom:12px;">New response to "${item.title}"</h1>
          ${summaryRows ? `<table style="font-size:0.88rem; border-collapse:collapse; width:100%;">${summaryRows}</table>` : `<p style="font-size:0.9rem; opacity:0.75;">Someone just submitted a response.</p>`}
          <div style="text-align:center; margin:28px 0;">
            <a href="https://kobodocs.com.ng${dashPath}" style="background:#C79A3C; color:#232722; padding:12px 24px; border-radius:6px; text-decoration:none; font-weight:600; font-size:0.9rem;">View all responses</a>
          </div>
        `);
        result.owner_notified = await sendEmail(owner.email, `New response: ${item.title}`, html);
      }
    }

    // ---------- Respondent confirmation ----------
    if (settings.sendConfirmationEmail && respondent_email && typeof respondent_email === "string" && respondent_email.includes("@")) {
      const heading = settings.confirmationHeading || "Thank you!";
      const message = settings.confirmationMessage || "Your response has been recorded.";
      const html = wrap(`
        <h1 style="font-size:1.3rem; margin-bottom:12px;">${heading}</h1>
        <p style="font-size:0.95rem; line-height:1.6; opacity:0.85;">${message}</p>
      `);
      result.respondent_confirmed = await sendEmail(respondent_email, heading, html);
    }

    return ok(result);
  } catch (err) {
    console.error("send-form-notification error:", err);
    return ok(result);
  }
});
