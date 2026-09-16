// Supabase Edge Function: generate-schema
// Called from the KoboDocs Form and KoboDocs Survey builders' "Generate with
// AI" button. Turns a plain-English description into a draft set of fields
// (Form) or questions (Survey). Pro-tier-and-up feature — checked server-side
// against form_subscriptions / survey_subscriptions, not just hidden in the UI.
//
// Provider order: Gemini (primary) -> Groq (fallback on error/timeout).
// Requires GEMINI_API_KEY and/or GROQ_API_KEY as Edge Function secrets.
//
// Expected/handleable outcomes (validation, not-authorized, not-configured,
// temporarily-unavailable) return HTTP 200 with { error: "..." } in the body,
// matching the compliance-assistant function's convention — supabase-js's
// functions.invoke() replaces non-2xx bodies with a generic message
// client-side, which would otherwise swallow the friendly error text.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-2.5-flash";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const FORM_TYPES = ["text", "textarea", "number", "email", "phone", "date", "select", "radio", "checkbox", "rating", "file", "signature"];
const SURVEY_TYPES = ["text", "textarea", "multiple_choice", "checkbox", "rating", "nps", "likert", "ranking"];
const OPTION_TYPES = new Set(["select", "radio", "checkbox", "multiple_choice", "ranking"]);

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function buildPrompt(product: string, description: string): string {
  const allowedTypes = product === "survey" ? SURVEY_TYPES : FORM_TYPES;
  const noun = product === "survey" ? "questions" : "fields";
  return `You are an assistant that turns a plain-English description into a ${product} schema for KoboDocs ${product === "survey" ? "Survey" : "Form"}, a Nigerian form/survey builder.

Return ONLY valid JSON, no markdown fences, no commentary, matching exactly this shape:
{
  "title": "string, a short title for the ${product}",
  "description": "string or null, a one-sentence description",
  "items": [
    { "type": "one of: ${allowedTypes.join(", ")}", "label": "string, the question/field label", "required": true or false, "options": ["array of strings, ONLY for types that need options (select/radio/checkbox/multiple_choice/ranking), otherwise omit"] }
  ]
}

Rules:
- Generate between 3 and 12 ${noun}, whatever best fits the request.
- Use "email" type for email fields, "phone" for phone numbers, "date" for dates.
- Keep labels concise and in plain English (Nigerian context is fine, e.g. "NIN", "LGA", "State of origin").
- Do not invent a payment field of any kind — KoboDocs Form/Survey never collects payment.
- Output must be valid JSON only.

Request: "${description}"`;
}

async function askGemini(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 1500, responseMimeType: "application/json" },
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

async function askGroq(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 1500,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
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

function fieldId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeItems(raw: unknown, product: string) {
  const allowedTypes = new Set(product === "survey" ? SURVEY_TYPES : FORM_TYPES);
  const prefix = product === "survey" ? "q" : "f";
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((it) => it && typeof it === "object" && allowedTypes.has(it.type) && typeof it.label === "string" && it.label.trim())
    .slice(0, 12)
    .map((it: any) => {
      const item: Record<string, unknown> = {
        id: fieldId(prefix),
        type: it.type,
        label: String(it.label).slice(0, 200),
        required: Boolean(it.required),
      };
      if (OPTION_TYPES.has(it.type)) {
        const opts = Array.isArray(it.options) ? it.options.filter((o: unknown) => typeof o === "string" && o.trim()).slice(0, 15) : [];
        item.options = opts.length ? opts : ["Option 1", "Option 2"];
      }
      return item;
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

  let body: { product?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return ok({ error: "Invalid request" });
  }

  const product = body.product === "survey" ? "survey" : "form";
  const description = (body.description ?? "").trim();
  if (!description) {
    return ok({ error: "Describe what you want to create first." });
  }
  if (description.length > 800) {
    return ok({ error: "Description is too long (max 800 characters)." });
  }

  // Server-side plan gate — Pro and up only, for both products.
  const planTable = product === "survey" ? "survey_subscriptions" : "form_subscriptions";
  const { data: sub } = await supabase
    .from(planTable)
    .select("plan, status, expires_at")
    .eq("user_id", user.id)
    .maybeSingle();
  const plan = sub && sub.status === "active" && (!sub.expires_at || new Date(sub.expires_at) > new Date()) ? sub.plan : "free";
  const allowedPlans = product === "survey" ? ["pro", "team"] : ["pro", "business"];
  if (!allowedPlans.includes(plan)) {
    return ok({ error: "The AI generator is a Pro-plan feature. Upgrade your plan to use it." });
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (!geminiKey && !groqKey) {
    return ok({ error: "The AI generator is not configured yet. Set GEMINI_API_KEY and/or GROQ_API_KEY in Supabase Edge Function secrets." });
  }

  const prompt = buildPrompt(product, description);

  let raw: string | null = null;
  const errors: string[] = [];

  if (geminiKey) {
    try {
      raw = await askGemini(geminiKey, prompt);
    } catch (err) {
      console.error("Gemini failed, falling back to Groq:", err);
      errors.push(String(err));
    }
  }
  if (!raw && groqKey) {
    try {
      raw = await askGroq(groqKey, prompt);
    } catch (err) {
      console.error("Groq failed:", err);
      errors.push(String(err));
    }
  }

  if (!raw) {
    console.error("generate-schema: both providers failed:", errors.join(" | "));
    return ok({ error: "The AI generator is temporarily unavailable — please try again shortly." });
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return ok({ error: "The AI generator returned something unexpected — please try again." });
  }

  const items = sanitizeItems(parsed.items, product);
  if (!items.length) {
    return ok({ error: "Could not generate anything usable from that description — try adding more detail." });
  }

  return ok({
    success: true,
    title: typeof parsed.title === "string" ? parsed.title.slice(0, 150) : (product === "survey" ? "Untitled survey" : "Untitled form"),
    description: typeof parsed.description === "string" ? parsed.description.slice(0, 500) : null,
    items,
  });
});
