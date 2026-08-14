// PDF OS — planning step. Sees ONLY the file manifest (names/sizes/page
// counts) and the running conversation — never file bytes. Decides the
// next tool call(s) or returns a final answer.
//
// Uses Groq (OpenAI-compatible chat completions + tool calling) for
// planning — fast/cheap, good fit for an orchestration step that runs on
// every turn. Gemini stays reserved for the multimodal/document-heavy
// work in _shared/pdf-os-model.ts (OCR, summarize, extract). No
// Anthropic key in use anywhere in this project.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!;
const GROQ_MODEL = 'llama-3.3-70b-versatile';

const SYSTEM_PROMPT = `You are the PDF OS planning agent. You turn a natural-language
request plus a manifest of the user's uploaded files into a sequence of tool
calls, or a final plain-language answer if no tool is needed.

Rules:
- Only reference file_ids that appear in the manifest.
- Prefer the minimum number of steps that accomplishes the request.
- If the request is ambiguous (e.g. which files, what order), ask a clarifying
  question as a final answer instead of guessing.
- Never claim an action succeeded before its tool result confirms it.`;

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'UNAUTHENTICATED' }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!user) return jsonResponse({ error: 'UNAUTHENTICATED' }, 401);

  // Agent-run quota (distinct from per-tool AI-action quota) is spent once
  // per planning call, since each call is one "turn" of agent reasoning.
  const { data: allowed, error: quotaErr } = await supabase.rpc('consume_pdf_os_agent_run', { p_user_id: user.id });
  if (quotaErr) return jsonResponse({ error: 'QUOTA_CHECK_FAILED' }, 500);
  if (!allowed) return jsonResponse({ error: 'QUOTA_EXCEEDED' }, 402);

  const { conversation, file_manifest, tools } = await req.json();

  // OpenAI/Groq tool-calling shape: { type: "function", function: { name, description, parameters } }
  const groqTools = tools.map((t: any) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.input_schema }
  }));

  const messages = buildMessages(conversation, file_manifest);

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      tools: groqTools,
      tool_choice: 'auto',
      max_tokens: 1024
    })
  });

  if (!res.ok) return jsonResponse({ error: 'PLAN_MODEL_CALL_FAILED', status: res.status, detail: await res.text() }, 502);
  const data = await res.json();

  const message = data.choices?.[0]?.message;
  const toolCalls = message?.tool_calls || [];

  if (toolCalls.length === 0) {
    return jsonResponse({ type: 'final', text: message?.content || '' });
  }

  return jsonResponse({
    type: 'tool_calls',
    calls: toolCalls.map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      input: safeParseJson(tc.function.arguments)
    })),
    // Stored verbatim so the next turn's assistant message satisfies
    // Groq/OpenAI's requirement that every tool_call have a matching
    // preceding assistant message with that tool_calls array.
    assistant_turn: { role: 'assistant', content: message.content, tool_calls: message.tool_calls }
  });
});

function buildMessages(conversation: any[], fileManifest: any[]) {
  const messages: any[] = [];
  conversation.forEach((turn, i) => {
    if (turn.role === 'user' && i === 0) {
      messages.push({
        role: 'user',
        content: `Files available:\n${JSON.stringify(fileManifest, null, 2)}\n\nRequest: ${turn.content}`
      });
    } else if (turn.role === 'tool_results') {
      // Groq/OpenAI expects one 'tool' role message per tool_call_id,
      // not a single combined block like Anthropic's format.
      turn.content.forEach((r: any) => {
        messages.push({
          role: 'tool',
          tool_call_id: r.call_id,
          content: r.error ? `Error: ${r.error}` : JSON.stringify({ output_file: r.output_file?.name, output_text: r.output_text })
        });
      });
    } else if (turn.role === 'assistant') {
      messages.push(turn);
    } else {
      messages.push(turn);
    }
  });
  return messages;
}

function safeParseJson(raw: string) {
  try { return JSON.parse(raw); } catch { return {}; }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
