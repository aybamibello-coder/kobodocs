import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders } });
}

// Verifies the caller, then atomically checks + decrements their AI action
// quota via a Postgres RPC (single round trip, no read-then-write race).
// Returns null (and an already-built error Response) on failure so callers
// can `const gate = await requireAiQuota(req); if (gate.error) return gate.error;`
export async function requireAiQuota(req: Request): Promise<
  { error: Response; supabase?: never; userId?: never } |
  { error?: never; supabase: ReturnType<typeof createClient>; userId: string }
> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { error: jsonResponse({ error: 'UNAUTHENTICATED' }, 401) };

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!user) return { error: jsonResponse({ error: 'UNAUTHENTICATED' }, 401) };

  const { data: allowed, error: quotaErr } = await supabase.rpc('consume_pdf_os_ai_action', { p_user_id: user.id });
  if (quotaErr) return { error: jsonResponse({ error: 'QUOTA_CHECK_FAILED' }, 500) };
  if (!allowed) return { error: jsonResponse({ error: 'QUOTA_EXCEEDED' }, 402) };

  return { supabase, userId: user.id };
}
