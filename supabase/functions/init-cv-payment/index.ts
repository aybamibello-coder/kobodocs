// Supabase Edge Function: init-cv-payment
// Sells "clean download" credits for KoboDocs Resume — each credit removes
// the watermark from one PDF download. Users on an active Pro/Business plan
// (checked client-side in resume.js via profiles.plan) never hit this at all;
// this only runs for pay-as-you-go, non-subscriber downloads.
// Requires SQUADCO_SECRET_KEY set in Supabase Edge Function secrets.

import { createClient } from "jsr:@supabase/supabase-js@2";

const CREDIT_PRICE_KOBO = 100000; // ₦1,000 per clean-download credit
const MAX_QTY = 20;

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

    const body = await req.json().catch(() => ({}));
    let creditCount = Number(body.credit_count) || 1;
    if (!Number.isFinite(creditCount) || creditCount < 1) creditCount = 1;
    if (creditCount > MAX_QTY) creditCount = MAX_QTY;

    const amountKobo = CREDIT_PRICE_KOBO * creditCount;
    const orderReference = `kbd_cv_${crypto.randomUUID()}`;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    await supabaseAdmin.from("payment_intents").insert({
      order_reference: orderReference,
      metadata: {
        user_id: user.id,
        product: "cv_builder",
        mode: "payg",
        credit_count: creditCount,
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
        callback_url: `${Deno.env.get("SITE_URL") ?? "https://kobodocs.com.ng"}/resume/app/`,
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
