// Supabase Edge Function: get-google-calendar-busy
// Called (no login required, same public pattern as get_booking_availability)
// by the public booking page to fetch busy blocks from a connected Google
// Calendar, so slots that conflict with the owner's external calendar
// aren't offered. If nothing is connected, returns an empty list --
// KoboDocs' own bookings table is always checked separately regardless.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
        client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) {
      console.error("Google token refresh failed:", await res.text());
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error("Google token refresh threw:", err);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const { booking_page_id, staff_id, from, to } = await req.json();
    if (!booking_page_id || !from || !to) return new Response(JSON.stringify({ busy: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const connQuery = supabase
      .from("booking_calendar_connections")
      .select("*")
      .eq("booking_page_id", booking_page_id);
    const { data: conn } = await (staff_id ? connQuery.eq("staff_id", staff_id) : connQuery.is("staff_id", null))
      .maybeSingle();

    if (!conn) {
      return new Response(JSON.stringify({ busy: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let accessToken = conn.access_token;
    const expiresAt = conn.access_token_expires_at ? new Date(conn.access_token_expires_at) : null;
    if (!accessToken || !expiresAt || expiresAt <= new Date(Date.now() + 60000)) {
      const refreshed = await refreshAccessToken(conn.refresh_token);
      if (!refreshed) return new Response(JSON.stringify({ busy: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      accessToken = refreshed.access_token;
      await supabase.from("booking_calendar_connections").update({
        access_token: accessToken,
        access_token_expires_at: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString(),
      }).eq("id", conn.id);
    }

    const params = new URLSearchParams({
      timeMin: new Date(from).toISOString(),
      timeMax: new Date(to).toISOString(),
      singleEvents: "true",
      showDeleted: "false",
    });
    const eventsRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.calendar_id)}/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!eventsRes.ok) {
      console.error("Google events.list failed:", await eventsRes.text());
      return new Response(JSON.stringify({ busy: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const eventsData = await eventsRes.json();
    const busy = (eventsData.items || [])
      .filter((ev: any) => ev.status !== "cancelled" && ev.transparency !== "transparent" && ev.start?.dateTime && ev.end?.dateTime)
      .map((ev: any) => ({ starts_at: ev.start.dateTime, ends_at: ev.end.dateTime }));

    return new Response(JSON.stringify({ busy }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("get-google-calendar-busy error:", err);
    return new Response(JSON.stringify({ busy: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
