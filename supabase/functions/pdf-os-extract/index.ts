import { requireAiQuota, jsonResponse } from '../_shared/pdf-os-guard.ts';
import { extractDocumentText, callModelForJson } from '../_shared/pdf-os-model.ts';

Deno.serve(async (req) => {
  const gate = await requireAiQuota(req);
  if (gate.error) return gate.error;

  const form = await req.formData();
  const file = form.get('file') as File;
  const input = JSON.parse((form.get('input') as string) || '{}');
  if (!file) return jsonResponse({ error: 'BAD_REQUEST' }, 400);

  const fields: string[] = input.fields && input.fields.length ? input.fields : ['all key fields and any table rows'];

  try {
    const documentText = await extractDocumentText(file);
    const data = await callModelForJson({
      system: 'Extract structured data from the document as JSON.',
      document: documentText,
      instruction: `Extract these fields: ${fields.join(', ')}. Return a JSON object; use an array under a "rows" key for any tabular data.`
    });
    return jsonResponse({ output_data: data });
  } catch (e) {
    return jsonResponse({ error: 'TOOL_FAILED', detail: String(e) }, 500);
  }
});
