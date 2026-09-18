// Supabase Edge Function: init-survey-payment
// Subscription checkout for KoboDocs Survey (plus/pro/team), monthly
// billing only for now. Requires SQUADCO_SECRET_KEY as an Edge Function secret.

import { createClient } from "jsr:@supabase/supabase-js@2";

const PLAN_PRICE_KOBO: Record<string, number> = {
  plus: 400000,   // ₦4,000
  pro: 1000000,   // ₦10,000
  team: 2000000,  // ₦20,000
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

    const { plan } = await req.json().catch(() => ({}));
    if (!plan || !PLAN_PRICE_KOBO[plan]) {
      return new Response(JSON.stringify({ error: "plan must be one of: plus, pro, team" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const amountKobo = PLAN_PRICE_KOBO[plan];
    const orderReference = `kbd_survey_${crypto.randomUUID()}`;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    await supabaseAdmin.from("payment_intents").insert({
      order_reference: orderReference,
      metadata: {
        user_id: user.id,
        product: "kobodocs_survey",
        plan,
        billing_cycle: "monthly",
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
        callback_url: `${Deno.env.get("SITE_URL") ?? "https://kobodocs.com.ng"}/survey/app/`,
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
