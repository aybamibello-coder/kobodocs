// Supabase Edge Function: create-google-calendar-event
// Called fire-and-forget by the public booking page right after a
// successful create_booking(), so a connected staff member's calendar
// shows the appointment automatically. Looks the booking up server-side
// by cancel_token (never trusts booking details from the client) and
// records the created Google event id on the booking so reschedule/cancel
// can find it later. If nothing is connected, this is a silent no-op --
// it never blocks or affects the booking that already succeeded.

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
  const result = { created: false };

  try {
    const { cancel_token } = await req.json();
    if (!cancel_token) return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, booking_page_id, staff_id, event_type_id, customer_name, customer_phone, customer_email, starts_at, ends_at")
      .eq("cancel_token", cancel_token)
      .maybeSingle();

    if (!booking) return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: conn } = await supabase
      .from("booking_calendar_connections")
      .select("*")
      .eq("booking_page_id", booking.booking_page_id)
      .is("staff_id", booking.staff_id ?? null)
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

    const [{ data: page }, { data: eventType }] = await Promise.all([
      supabase.from("booking_pages").select("business_name, settings").eq("id", booking.booking_page_id).maybeSingle(),
      supabase.from("booking_event_types").select("name").eq("id", booking.event_type_id).maybeSingle(),
    ]);

    const timeZone = page?.settings?.timezone || "Africa/Lagos";
    const descriptionLines = [
      `Booked via ${page?.business_name || "KoboDocs Booking"}.`,
      booking.customer_phone ? `Phone: ${booking.customer_phone}` : null,
      booking.customer_email ? `Email: ${booking.customer_email}` : null,
    ].filter(Boolean);

    const eventBody = {
      summary: `${eventType?.name || "Appointment"} — ${booking.customer_name || "Customer"}`,
      description: descriptionLines.join("\n"),
      start: { dateTime: new Date(booking.starts_at).toISOString(), timeZone },
      end: { dateTime: new Date(booking.ends_at).toISOString(), timeZone },
      attendees: booking.customer_email ? [{ email: booking.customer_email }] : undefined,
    };

    const insertRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.calendar_id)}/events`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(eventBody),
      }
    );

    if (!insertRes.ok) {
      console.error("Google events.insert failed:", await insertRes.text());
      return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const created = await insertRes.json();
    await supabase.from("bookings").update({ google_event_id: created.id }).eq("id", booking.id);

    result.created = true;
    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("create-google-calendar-event error:", err);
    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
