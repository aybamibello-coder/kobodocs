// Supabase Edge Function: google-calendar-disconnect
// Authenticated (booking page owner). Revokes the token with Google on a
// best-effort basis and always removes the local connection row.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    const { data: page } = await supabase
      .from("booking_pages")
      .select("owner_id")
      .eq("id", booking_page_id)
      .maybeSingle();

    if (!page || page.owner_id !== userData.user.id) {
      return new Response(JSON.stringify({ error: "Not authorized for this booking page" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const connQuery = supabaseAdmin
      .from("booking_calendar_connections")
      .select("id, refresh_token")
      .eq("booking_page_id", booking_page_id);
    const { data: conn } = await (staff_id ? connQuery.eq("staff_id", staff_id) : connQuery.is("staff_id", null))
      .maybeSingle();

    if (conn?.refresh_token) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(conn.refresh_token)}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
      } catch (err) {
        console.error("Google revoke failed (non-fatal):", err);
      }
      await supabaseAdmin.from("booking_calendar_connections").delete().eq("id", conn.id);
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
