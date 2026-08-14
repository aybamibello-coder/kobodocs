import { requireAiQuota, jsonResponse } from '../_shared/pdf-os-guard.ts';
import { extractDocumentText, callModel } from '../_shared/pdf-os-model.ts';

Deno.serve(async (req) => {
  const gate = await requireAiQuota(req);
  if (gate.error) return gate.error;

  const form = await req.formData();
  const file = form.get('file') as File;
  if (!file) return jsonResponse({ error: 'BAD_REQUEST' }, 400);

  try {
    const documentText = await extractDocumentText(file);
    const summary = await callModel({
      system: 'Summarize the document in 3-5 sentences, plain language, no preamble.',
      document: documentText,
      instruction: 'Summarize this document.'
    });
    return jsonResponse({ output_text: summary });
  } catch (e) {
    return jsonResponse({ error: 'TOOL_FAILED', detail: String(e) }, 500);
  }
});
