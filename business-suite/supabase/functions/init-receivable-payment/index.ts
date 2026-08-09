// Supabase Edge Function: init-receivable-payment
// Subscribes a business to Receivable Manager (standalone AR tracking —
// no Business Suite required). Two tiers — Starter and Growth — each
// billable monthly or yearly (yearly = 10x monthly, i.e. 2 months free).
// Requires SQUADCO_SECRET_KEY set in Supabase Edge Function secrets.

import { createClient } from "jsr:@supabase/supabase-js@2";

const PLANS: Record<string, { monthlyKobo: number; yearlyKobo: number }> = {
  starter: { monthlyKobo: 2000000, yearlyKobo: 20000000 },   // ₦20,000 / ₦200,000
  growth: { monthlyKobo: 3000000, yearlyKobo: 30000000 },    // ₦30,000 / ₦300,000
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

    const { business_id, billing_cycle, plan } = await req.json();
    if (!business_id) {
      return new Response(JSON.stringify({ error: "business_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const planKey = plan === "growth" ? "growth" : "starter";
    const planConfig = PLANS[planKey];

    const { data: business, error: bizErr } = await supabase
      .from("businesses")
      .select("id")
      .eq("id", business_id)
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (bizErr || !business) {
      return new Response(JSON.stringify({ error: "Business not found or not owned by you" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const cycle = billing_cycle === "yearly" ? "yearly" : "monthly";
    const amountKobo = cycle === "yearly" ? planConfig.yearlyKobo : planConfig.monthlyKobo;

    const orderReference = `kbd_${crypto.randomUUID()}`;
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    await supabaseAdmin.from("payment_intents").insert({
      order_reference: orderReference,
      metadata: {
        user_id: user.id,
        product: "receivable_manager",
        business_id,
        plan: planKey,
        billing_cycle: cycle,
      },
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
        callback_url: `${Deno.env.get("SITE_URL") ?? "https://kobodocs.com.ng"}/receivable-manager/app/`,
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
