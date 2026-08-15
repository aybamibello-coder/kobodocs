// Minimal client-side error telemetry for PDF OS during early rollout --
// there's no way to remotely inspect a user's mobile browser console, so
// this lets the client report an unhandled error (message/stack, no file
// content, no PII beyond the auth'd user id already on the JWT) somewhere
// query_logs can actually see it. Intentionally tiny: this is a debugging
// aid for this rollout, not a permanent analytics pipeline.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    let userId = 'unknown';
    if (authHeader) {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
      if (user) userId = user.id;
    }
    const body = await req.json().catch(() => ({}));
    console.error('PDF_OS_CLIENT_ERROR', JSON.stringify({ userId, ...body }));
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
