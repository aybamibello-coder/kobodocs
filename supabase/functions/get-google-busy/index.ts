// Supabase Edge Function: get-google-busy
// Public (called from the anonymous booking page, right alongside the
// existing get_booking_availability_multi RPC). Returns busy blocks pulled
// live from each connected staff member's Google Calendar, in the same
// shape as get_booking_availability_multi, so the client can just
// concatenate the two arrays before computing open slots.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { getValidAccessToken, getFreeBusy, corsHeaders } from "../_shared/google-calendar.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { staff_ids, from, to } = await req.json().catch(() => ({}));
    if (!Array.isArray(staff_ids) || !staff_ids.length || !from || !to) {
      return new Response(JSON.stringify([]), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Skip Google entirely for staff who aren't connected -- avoids
    // unnecessary calls on every slot load for the common case.
    const { data: connected } = await supabaseAdmin
      .from("booking_staff_google_tokens")
      .select("staff_id")
      .in("staff_id", staff_ids)
      .eq("sync_enabled", true);

    const connectedIds: string[] = (connected ?? []).map((r: { staff_id: string }) => r.staff_id);
    if (!connectedIds.length) {
      return new Response(JSON.stringify([]), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results = await Promise.all(
      connectedIds.map(async (staffId) => {
        try {
          const token = await getValidAccessToken(supabaseAdmin, staffId);
          if (!token) return [];
          const busy = await getFreeBusy(token.accessToken, token.calendarId, from, to);
          return busy.map((b) => ({ staff_id: staffId, starts_at: b.start, ends_at: b.end }));
        } catch {
          // A single staff member's Google hiccup shouldn't block the whole
          // slot picker -- fail open for that staff member only.
          return [];
        }
      }),
    );

    return new Response(JSON.stringify(results.flat()), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
