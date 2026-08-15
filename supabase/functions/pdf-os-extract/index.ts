import { requireAiQuota, jsonResponse } from '../_shared/pdf-os-guard.ts';
import { resolveDocumentText, callModelForJson, type DocumentInput } from '../_shared/pdf-os-model.ts';

Deno.serve(async (req) => {
  const gate = await requireAiQuota(req);
  if (gate.error) return gate.error;

  const { document_input, fields } = await req.json().catch(() => ({}));
  if (!document_input) return jsonResponse({ error: 'BAD_REQUEST' }, 400);

  const fieldList: string[] = fields && fields.length ? fields : ['all key fields and any table rows'];

  try {
    const documentText = await resolveDocumentText(document_input as DocumentInput);
    const data = await callModelForJson({
      system: 'Extract structured data from the document as JSON.',
      document: documentText,
      instruction: `Extract these fields: ${fieldList.join(', ')}. Return a JSON object; use an array under a "rows" key for any tabular data.`
    });
    return jsonResponse({ output_data: data });
  } catch (e) {
    // Refund the AI-action quota unit consumed by requireAiQuota() above --
    // a failed call (e.g. upstream 503) shouldn't cost the user one of
    // their limited actions. Best-effort: if the refund itself fails,
    // still return the original error rather than masking it.
    await gate.supabase.rpc('refund_pdf_os_ai_action', { p_user_id: gate.userId }).catch(() => {});
    return jsonResponse({ error: 'TOOL_FAILED', detail: String(e) }, 500);
  }
});
