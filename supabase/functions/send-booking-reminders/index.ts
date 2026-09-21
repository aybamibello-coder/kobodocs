// Supabase Edge Function: send-booking-reminders
// Cron-triggered (pg_cron, hourly). Finds confirmed bookings starting in
// roughly 24 hours that have an email on file and haven't been reminded
// yet, and emails the customer via Resend. Mirrors the exact pattern
// send-receivable-reminders already uses -- same secrets, same free
// infrastructure (Resend free tier + pg_cron, no new cost).
// Requires RESEND_API_KEY and CRON_SECRET set in Supabase Edge Function secrets.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const cronSecret = req.headers.get("x-cron-secret") ?? "";
  if (cronSecret !== Deno.env.get("CRON_SECRET")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);
  let sentCount = 0;
  let checkedCount = 0;

  try {
    const { data: bookings } = await supabase
      .from("bookings")
      .select("id, customer_name, customer_email, starts_at, cancel_token, booking_page_id, event_type_id")
      .eq("status", "confirmed")
      .is("reminder_sent_at", null)
      .not("customer_email", "is", null)
      .gte("starts_at", windowStart.toISOString())
      .lte("starts_at", windowEnd.toISOString());

    for (const b of bookings ?? []) {
      checkedCount++;
      if (!b.customer_email) continue;

      const { data: page } = await supabase
        .from("booking_pages")
        .select("business_name")
        .eq("id", b.booking_page_id)
        .maybeSingle();
      const { data: eventType } = await supabase
        .from("booking_event_types")
        .select("name")
        .eq("id", b.event_type_id)
        .maybeSingle();

      const businessName = page?.business_name || "your appointment";
      const serviceName = eventType?.name || "Appointment";
      const dt = new Date(b.starts_at);
      const whenText = dt.toLocaleString("en-GB", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" });
      const cancelUrl = `${Deno.env.get("SITE_URL") ?? "https://kobodocs.com.ng"}/booking/cancel/?t=${b.cancel_token}`;

      if (resendKey) {
        const html = `
          <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; background: #FBF7EE; color: #232722;">
            <h1 style="font-size: 1.2rem; margin-bottom: 12px;">Reminder: your appointment is tomorrow</h1>
            <p style="font-size: 0.95rem; line-height: 1.6; opacity: 0.85;">
              Hi ${b.customer_name || "there"}, this is a reminder about your upcoming appointment
              with <strong>${businessName}</strong>:
            </p>
            <p style="font-size: 1rem; line-height: 1.6; margin: 16px 0;">
              <strong>${serviceName}</strong><br>${whenText}
            </p>
            <p style="font-size: 0.85rem; opacity: 0.6;">
              Need to cancel? <a href="${cancelUrl}">Click here</a>.
            </p>
          </div>
        `;

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: Deno.env.get("RESEND_FROM_ADDRESS") ?? "KoboDocs <onboarding@resend.dev>",
            to: [b.customer_email],
            subject: `Reminder: your appointment with ${businessName} is tomorrow`,
            html,
          }),
        });

        await supabase.from("bookings").update({ reminder_sent_at: now.toISOString() }).eq("id", b.id);
        sentCount++;
      }
    }

    return new Response(JSON.stringify({ checked: checkedCount, sent: sentCount }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-booking-reminders error:", err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
