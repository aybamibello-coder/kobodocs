// Supabase Edge Function: collection-priorities
// Called from Receivable Manager's "Today's priorities" panel.
// Computes a deterministic recovery-priority score for every client with
// an outstanding balance (balance x overdue urgency x broken-promise
// penalty), then asks an AI provider to phrase ONE short suggested next
// action per top account — grounded strictly in the facts computed here.
// The AI never invents amounts, dates, or client names; it only picks a
// tone/channel (WhatsApp nudge vs call vs formal notice) from the facts.
// Provider order: Gemini (primary) -> Groq (fallback on error/timeout).
// Requires GEMINI_API_KEY and GROQ_API_KEY as Edge Function secrets.
//
// IMPORTANT: expected/handleable outcomes (validation errors, not-found,
// not-configured) return HTTP 200 with { error: "..." } in the body, not
// a non-2xx status — see compliance-assistant/index.ts for why. Only
// genuine auth failures (401) stay non-2xx.

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_MODEL = "gemini-2.5-flash";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const TOP_N = 8;

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

function urgencyMultiplier(days: number | null): number {
  if (days === null || days <= 0) return 0.3;
  if (days <= 30) return 0.6;
  if (days <= 60) return 0.85;
  if (days <= 90) return 1.1;
  return 1.4;
}

function bucketLabel(days: number | null): string {
  if (days === null || days <= 0) return "Current";
  if (days <= 30) return "1-30 days overdue";
  if (days <= 60) return "31-60 days overdue";
  if (days <= 90) return "61-90 days overdue";
  return "90+ days overdue";
}

type ScoredAccount = {
  client_id: string;
  client_name: string;
  balance: number;
  days_overdue: number | null;
  bucket: string;
  broken_promise: boolean;
  pending_promise: { promised_date: string; promised_amount: number } | null;
  last_note: string | null;
  score: number;
};

function extractJsonArray(text: string): unknown[] | null {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
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
        generationConfig: { maxOutputTokens: 900, responseMimeType: "application/json" },
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
      max_tokens: 900,
      response_format: { type: "json_object" },
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

  let body: { business_id?: string };
  try {
    body = await req.json();
  } catch {
    return ok({ error: "Invalid request" });
  }

  const businessId = body.business_id;
  if (!businessId) return ok({ error: "business_id is required" });

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .maybeSingle();
  if (!business) return ok({ error: "Business not found or access denied" });

  const [{ data: clients }, { data: receivables }, { data: promises }, { data: notes }, { data: openDisputes }, { data: openDocRequests }] = await Promise.all([
    supabase.from("clients").select("id, name, phone").eq("business_id", businessId),
    supabase.from("receivables").select("id, client_id, description, amount, amount_paid, due_date, payment_status")
      .eq("business_id", businessId).neq("payment_status", "paid"),
    supabase.from("promise_to_pay").select("client_id, promised_date, promised_amount, status")
      .eq("business_id", businessId),
    supabase.from("collection_notes").select("client_id, note, created_at")
      .eq("business_id", businessId).order("created_at", { ascending: false }),
    supabase.from("receivable_disputes").select("receivable_id")
      .eq("business_id", businessId).eq("status", "open"),
    supabase.from("receivable_document_requests").select("receivable_id")
      .eq("business_id", businessId).eq("status", "pending"),
  ]);

  const disputedReceivableIds = new Set((openDisputes ?? []).map((d: any) => d.receivable_id));
  const blockedByDocReceivableIds = new Set((openDocRequests ?? []).map((d: any) => d.receivable_id));

  const clientById = new Map((clients ?? []).map((c: any) => [c.id, c]));

  // ---------- Deterministic scoring (no AI involved) ----------
  const byClient = new Map<string, { balance: number; worstDays: number | null }>();
  for (const rv of receivables ?? []) {
    if (disputedReceivableIds.has(rv.id) || blockedByDocReceivableIds.has(rv.id)) continue; // don't chase money that's blocked by a dispute or missing document
    const balance = Number(rv.amount) - Number(rv.amount_paid || 0);
    if (balance <= 0) continue;
    const days = daysOverdue(rv.due_date);
    const entry = byClient.get(rv.client_id) || { balance: 0, worstDays: null };
    entry.balance += balance;
    if (days !== null && (entry.worstDays === null || days > entry.worstDays)) entry.worstDays = days;
    byClient.set(rv.client_id, entry);
  }

  const scored: ScoredAccount[] = [];
  for (const [clientId, agg] of byClient.entries()) {
    const client = clientById.get(clientId);
    if (!client) continue;

    const clientPromises = (promises ?? []).filter((p: any) => p.client_id === clientId);
    const brokenPromise = clientPromises.some((p: any) => p.status === "broken");
    const pending = clientPromises.find((p: any) => p.status === "pending") || null;
    const lastNote = (notes ?? []).find((n: any) => n.client_id === clientId) || null;

    const urgency = urgencyMultiplier(agg.worstDays);
    const brokenMultiplier = brokenPromise ? 1.3 : 1.0;
    const score = agg.balance * urgency * brokenMultiplier;

    scored.push({
      client_id: clientId,
      client_name: client.name,
      balance: agg.balance,
      days_overdue: agg.worstDays,
      bucket: bucketLabel(agg.worstDays),
      broken_promise: brokenPromise,
      pending_promise: pending ? { promised_date: pending.promised_date, promised_amount: Number(pending.promised_amount) } : null,
      last_note: lastNote ? lastNote.note : null,
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, TOP_N);

  if (top.length === 0) {
    return ok({ priorities: [], provider: null, generated_at: new Date().toISOString() });
  }

  // ---------- AI phrasing of a suggested next action per top account ----------
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const groqKey = Deno.env.get("GROQ_API_KEY");

  const systemPrompt = `You are helping a Nigerian small business decide how to chase overdue customer balances today.
You will be given a JSON array of accounts, each with: client_id, balance (in Naira), days_overdue, bucket, broken_promise (boolean), pending_promise (or null), last_note (or null).

Rules you must follow strictly:
- For EACH account in the input, return one object: { "client_id": "...", "suggested_action": "..." }.
- suggested_action must be ONE short sentence (max 18 words), in plain English, recommending HOW to chase this account today (e.g. friendly WhatsApp nudge, phone call, formal written notice, escalate to account manager).
- Base the tone strictly on the facts given: broken_promise=true or 90+ days overdue warrants a firmer approach (call or formal notice); small/early balances warrant a friendly reminder.
- Do NOT invent, restate with different values, or guess any amount, date, or name not already in the input.
- Return ONLY a raw JSON array, no prose, no markdown fences.`;

  const question = JSON.stringify(top.map(t => ({
    client_id: t.client_id,
    balance: t.balance,
    days_overdue: t.days_overdue,
    bucket: t.bucket,
    broken_promise: t.broken_promise,
    pending_promise: t.pending_promise,
    last_note: t.last_note,
  })));

  let actionsByClient: Record<string, string> = {};
  let providerUsed: string | null = null;
  const errors: string[] = [];

  if (geminiKey) {
    try {
      const raw = await askGemini(geminiKey, systemPrompt, question);
      const parsed = extractJsonArray(raw);
      if (parsed) {
        for (const item of parsed as any[]) {
          if (item?.client_id && item?.suggested_action) actionsByClient[item.client_id] = String(item.suggested_action);
        }
        providerUsed = "gemini";
      }
    } catch (err) {
      console.error("Gemini failed, falling back to Groq:", err);
      errors.push(String(err));
    }
  }

  if (!providerUsed && groqKey) {
    try {
      const raw = await askGroq(groqKey, systemPrompt, question);
      const parsed = extractJsonArray(raw);
      if (parsed) {
        for (const item of parsed as any[]) {
          if (item?.client_id && item?.suggested_action) actionsByClient[item.client_id] = String(item.suggested_action);
        }
        providerUsed = "groq";
      }
    } catch (err) {
      console.error("Groq failed:", err);
      errors.push(String(err));
    }
  }

  if (!providerUsed) {
    console.error("collection-priorities: both providers failed or returned nothing usable:", errors.join(" | "));
  }

  const priorities = top.map((t, i) => ({
    rank: i + 1,
    client_id: t.client_id,
    client_name: t.client_name,
    balance: t.balance,
    days_overdue: t.days_overdue,
    bucket: t.bucket,
    broken_promise: t.broken_promise,
    pending_promise: t.pending_promise,
    suggested_action: actionsByClient[t.client_id] ||
      (t.broken_promise
        ? "Call directly today \u2014 this account already broke a promise to pay."
        : t.days_overdue !== null && t.days_overdue > 60
        ? "Send a formal payment notice \u2014 significantly overdue."
        : "Send a friendly WhatsApp payment reminder."),
  }));

  const { error: insertError } = await supabase.from("collection_priority_runs").insert({
    business_id: businessId,
    generated_by: user.id,
    provider: providerUsed,
    priorities,
  });
  if (insertError) console.error("Failed to log collection_priority_runs:", insertError);

  return ok({ priorities, provider: providerUsed, generated_at: new Date().toISOString() });
});
