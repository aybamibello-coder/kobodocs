// Supabase Edge Function: google-calendar-auth-url
// Builds the Google OAuth consent URL for a booking page (or a specific
// staff member's calendar) to connect. Keeps GOOGLE_CLIENT_ID out of the
// public JS bundle -- not strictly secret, but this way there's one
// place to change it and the redirect_uri/scope stay server-controlled.
// Requires GOOGLE_CLIENT_ID as an Edge Function secret (already set).

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REDIRECT_URI = "https://kobodocs.com.ng/booking/app/google-callback/";
// userinfo.email is non-sensitive and just lets us show which Google
// account is connected in the dashboard -- calendar.events is the only
// scope that actually reads/writes calendar data.
const SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email";

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

    const { booking_page_id, staff_id } = await req.json();
    if (!booking_page_id) {
      return new Response(JSON.stringify({ error: "booking_page_id is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify the caller actually owns this booking page before handing
    // back a URL that would attach a calendar connection to it.
    const { data: page } = await supabase
      .from("booking_pages")
      .select("owner_id")
      .eq("id", booking_page_id)
      .maybeSingle();

    if (!page || page.owner_id !== userData.user.id) {
      return new Response(JSON.stringify({ error: "Not authorized for this booking page" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const state = btoa(JSON.stringify({ booking_page_id, staff_id: staff_id ?? null }));

    const params = new URLSearchParams({
      client_id: (Deno.env.get("GOOGLE_CLIENT_ID") || "").trim(),
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    });

    return new Response(
      JSON.stringify({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
