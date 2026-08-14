// PDF OS — planning step. Sees ONLY the file manifest (names/sizes/page
// counts) and the running conversation — never file bytes. Decides the
// next tool call(s) or returns a final answer. Uses Claude's native tool
// calling; swap MODEL/endpoint here if a different provider is preferred,
// nothing else in the agent loop needs to change.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const MODEL = 'claude-sonnet-4-6';

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

  const anthropicTools = tools.map((t: any) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema
  }));

  const messages = buildMessages(conversation, file_manifest);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: anthropicTools,
      messages
    })
  });

  if (!res.ok) return jsonResponse({ error: 'PLAN_MODEL_CALL_FAILED', status: res.status }, 502);
  const data = await res.json();

  const toolUseBlocks = (data.content || []).filter((b: any) => b.type === 'tool_use');
  const textBlocks = (data.content || []).filter((b: any) => b.type === 'text');

  if (toolUseBlocks.length === 0) {
    return jsonResponse({ type: 'final', text: textBlocks.map((b: any) => b.text).join('\n') });
  }

  return jsonResponse({
    type: 'tool_calls',
    calls: toolUseBlocks.map((b: any) => ({ id: b.id, name: b.name, input: b.input })),
    assistant_turn: { role: 'assistant', content: data.content }
  });
});

function buildMessages(conversation: any[], fileManifest: any[]) {
  // First user turn gets the file manifest attached as context; later
  // turns carry tool_result blocks as Anthropic's format expects.
  const messages: any[] = [];
  conversation.forEach((turn, i) => {
    if (turn.role === 'user' && i === 0) {
      messages.push({
        role: 'user',
        content: `Files available:\n${JSON.stringify(fileManifest, null, 2)}\n\nRequest: ${turn.content}`
      });
    } else if (turn.role === 'tool_results') {
      messages.push({
        role: 'user',
        content: turn.content.map((r: any) => ({
          type: 'tool_result',
          tool_use_id: r.call_id,
          content: r.error ? `Error: ${r.error}` : JSON.stringify({ output_file: r.output_file?.name, output_text: r.output_text })
        }))
      });
    } else {
      messages.push(turn);
    }
  });
  return messages;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
