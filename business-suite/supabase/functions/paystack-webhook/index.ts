// Supabase Edge Function: paystack-webhook (v12)
// Shared webhook for every product on the site. This repo copy documents
// the KoboDocs Business Suite branches added for Growth; the full deployed
// file also handles pro/business_teams/cooperative_plan/japa_pass/tool_pass/
// school_report_card/event_pass, omitted here for brevity — see the live
// version via Supabase (list_edge_functions / get_edge_function) for the
// complete source, since editing this file does not redeploy it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function hmacSha512Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const bodyText = await req.text();
  const signature = req.headers.get("x-paystack-signature") || "";
  const expected = await hmacSha512Hex(PAYSTACK_SECRET_KEY, bodyText);

  if (signature !== expected) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(bodyText);
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  if (event.event !== "charge.success") {
    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  }

  const { reference, amount, metadata } = event.data;
  const cycleDays = metadata?.billing_cycle === "yearly" ? 365 : 30;

  try {
    // ... other product branches (document payments, pro plan, business
    // teams, cooperative plan, japa pass, tool pass, school report card,
    // event pass) unchanged — see the live function source for those.

    if (metadata?.product === "business_suite") {
      const { data: business } = await supabase
        .from("businesses")
        .select("id, suite_status, suite_expires_at")
        .eq("owner_user_id", metadata.user_id)
        .maybeSingle();

      if (business) {
        const currentExpiry = business.suite_expires_at ? new Date(business.suite_expires_at) : null;
        const base = currentExpiry && currentExpiry > new Date() ? currentExpiry : new Date();
        const newExpiry = new Date(base);
        newExpiry.setDate(newExpiry.getDate() + cycleDays);

        await supabase
          .from("businesses")
          .update({
            suite_status: "active",
            suite_expires_at: newExpiry.toISOString(),
            suite_billing_cycle: metadata.billing_cycle === "yearly" ? "yearly" : "monthly",
          })
          .eq("id", business.id);
      }
    } else if (metadata?.product === "business_suite_growth") {
      // ---- KoboDocs Business Suite Growth tier (init-suite-growth-payment) ----
      // Growth is an upgrade on an existing Business Suite business: flips
      // suite_tier to 'growth' and extends/activates suite access the same
      // way a Starter payment does, so a Growth purchase alone is enough
      // to unlock both the base suite and the Growth-only features.
      const { data: business } = await supabase
        .from("businesses")
        .select("id, suite_status, suite_expires_at")
        .eq("owner_user_id", metadata.user_id)
        .maybeSingle();

      if (business) {
        const currentExpiry = business.suite_expires_at ? new Date(business.suite_expires_at) : null;
        const base = currentExpiry && currentExpiry > new Date() ? currentExpiry : new Date();
        const newExpiry = new Date(base);
        newExpiry.setDate(newExpiry.getDate() + cycleDays);

        await supabase
          .from("businesses")
          .update({
            suite_tier: "growth",
            suite_status: "active",
            suite_expires_at: newExpiry.toISOString(),
            suite_billing_cycle: metadata.billing_cycle === "yearly" ? "yearly" : "monthly",
          })
          .eq("id", business.id);
      }
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
