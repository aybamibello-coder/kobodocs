// Supabase Edge Function: init-esign-payment
// Two purchase modes:
//   - payg: buy a bundle of pay-as-you-go envelope credits (₦800 each)
//   - subscription: monthly plan (starter/growth) with an envelope allowance
// Requires SQUADCO_SECRET_KEY set in Supabase Edge Function secrets.
//
// NOTE: this file was deployed to production before it was committed to
// the repo (found and mirrored here Sept 2026 while updating the PAYG
// price from ₦500 to ₦800/envelope). If this ever drifts from what's
// actually deployed, the deployed version is the source of truth --
// redeploy this file to resync.

import { createClient } from "jsr:@supabase/supabase-js@2";

const PAYG_UNIT_KOBO = 80000; // ₦800/envelope
const PLANS: Record<string, { allowance: number; monthlyKobo: number; overageKobo: number }> = {
  starter: { allowance: 15, monthlyKobo: 350000, overageKobo: 30000 }, // ₦3,500/mo, ₦300 overage
  growth:  { allowance: 60, monthlyKobo: 900000, overageKobo: 25000 }, // ₦9,000/mo, ₦250 overage
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SQUAD_BASE_URL = "https://api-d.squadco.com";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const user = userData.user;

    const { mode, plan, credit_count } = await req.json();

    let amountKobo: number;
    let metadata: Record<string, unknown>;

    if (mode === "payg") {
      const count = Math.max(1, Number(credit_count) || 1);
      amountKobo = count * PAYG_UNIT_KOBO;
      metadata = { user_id: user.id, product: "esign", mode: "payg", credit_count: count };
    } else if (mode === "subscription" && PLANS[plan]) {
      amountKobo = PLANS[plan].monthlyKobo;
      metadata = { user_id: user.id, product: "esign", mode: "subscription", plan, allowance: PLANS[plan].allowance };
    } else {
      return new Response(JSON.stringify({ error: "mode must be 'payg' (with credit_count) or 'subscription' (with plan: starter/growth)" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const orderReference = `kbd_${crypto.randomUUID()}`;
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    await supabaseAdmin.from("payment_intents").insert({
      order_reference: orderReference,
      metadata,
    });

    const squadRes = await fetch(`${SQUAD_BASE_URL}/transaction/initiate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SQUADCO_SECRET_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        amount: amountKobo,
        currency: "NGN",
        initiate_type: "inline",
        transaction_ref: orderReference,
        callback_url: `${Deno.env.get("SITE_URL") ?? "https://kobodocs.com.ng"}/esign/app/`,
      }),
    });

    const squadData = await squadRes.json();

    if (!squadRes.ok || squadData.status !== 200 || !squadData.data?.checkout_url) {
      return new Response(
        JSON.stringify({ error: squadData.message ?? "Squad initialization failed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        authorization_url: squadData.data.checkout_url,
        reference: squadData.data.transaction_ref ?? orderReference,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
