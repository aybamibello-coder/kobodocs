// Shared helper for KoboDocs Booking's Google Calendar sync.
// Used by: google-calendar-connect, google-calendar-callback,
// google-calendar-disconnect, get-google-busy, sync-booking-to-google.
//
// Requires GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET as Edge Function secrets
// (already set by the project owner).

export const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
export const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

export function callbackRedirectUri(): string {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  return `${supabaseUrl}/functions/v1/google-calendar-callback`;
}

export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: callbackRedirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: callbackRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`token_exchange_failed: ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`token_refresh_failed: ${await res.text()}`);
  return res.json();
}

export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.email ?? null;
}

// deno-lint-ignore no-explicit-any
export async function getValidAccessToken(supabaseAdmin: any, staffId: string): Promise<{
  accessToken: string;
  calendarId: string;
} | null> {
  const { data: row } = await supabaseAdmin
    .from("booking_staff_google_tokens")
    .select("access_token, refresh_token, token_expires_at, google_calendar_id, sync_enabled")
    .eq("staff_id", staffId)
    .maybeSingle();

  if (!row || !row.sync_enabled) return null;

  const expiresAt = new Date(row.token_expires_at).getTime();
  if (expiresAt - Date.now() > 60_000) {
    return { accessToken: row.access_token, calendarId: row.google_calendar_id };
  }

  const refreshed = await refreshAccessToken(row.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabaseAdmin
    .from("booking_staff_google_tokens")
    .update({ access_token: refreshed.access_token, token_expires_at: newExpiresAt, updated_at: new Date().toISOString() })
    .eq("staff_id", staffId);

  return { accessToken: refreshed.access_token, calendarId: row.google_calendar_id };
}

export async function getFreeBusy(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string,
): Promise<Array<{ start: string; end: string }>> {
  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin, timeMax, items: [{ id: calendarId }] }),
  });
  if (!res.ok) throw new Error(`freebusy_failed: ${await res.text()}`);
  const data = await res.json();
  return data.calendars?.[calendarId]?.busy ?? [];
}

export interface GCalEventInput {
  summary: string;
  description?: string;
  startIso: string;
  endIso: string;
  timeZone: string;
  attendeeEmail?: string | null;
}

export async function createEvent(
  accessToken: string,
  calendarId: string,
  event: GCalEventInput,
): Promise<string> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.startIso, timeZone: event.timeZone },
        end: { dateTime: event.endIso, timeZone: event.timeZone },
        attendees: event.attendeeEmail ? [{ email: event.attendeeEmail }] : undefined,
      }),
    },
  );
  if (!res.ok) throw new Error(`create_event_failed: ${await res.text()}`);
  const data = await res.json();
  return data.id;
}

export async function updateEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: GCalEventInput,
): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: event.summary,
        description: event.description,
        start: { dateTime: event.startIso, timeZone: event.timeZone },
        end: { dateTime: event.endIso, timeZone: event.timeZone },
        attendees: event.attendeeEmail ? [{ email: event.attendeeEmail }] : undefined,
      }),
    },
  );
  // 404/410 means the event is already gone on Google's side -- treat as done, not an error.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`update_event_failed: ${await res.text()}`);
  }
}

export async function deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`delete_event_failed: ${await res.text()}`);
  }
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
