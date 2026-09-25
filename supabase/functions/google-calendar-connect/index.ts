// Supabase Edge Function: google-calendar-connect
// Authenticated (booking page owner). Verifies the caller owns the staff
// member, mints a single-use OAuth state, and returns the Google consent
// URL for the client to open in a popup. Requires GOOGLE_CLIENT_ID /
// GOOGLE_CLIENT_SECRET as Edge Function secrets.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildAuthUrl, corsHeaders } from "../_shared/google-calendar.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { staff_id } = await req.json().catch(() => ({}));
    if (!staff_id) {
      return new Response(JSON.stringify({ error: "staff_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // RLS on booking_staff (owner-scoped) does the ownership check for us --
    // this select only succeeds if the caller owns the page this staff
    // member belongs to.
    const { data: staff, error: staffError } = await supabase
      .from("booking_staff")
      .select("id")
      .eq("id", staff_id)
      .single();

    if (staffError || !staff) {
      return new Response(JSON.stringify({ error: "Staff member not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Opportunistically clear stale states, then mint a fresh one.
    await supabaseAdmin
      .from("booking_google_oauth_states")
      .delete()
      .lt("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());

    const state = crypto.randomUUID();
    const { error: stateError } = await supabaseAdmin
      .from("booking_google_oauth_states")
      .insert({ state, staff_id });

    if (stateError) {
      return new Response(JSON.stringify({ error: "Could not start Google connection." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ url: buildAuthUrl(state) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
