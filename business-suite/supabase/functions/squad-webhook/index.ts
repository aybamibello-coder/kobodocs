// Supabase Edge Function: squad-webhook
// Replaces paystack-webhook now that Squad (squadco.com) is the sole
// payment processor for KoboDocs. Mirrors paystack-webhook's structure —
// see that function's comment header for why: the *deployed* version of
// that file historically handled every product on the site (document
// payments, pro plan, business_teams, cooperative_plan, japa_pass,
// tool_pass, school_report_card, event_pass, business_suite,
// business_suite_growth), but this repo copy only ever had the
// business_suite / business_suite_growth branches checked in.
//
// IMPORTANT: only the branches present in this repo are ported below.
// Before this replaces paystack-webhook in production, pull the full
// deployed source (Supabase dashboard → Edge Functions → paystack-webhook)
// and port every other product branch across the same way, or those
// products' payments will stop being credited.
//
// Signature verification differs from Paystack:
//   Paystack: header x-paystack-signature, HMAC-SHA512, lowercase hex
//   Squad:    header x-squad-encrypted-body, HMAC-SHA512, UPPERCASE hex
// Docs: https://docs.squadco.com/Payments/webhook-and-redirect-url/signature-validation/

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SQUADCO_SECRET_KEY = Deno.env.get("SQUADCO_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function hmacSha512HexUpper(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const bodyText = await req.text();
  const signature = req.headers.get("x-squad-encrypted-body") || "";
  const expected = await hmacSha512HexUpper(SQUADCO_SECRET_KEY, bodyText);

  if (signature !== expected) {
    return new Response("Invalid signature", { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(bodyText);
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  // Squad's successful-transaction webhook payload nests details under
  // `Body` — see Squad docs for the exact shape used by your dashboard's
  // configured events. Adjust this destructure if your merchant account's
  // payload differs (check a captured sample in Squad dashboard → Logs).
  const data = event.Body ?? event.data ?? event;
  const { transaction_ref, transaction_status, transaction_amount, meta_data } = data;

  if (transaction_status !== "success") {
    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  }

  // metadata comes back as a JSON string from Squad in some payload
  // variants (see meta_data in the Query Transactions sample response) —
  // handle both stringified and already-parsed forms.
  const metadata = typeof meta_data === "string" ? JSON.parse(meta_data) : (meta_data ?? {});
  const cycleDays = metadata?.billing_cycle === "yearly" ? 365 : 30;

  try {
    // ... other product branches (document payments, pro plan, business
    // teams, cooperative plan, japa pass, tool pass, school report card,
    // event pass) need to be ported from the live paystack-webhook source
    // — omitted here, see header comment.

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
