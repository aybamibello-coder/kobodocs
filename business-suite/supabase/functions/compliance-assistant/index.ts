// Supabase Edge Function: compliance-assistant
// Called from the Compliance Tracker UI. Answers plain-English questions
// about a business's own compliance obligations, grounded ONLY in that
// business's stored profile/obligations/documents data — not open-ended
// legal or tax research. Requires ANTHROPIC_API_KEY as an Edge Function
// secret (not yet set — add it in Supabase project settings before this
// will return real answers).

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DISCLAIMER =
  "This is general guidance based on the information in your Compliance Tracker, not legal or tax advice. Confirm specifics with your accountant, company secretary, or lawyer.";

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

  // Scoped to the calling user so RLS (is_business_member) enforces access —
  // this function can only ever see data for businesses the caller belongs to.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { business_id?: string; question?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const businessId = body.business_id;
  const question = (body.question ?? "").trim();
  if (!businessId || !question) {
    return new Response(JSON.stringify({ error: "business_id and question are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (question.length > 1000) {
    return new Response(JSON.stringify({ error: "Question is too long (max 1000 characters)" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    return new Response(JSON.stringify({ error: "Assistant is not configured yet. Set ANTHROPIC_API_KEY in Supabase Edge Function secrets." }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // RLS-scoped reads: this will simply come back empty if the user isn't a
  // member of businessId, rather than leaking another business's data.
  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, rc_number, tin_number, vat_number, cac_directors")
    .eq("id", businessId)
    .maybeSingle();

  if (!business) {
    return new Response(JSON.stringify({ error: "Business not found or access denied" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: obligations } = await supabase
    .from("compliance_obligations")
    .select("title, obligation_type, due_date, recurrence, status")
    .eq("business_id", businessId)
    .order("due_date", { ascending: true })
    .limit(30);

  const { data: documents } = await supabase
    .from("compliance_documents")
    .select("name, doc_type, issue_date, expiry_date")
    .eq("business_id", businessId)
    .order("expiry_date", { ascending: true })
    .limit(30);

  const profileSummary = {
    name: business.name,
    has_rc_number: Boolean(business.rc_number),
    has_tin: Boolean(business.tin_number),
    has_vat_number: Boolean(business.vat_number),
    director_count: Array.isArray(business.cac_directors) ? business.cac_directors.length : 0,
  };

  const systemPrompt = `You are the KoboDocs Compliance Assistant, helping a Nigerian small business owner understand their own regulatory compliance status in plain English.

Rules you must follow strictly:
- Answer ONLY using the business data provided below plus well-established, general knowledge of Nigerian business compliance obligations (CAC, FIRS, PAYE, pension, NSITF, ITF, NAFDAC, SON, etc.).
- If the data provided doesn't contain something the user asks about, say so plainly rather than inventing dates, numbers, or figures.
- Do NOT give definitive legal or tax advice, quote specific penalty amounts, or claim certainty about deadlines that vary by case — flag those as "typically" and recommend confirming with a professional.
- Keep answers concise and in plain English, not legalese.
- Never claim to have filed anything or taken any action on the user's behalf — you only explain and inform.

Business profile: ${JSON.stringify(profileSummary)}
Tracked obligations (up to 30, soonest first): ${JSON.stringify(obligations ?? [])}
Vault documents (up to 30, soonest expiry first): ${JSON.stringify(documents ?? [])}`;

  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 700,
        system: systemPrompt,
        messages: [{ role: "user", content: question }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("Anthropic API error:", errText);
      return new Response(JSON.stringify({ error: "Assistant is temporarily unavailable" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    const textBlocks = (aiData.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text);
    const answer = textBlocks.join("\n").trim() || "I couldn't generate a response — please try rephrasing your question.";
    const fullAnswer = `${answer}\n\n${DISCLAIMER}`;

    await supabase.from("compliance_assistant_log").insert({
      business_id: businessId,
      asked_by: user.id,
      question,
      answer: fullAnswer,
    });

    return new Response(JSON.stringify({ answer: fullAnswer }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("compliance-assistant error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
