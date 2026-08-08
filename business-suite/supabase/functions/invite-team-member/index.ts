// Supabase Edge Function: invite-team-member
// Platform-wide (not compliance-specific): lets a business owner add an
// existing KoboDocs user to their business_members with a chosen role.
//
// IMPORTANT: expected/handleable outcomes (validation errors, not-found,
// not-owner) return HTTP 200 with { error: "..." } in the body, NOT a
// non-2xx status. supabase-js's functions.invoke() surfaces a generic
// "Edge Function returned a non-2xx status code" for any non-2xx response
// instead of the actual message in the JSON body, so using 400/403/404 for
// normal business-logic conditions silently broke the friendly error
// messages this function was written to provide. Only genuine auth failures
// (401, no session) and truly unexpected server errors (500) stay non-2xx.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_ROLES = ["staff", "accountant", "lawyer", "hr", "finance"];

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Caller-scoped client: used only to confirm the caller actually owns
  // business_id, via the same RLS the rest of the app relies on.
  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const {
    data: { user },
  } = await callerClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { business_id?: string; email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return ok({ error: "Invalid request" });
  }

  const businessId = body.business_id;
  const email = (body.email ?? "").trim().toLowerCase();
  const role = body.role ?? "";

  if (!businessId || !email || !role) {
    return ok({ error: "Email and role are required" });
  }
  if (!VALID_ROLES.includes(role)) {
    return ok({ error: `Role must be one of: ${VALID_ROLES.join(", ")}` });
  }

  const { data: ownedBusiness } = await callerClient
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!ownedBusiness) {
    return ok({ error: "Only the business owner can invite team members" });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: invitee } = await adminClient
    .from("profiles")
    .select("id, email, full_name")
    .ilike("email", email)
    .maybeSingle();

  if (!invitee) {
    return ok({ error: "No KoboDocs account found for that email. Ask them to sign up first, then invite again." });
  }

  if (invitee.id === user.id) {
    return ok({ error: "You're already the owner of this business." });
  }

  const { error: upsertError } = await adminClient
    .from("business_members")
    .upsert(
      {
        business_id: businessId,
        user_id: invitee.id,
        role,
        invited_by: user.id,
        member_email: invitee.email,
        member_name: invitee.full_name,
      },
      { onConflict: "business_id,user_id" }
    );

  if (upsertError) {
    console.error("invite-team-member upsert error:", upsertError);
    return new Response(JSON.stringify({ error: upsertError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return ok({ success: true, member: { email: invitee.email, full_name: invitee.full_name, role } });
});
