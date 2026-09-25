// Supabase Edge Function: sync-booking-to-google
// Public, fire-and-forget -- invoked from the client right after
// create_booking / reschedule_booking / cancel_booking succeed, the same
// way send-form-notification already is. Keyed by cancel_token (not
// booking_id) to match every other post-booking action in this app.
// Non-critical: a failure here never blocks the customer's booking flow.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { getValidAccessToken, createEvent, updateEvent, deleteEvent, corsHeaders } from "../_shared/google-calendar.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { cancel_token, action } = await req.json().catch(() => ({}));
    if (!cancel_token || !["create", "update", "cancel"].includes(action)) {
      return new Response(JSON.stringify({ error: "cancel_token and a valid action are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: booking } = await supabaseAdmin
      .from("bookings")
      .select("id, booking_page_id, event_type_id, staff_id, customer_name, customer_phone, customer_email, starts_at, ends_at, status, google_event_id")
      .eq("cancel_token", cancel_token)
      .maybeSingle();

    if (!booking) {
      return new Response(JSON.stringify({ success: true, skipped: "booking_not_found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // No staff assigned (page-level default-hours, single-staff case) --
    // nothing to sync to.
    if (!booking.staff_id) {
      return new Response(JSON.stringify({ success: true, skipped: "no_staff" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await getValidAccessToken(supabaseAdmin, booking.staff_id);
    if (!token) {
      return new Response(JSON.stringify({ success: true, skipped: "not_connected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cancel: remove the Google event if one exists, then clear the link.
    if (action === "cancel") {
      if (booking.google_event_id) {
        await deleteEvent(token.accessToken, token.calendarId, booking.google_event_id);
        await supabaseAdmin.from("bookings").update({ google_event_id: null }).eq("id", booking.id);
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: page }, { data: eventType }] = await Promise.all([
      supabaseAdmin.from("booking_pages").select("business_name, settings").eq("id", booking.booking_page_id).single(),
      supabaseAdmin.from("booking_event_types").select("name").eq("id", booking.event_type_id).single(),
    ]);

    const timeZone = page?.settings?.timezone || "Africa/Lagos";
    const descriptionLines = [
      `Booked via ${page?.business_name || "KoboDocs Booking"}.`,
      booking.customer_phone ? `Phone: ${booking.customer_phone}` : null,
      booking.customer_email ? `Email: ${booking.customer_email}` : null,
    ].filter(Boolean);

    const eventInput = {
      summary: `${eventType?.name || "Appointment"} — ${booking.customer_name}`,
      description: descriptionLines.join("\n"),
      startIso: booking.starts_at,
      endIso: booking.ends_at,
      timeZone,
      attendeeEmail: booking.customer_email || null,
    };

    if (action === "update" && booking.google_event_id) {
      await updateEvent(token.accessToken, token.calendarId, booking.google_event_id, eventInput);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // create, or an update where no event exists yet (e.g. staff was
    // connected after the original booking was made).
    const googleEventId = await createEvent(token.accessToken, token.calendarId, eventInput);
    await supabaseAdmin.from("bookings").update({ google_event_id: googleEventId }).eq("id", booking.id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    // Non-critical by design -- log-shaped response, never a thrown 500
    // that would surface as a broken booking to the customer.
    return new Response(JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Unexpected error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
