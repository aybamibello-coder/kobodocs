// Supabase Edge Function: google-calendar-disconnect
// Authenticated (booking page owner). Revokes the token with Google on a
// best-effort basis and always removes the local row.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/google-calendar.ts";

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

    // Ownership check via RLS, same as google-calendar-connect.
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

    const { data: tokenRow } = await supabaseAdmin
      .from("booking_staff_google_tokens")
      .select("refresh_token")
      .eq("staff_id", staff_id)
      .maybeSingle();

    if (tokenRow?.refresh_token) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenRow.refresh_token)}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
      } catch {
        // Best-effort -- still remove the local row even if Google's revoke call fails.
      }
    }

    await supabaseAdmin.from("booking_staff_google_tokens").delete().eq("staff_id", staff_id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
