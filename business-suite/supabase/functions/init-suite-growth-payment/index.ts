// Supabase Edge Function: init-suite-growth-payment
// Called by a logged-in user to upgrade KoboDocs Business Suite to the
// Growth tier (₦28,000/mo or ₦280,000/yr) — Credit & Collections Manager
// + Quotation & Proposal Studio. Mirrors init-suite-payment exactly.
//
// Payment processor: Squad (squadco.com) — replaced Paystack here.
// Docs: https://docs.squadco.com/Payments/initiate-payment/

import { createClient } from "jsr:@supabase/supabase-js@2";

const PRICING: Record<string, number> = {
  monthly: 2800000,
  yearly: 28000000
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    // Growth is an upgrade on top of an existing Business Suite business —
    // require one to already exist (matches the check already done client-side
    // in business-suite.js before this function is ever called).
    const { data: business } = await supabase
      .from("businesses")
      .select("id, suite_status")
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (!business || business.suite_status === "none") {
      return new Response(JSON.stringify({ error: "Start your Business Suite trial first, then upgrade to Growth." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { billing_cycle } = await req.json().catch(() => ({ billing_cycle: "monthly" }));
    const cycle = billing_cycle === "yearly" ? "yearly" : "monthly";
    const amount = PRICING[cycle];

    // Squad wants a unique transaction_ref up front (Paystack generated its
    // own). Prefix keeps it easy to spot in the Squad dashboard/logs.
    const transactionRef = `KDGROWTH${user.id.slice(0, 8)}${Date.now()}`;

    const squadRes = await fetch("https://api-d.squadco.com/transaction/initiate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("SQUADCO_SECRET_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        amount, // already in kobo, matches Squad's lowest-currency-unit requirement
        currency: "NGN",
        initiate_type: "inline",
        transaction_ref: transactionRef,
        callback_url: `${Deno.env.get("SITE_URL") ?? "https://kobodocs.com.ng"}/business-suite/app/credit/`,
        metadata: {
          user_id: user.id,
          product: "business_suite_growth",
          billing_cycle: cycle,
        },
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
      // Field kept as `authorization_url` (not `checkout_url`) so
      // assets/subscribe.js — which reads data.authorization_url and
      // redirects the browser there — needs no changes.
      JSON.stringify({
        authorization_url: squadData.data.checkout_url,
        reference: squadData.data.transaction_ref,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
