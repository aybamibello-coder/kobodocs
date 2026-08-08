// Supabase Edge Function: invite-team-member
// Platform-wide (not compliance-specific): lets a business owner add an
// existing KoboDocs user to their business_members with a chosen role.
// Needed because business_members.role expansion (owner/staff/accountant/
// lawyer/hr/finance) is only useful once owners can actually assign roles —
// there was previously no invite UI anywhere in Business Suite.
// Looks up the invitee by email via the service role (profiles has
// select-own-only RLS, so a plain client-side lookup isn't possible), and
// denormalizes their email/name onto business_members so the team list can
// be read client-side afterwards without needing another edge function.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_ROLES = ["staff", "accountant", "lawyer", "hr", "finance"];

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
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const businessId = body.business_id;
  const email = (body.email ?? "").trim().toLowerCase();
  const role = body.role ?? "";

  if (!businessId || !email || !role) {
    return new Response(JSON.stringify({ error: "business_id, email and role are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!VALID_ROLES.includes(role)) {
    return new Response(JSON.stringify({ error: `role must be one of: ${VALID_ROLES.join(", ")}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: ownedBusiness } = await callerClient
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (!ownedBusiness) {
    return new Response(JSON.stringify({ error: "Only the business owner can invite team members" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
    return new Response(JSON.stringify({ error: "No KoboDocs account found for that email. Ask them to sign up first, then invite again." }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (invitee.id === user.id) {
    return new Response(JSON.stringify({ error: "You're already the owner of this business." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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

  return new Response(
    JSON.stringify({ success: true, member: { email: invitee.email, full_name: invitee.full_name, role } }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
