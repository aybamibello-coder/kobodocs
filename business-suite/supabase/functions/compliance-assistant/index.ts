// Supabase Edge Function: compliance-assistant
// Called from the Compliance Tracker UI. Answers plain-English questions
// about a business's own compliance obligations, grounded ONLY in that
// business's stored profile/obligations/documents data — not open-ended
// legal or tax research.
// Provider order: Gemini (primary) -> Groq (fallback on error/timeout).
// Requires GEMINI_API_KEY and GROQ_API_KEY as Edge Function secrets.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DISCLAIMER =
  "This is general guidance based on the information in your Compliance Tracker, not legal or tax advice. Confirm specifics with your accountant, company secretary, or lawyer.";

const GEMINI_MODEL = "gemini-2.5-flash";
const GROQ_MODEL = "llama-3.3-70b-versatile";

async function askGemini(apiKey: string, systemPrompt: string, question: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: question }] }],
        generationConfig: { maxOutputTokens: 700 },
      }),
    }
  );
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("\n")?.trim();
  if (!text) throw new Error("Gemini returned no text");
  return text;
}

async function askGroq(apiKey: string, systemPrompt: string, question: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 700,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq returned no text");
  return text;
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

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (!geminiKey && !groqKey) {
    return new Response(JSON.stringify({ error: "Assistant is not configured yet. Set GEMINI_API_KEY and/or GROQ_API_KEY in Supabase Edge Function secrets." }), {
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

  let answer: string | null = null;
  let providerUsed: string | null = null;
  const errors: string[] = [];

  if (geminiKey) {
    try {
      answer = await askGemini(geminiKey, systemPrompt, question);
      providerUsed = "gemini";
    } catch (err) {
      console.error("Gemini failed, falling back to Groq:", err);
      errors.push(String(err));
    }
  }

  if (!answer && groqKey) {
    try {
      answer = await askGroq(groqKey, systemPrompt, question);
      providerUsed = "groq";
    } catch (err) {
      console.error("Groq failed:", err);
      errors.push(String(err));
    }
  }

  if (!answer) {
    console.error("compliance-assistant: both providers failed:", errors.join(" | "));
    return new Response(JSON.stringify({ error: "Assistant is temporarily unavailable" }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const fullAnswer = `${answer}\n\n${DISCLAIMER}`;

  try {
    await supabase.from("compliance_assistant_log").insert({
      business_id: businessId,
      asked_by: user.id,
      question,
      answer: fullAnswer,
    });
  } catch (err) {
    console.error("Failed to log compliance assistant Q&A:", err);
  }

  return new Response(JSON.stringify({ answer: fullAnswer, provider: providerUsed }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
