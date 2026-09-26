// Supabase Edge Function: update-google-calendar-event
// Called fire-and-forget by the public reschedule page right after a
// successful reschedule_booking(). Looks the booking up server-side by
// cancel_token and moves its Google event to the new time. If the booking
// never had a Google event (nothing was connected when it was created,
// or the event failed to create), this creates one instead so a
// since-connected calendar still ends up in sync.

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
  const result = { updated: false };

  try {
    const { cancel_token } = await req.json();
    if (!cancel_token) return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: booking } = await supabase
      .from("bookings")
      .select("id, booking_page_id, staff_id, event_type_id, customer_name, customer_phone, customer_email, starts_at, ends_at, google_event_id")
      .eq("cancel_token", cancel_token)
      .maybeSingle();

    if (!booking) return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

    if (booking.google_event_id) {
      const patchRes = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.calendar_id)}/events/${encodeURIComponent(booking.google_event_id)}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(eventBody),
        }
      );
      // 404/410 -- the event is gone on Google's side; fall through and create a fresh one instead.
      if (patchRes.ok) {
        result.updated = true;
        return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (patchRes.status !== 404 && patchRes.status !== 410) {
        console.error("Google events.patch failed:", await patchRes.text());
        return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const insertRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(conn.calendar_id)}/events`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify(eventBody),
      }
    );
    if (!insertRes.ok) {
      console.error("Google events.insert (fallback) failed:", await insertRes.text());
      return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const created = await insertRes.json();
    await supabase.from("bookings").update({ google_event_id: created.id }).eq("id", booking.id);

    result.updated = true;
    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("update-google-calendar-event error:", err);
    return new Response(JSON.stringify(result), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
