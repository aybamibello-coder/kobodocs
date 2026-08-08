// Supabase Edge Function: draft-negotiation-message
// "AI collections agent — Version A": drafts ONE WhatsApp negotiation
// message for a single client, grounded strictly in facts pulled from the
// database (balance, overdue days, promise history, last note). The AI
// only phrases the message and proposes a plausible next step; it never
// invents amounts, dates, or facts not given to it. The user reviews and
// edits the draft before sending — this function does not send anything.
// Provider order: Gemini (primary) -> Groq (fallback on error/timeout).
// Requires GEMINI_API_KEY and GROQ_API_KEY as Edge Function secrets.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-2.5-flash";
const GROQ_MODEL = "llama-3.3-70b-versatile";

function ok(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function daysOverdue(dueDate: string | null): number | null {
  if (!dueDate) return null;
  const ms = new Date().setHours(0, 0, 0, 0) - new Date(dueDate).setHours(0, 0, 0, 0);
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

async function askGemini(apiKey: string, systemPrompt: string, question: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: question }] }],
        generationConfig: { maxOutputTokens: 400 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("\n")?.trim();
  if (!text) throw new Error("Gemini returned no text");
  return text;
}

async function askGroq(apiKey: string, systemPrompt: string, question: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 400,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Groq error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq returned no text");
  return text;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { business_id?: string; client_id?: string };
  try { body = await req.json(); } catch { return ok({ error: "Invalid request" }); }

  const { business_id, client_id } = body;
  if (!business_id || !client_id) return ok({ error: "business_id and client_id are required" });

  const { data: business } = await supabase.from("businesses").select("id, name").eq("id", business_id).maybeSingle();
  if (!business) return ok({ error: "Business not found or access denied" });

  const { data: client } = await supabase.from("clients").select("id, name, phone")
    .eq("business_id", business_id).eq("id", client_id).maybeSingle();
  if (!client) return ok({ error: "Client not found" });

  const [{ data: receivables }, { data: promises }, { data: notes }, { data: openDisputes }] = await Promise.all([
    supabase.from("receivables").select("id, description, amount, amount_paid, due_date")
      .eq("business_id", business_id).eq("client_id", client_id).neq("payment_status", "paid"),
    supabase.from("promise_to_pay").select("promised_date, promised_amount, status")
      .eq("business_id", business_id).eq("client_id", client_id).order("promised_date", { ascending: false }),
    supabase.from("collection_notes").select("note, created_at")
      .eq("business_id", business_id).eq("client_id", client_id).order("created_at", { ascending: false }).limit(1),
    supabase.from("receivable_disputes").select("receivable_id")
      .eq("business_id", business_id).eq("status", "open"),
  ]);

  const disputedReceivableIds = new Set((openDisputes ?? []).map((d: any) => d.receivable_id));
  const disputedCount = (receivables ?? []).filter((rv: any) => disputedReceivableIds.has(rv.id)).length;

  const items = (receivables ?? [])
    .filter((rv: any) => !disputedReceivableIds.has(rv.id)) // don't ask for payment on items under dispute
    .map((rv: any) => {
      const balance = Number(rv.amount) - Number(rv.amount_paid || 0);
      return { description: rv.description, balance, due_date: rv.due_date, days_overdue: daysOverdue(rv.due_date) };
    }).filter((i: any) => i.balance > 0);

  if (!items.length) {
    return ok({
      error: disputedCount > 0
        ? "This client's outstanding balance is entirely under dispute. Resolve the dispute before requesting payment."
        : "This client has no outstanding balance to negotiate."
    });
  }

  const totalBalance = items.reduce((s: number, i: any) => s + i.balance, 0);
  const worstDays = items.reduce((max: number | null, i: any) => (i.days_overdue !== null && (max === null || i.days_overdue > max)) ? i.days_overdue : max, null);
  const brokenPromise = (promises ?? []).find((p: any) => p.status === "broken") || null;
  const pendingPromise = (promises ?? []).find((p: any) => p.status === "pending") || null;
  const lastNote = notes && notes[0] ? notes[0].note : null;

  const facts = {
    business_name: business.name,
    client_name: client.name,
    total_balance_naira: totalBalance,
    items,
    worst_days_overdue: worstDays,
    broken_promise: brokenPromise ? { promised_date: brokenPromise.promised_date, promised_amount: Number(brokenPromise.promised_amount) } : null,
    pending_promise: pendingPromise ? { promised_date: pendingPromise.promised_date, promised_amount: Number(pendingPromise.promised_amount) } : null,
    last_note: lastNote,
    has_separate_disputed_items: disputedCount > 0,
  };

  const systemPrompt = `You draft ONE short WhatsApp message for a Nigerian small business owner to send to a customer who owes them money.
You will be given JSON facts: business_name, client_name, total_balance_naira, items (list of what's owed), worst_days_overdue, broken_promise (or null), pending_promise (or null), last_note (or null), has_separate_disputed_items (boolean).

Rules you must follow strictly:
- Use ONLY the facts given. Never invent, round differently, or restate an amount or date that isn't exactly in the input.
- total_balance_naira already EXCLUDES any items under dispute \u2014 do not mention or reference a dispute in the message even if has_separate_disputed_items is true, since that is being handled separately.
- Address the client by name, mention the business name, state the exact total balance owed.
- If broken_promise is present, acknowledge it firmly but respectfully and ask for a new concrete commitment.
- If pending_promise is present (no broken promise), reference it as a friendly check-in.
- If neither is present, keep the tone as a polite, professional payment reminder.
- Propose that the client reply with a specific date or amount they can commit to \u2014 do NOT propose a specific new date yourself, since you don't know what works for them.
- Keep it under 90 words, in plain conversational English suitable for WhatsApp. No markdown, no emojis, no subject line.
- Return ONLY the raw message text, nothing else.`;

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const groqKey = Deno.env.get("GROQ_API_KEY");

  let message: string | null = null;
  let providerUsed: string | null = null;
  const errors: string[] = [];

  if (geminiKey) {
    try {
      message = (await askGemini(geminiKey, systemPrompt, JSON.stringify(facts))).replace(/```/g, "").trim();
      providerUsed = "gemini";
    } catch (err) {
      console.error("Gemini failed, falling back to Groq:", err);
      errors.push(String(err));
    }
  }

  if (!message && groqKey) {
    try {
      message = (await askGroq(groqKey, systemPrompt, JSON.stringify(facts))).replace(/```/g, "").trim();
      providerUsed = "groq";
    } catch (err) {
      console.error("Groq failed:", err);
      errors.push(String(err));
    }
  }

  if (!message) {
    console.error("draft-negotiation-message: both providers failed:", errors.join(" | "));
    return ok({ error: "Could not generate a draft right now. Please try again shortly." });
  }

  return ok({ message, provider: providerUsed, facts });
});
