// Supabase Edge Function: google-calendar-callback
// Public -- this is where Google's browser redirect lands after the owner
// grants (or denies) calendar access. Consumes the single-use state minted
// by google-calendar-connect, exchanges the code for tokens, and stores
// them against the right staff member. Closes its own popup window.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { exchangeCodeForTokens, fetchGoogleEmail } from "../_shared/google-calendar.ts";

function htmlResponse(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function closePopupHtml(message: string, ok: boolean, pageId?: string | null) {
  const fallback = pageId ? `/booking/app/page/?id=${pageId}&google=${ok ? "connected" : "error"}` : "/booking/app/";
  return `<!doctype html><html><body style="font-family:sans-serif; padding:40px; text-align:center; color:${ok ? "#166534" : "#991b1b"};">
    <p>${message}</p>
    <p style="color:#666; font-size:0.9em;">You can close this window.</p>
    <script>
      try {
        if (window.opener) {
          window.opener.postMessage({ type: 'kobodocs-google-calendar', ok: ${ok} }, '*');
          window.close();
        } else {
          setTimeout(function () { window.location.href = ${JSON.stringify(fallback)}; }, 1500);
        }
      } catch (e) {}
    </script>
  </body></html>`;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (oauthError) {
    return htmlResponse(closePopupHtml("Google Calendar connection was cancelled.", false));
  }
  if (!code || !state) {
    return htmlResponse(closePopupHtml("This connection link is incomplete.", false), 400);
  }

  try {
    const { data: stateRow } = await supabaseAdmin
      .from("booking_google_oauth_states")
      .select("staff_id")
      .eq("state", state)
      .maybeSingle();

    if (!stateRow) {
      return htmlResponse(closePopupHtml("This connection link has expired. Please try again.", false));
    }
    // Single-use: consume immediately.
    await supabaseAdmin.from("booking_google_oauth_states").delete().eq("state", state);

    const staffId = stateRow.staff_id as string;

    const { data: staffRow } = await supabaseAdmin
      .from("booking_staff")
      .select("booking_page_id")
      .eq("id", staffId)
      .maybeSingle();

    const tokens = await exchangeCodeForTokens(code);
    const email = await fetchGoogleEmail(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Google only returns refresh_token on first consent (or with
    // prompt=consent, which we always send) -- but guard anyway so a
    // reconnect never wipes a working refresh token with an empty one.
    const { data: existing } = await supabaseAdmin
      .from("booking_staff_google_tokens")
      .select("refresh_token")
      .eq("staff_id", staffId)
      .maybeSingle();

    const refreshToken = tokens.refresh_token || existing?.refresh_token;
    if (!refreshToken) {
      return htmlResponse(closePopupHtml("Google didn't grant offline access. Please try connecting again.", false));
    }

    await supabaseAdmin.from("booking_staff_google_tokens").upsert({
      staff_id: staffId,
      google_email: email,
      access_token: tokens.access_token,
      refresh_token: refreshToken,
      token_expires_at: expiresAt,
      google_calendar_id: "primary",
      sync_enabled: true,
      updated_at: new Date().toISOString(),
    });

    return htmlResponse(closePopupHtml("Google Calendar connected.", true, staffRow?.booking_page_id ?? null));
  } catch (_err) {
    return htmlResponse(closePopupHtml("Could not connect Google Calendar. Please try again.", false), 500);
  }
});
