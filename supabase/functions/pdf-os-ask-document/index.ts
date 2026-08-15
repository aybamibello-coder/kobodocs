import { requireAiQuota, jsonResponse } from '../_shared/pdf-os-guard.ts';
import { resolveDocumentText, callModel, type DocumentInput } from '../_shared/pdf-os-model.ts';

Deno.serve(async (req) => {
  const gate = await requireAiQuota(req);
  if (gate.error) return gate.error;

  const { document_input, question } = await req.json().catch(() => ({}));
  if (!document_input || !question) return jsonResponse({ error: 'BAD_REQUEST' }, 400);

  try {
    const documentText = await resolveDocumentText(document_input as DocumentInput);
    const answer = await callModel({
      system: 'Answer the question using only the document text provided. If the answer is not in the document, say so plainly.',
      document: documentText,
      question
    });
    return jsonResponse({ output_text: answer });
  } catch (e) {
    // Refund the AI-action quota unit consumed by requireAiQuota() above --
    // a failed call (e.g. upstream 503) shouldn't cost the user one of
    // their limited actions. Best-effort: if the refund itself fails,
    // still return the original error rather than masking it.
    await gate.supabase.rpc('refund_pdf_os_ai_action', { p_user_id: gate.userId }).catch(() => {});
    return jsonResponse({ error: 'TOOL_FAILED', detail: String(e) }, 500);
  }
});
