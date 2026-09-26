// Supabase Edge Function: google-calendar-oauth-callback
// Called by /booking/app/google-callback/ right after Google redirects
// back with ?code&state. Exchanges the code for tokens, fetches the
// connected Google account's email, and stores the connection.
// Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET as Edge Function secrets.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REDIRECT_URI = "https://kobodocs.com.ng/booking/app/google-callback/";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { code, state } = await req.json();
    if (!code || !state) {
      return new Response(JSON.stringify({ error: "Missing code or state" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let parsedState: { booking_page_id: string; staff_id: string | null };
    try {
      parsedState = JSON.parse(atob(state));
    } catch {
      return new Response(JSON.stringify({ error: "Invalid state" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: page } = await supabase
      .from("booking_pages")
      .select("owner_id")
      .eq("id", parsedState.booking_page_id)
      .maybeSingle();

    if (!page || page.owner_id !== userData.user.id) {
      return new Response(JSON.stringify({ error: "Not authorized for this booking page" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Exchange the authorization code for tokens.
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.refresh_token) {
      console.error("Google token exchange failed:", tokenData);
      // The most common cause: the user has connected before and Google
      // only issues a refresh_token on the FIRST consent for an app+user
      // pair. prompt=consent (set in google-calendar-auth-url) is meant
      // to force a fresh one every time, but flag this clearly if it
      // still happens.
      return new Response(
        JSON.stringify({ error: tokenData.error_description || "Google did not return a refresh token. Try disconnecting in your Google Account's third-party access settings, then reconnect." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch the connected account's email for display purposes.
    let googleEmail: string | null = null;
    try {
      const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userInfoRes.ok) {
        const userInfo = await userInfoRes.json();
        googleEmail = userInfo.email ?? null;
      }
    } catch (err) {
      console.error("Could not fetch Google userinfo (non-fatal):", err);
    }

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const expiresAt = new Date(Date.now() + (Number(tokenData.expires_in) || 3600) * 1000).toISOString();

    await supabaseAdmin.from("booking_calendar_connections").upsert({
      booking_page_id: parsedState.booking_page_id,
      staff_id: parsedState.staff_id,
      google_email: googleEmail,
      calendar_id: "primary",
      refresh_token: tokenData.refresh_token,
      access_token: tokenData.access_token,
      access_token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: "booking_page_id,staff_id" });

    return new Response(JSON.stringify({ success: true, google_email: googleEmail }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
