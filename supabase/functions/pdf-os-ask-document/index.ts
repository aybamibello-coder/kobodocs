// PDF OS — ask_document edge function
// Same shape as the existing ocr-pdf-pages function: verify the caller's
// session, check + atomically decrement their AI action quota, THEN do
// the model call. The quota check happening here (not in the client) is
// what makes it a real enforcement point rather than a UI convenience —
// same principle as PdfToolkitGuard / PdfOsGuard on the client side.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'UNAUTHENTICATED' }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!user) return json({ error: 'UNAUTHENTICATED' }, 401);

  // Atomic check-and-increment via a Postgres function, not a
  // read-then-write from this handler — avoids a race between two
  // concurrent requests both reading "quota available" before either
  // writes back. See db/functions/consume_pdf_os_ai_action.sql.
  const { data: allowed, error: quotaErr } = await supabase.rpc('consume_pdf_os_ai_action', {
    p_user_id: user.id
  });
  if (quotaErr) return json({ error: 'QUOTA_CHECK_FAILED' }, 500);
  if (!allowed) return json({ error: 'QUOTA_EXCEEDED' }, 402);

  const form = await req.formData();
  const file = form.get('file') as File;
  const input = JSON.parse(form.get('input') as string);

  if (!file || !input?.question) return json({ error: 'BAD_REQUEST' }, 400);

  // Extract text first (reuses the same pdf.js render + OCR path as
  // ocr-pdf-pages when the doc is scanned; a text-layer PDF skips
  // straight to extraction). Then a single model call answers the
  // question grounded in that text.
  const documentText = await extractDocumentText(file);
  const answer = await callModel({
    system: 'Answer the question using only the document text provided. If the answer is not in the document, say so.',
    document: documentText,
    question: input.question
  });

  return json({ output_text: answer });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

async function extractDocumentText(_file: File): Promise<string> {
  // Shares implementation with ocr-pdf-pages's extraction step.
  throw new Error('NOT_IMPLEMENTED_IN_SKELETON');
}

async function callModel(_args: { system: string; document: string; question: string }): Promise<string> {
  // Same model provider already in use for ocr-pdf-pages (Gemini) —
  // reuse that client rather than adding a second provider.
  throw new Error('NOT_IMPLEMENTED_IN_SKELETON');
}
