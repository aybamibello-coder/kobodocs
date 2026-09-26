// Supabase Edge Function: delete-google-calendar-event
// Called fire-and-forget by the public cancel page right after a
// successful cancel_booking(). Looks the booking up server-side by
// cancel_token, removes its Google event if one exists, and clears the
// link on the booking.

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
  const result = { deleted: false };

  try {
    const { cancel_token } = await req.json();
    if (!cancel_token) return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, booking_page_id, staff_id, google_event_id")
      .eq("cancel_token", cancel_token)
      .maybeSingle();

    if (!booking || !booking.google_event_id) {
      return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const connQuery = supabase
      .from("booking_calendar_connections")
      .select("*")
      .eq("booking_page_id", booking.booking_page_id);
    const { data: conn } = await (booking.staff_id ? connQuery.eq("staff_id", booking.staff_id) : connQuery.is("staff_id", null))
      .maybeSingle();

    if (!conn) return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let accessToken = conn.access_token;
    const expiresAt = conn.access_token_expires_at ? new Date(conn.access_token_expires_at) : null;
    if (!accessToken || !expiresAt || expiresAt <= new Date(Date.now() + 60000)) {
      const refreshed = await refreshAccessToken(conn.refresh_token);
      if (!refreshed) return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      accessToken = refreshed.access_token;
      await supabase.from("booking_calendar_connections").update({
        access_token: accessToken,
        access_token_expires_at: new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString(),
      }).eq("id", conn.id);
    }

    const deleteRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.calendar_id)}/events/${encodeURIComponent(booking.google_event_id)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!deleteRes.ok && deleteRes.status !== 404 && deleteRes.status !== 410) {
      console.error("Google events.delete failed:", await deleteRes.text());
      return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await supabase.from("bookings").update({ google_event_id: null }).eq("id", booking.id);
    result.deleted = true;
    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("delete-google-calendar-event error:", err);
    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
