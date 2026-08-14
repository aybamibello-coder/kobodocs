// ---------- PDF OS tool contract ----------
// Single source of truth for what tools the agent can call. Sent to the
// planning edge function so the LLM knows what's available; also read by
// the client executor to decide LOCAL vs REMOTE dispatch.
//
// LOCAL  = runs entirely in-browser via pdf-lib/pdf.js, same technique as
//          the existing free Toolkit pages. File bytes never leave the
//          device. Does NOT count against AI action quota — only against
//          the agent-run count for the overall request.
// REMOTE = requires a real model. File (or rendered page images) is sent
//          to a Supabase Edge Function, same pattern as ocr-pdf-pages.
//          Counts against the AI action quota, checked server-side inside
//          the edge function itself.

window.PdfOsTools = [
  {
    name: 'merge_pdf',
    dispatch: 'LOCAL',
    description: 'Combine multiple PDFs into one, in a given order.',
    input_schema: {
      type: 'object',
      properties: {
        file_ids: { type: 'array', items: { type: 'string' }, description: 'Ordered list of file ids to merge.' }
      },
      required: ['file_ids']
    }
  },
  {
    name: 'split_pdf',
    dispatch: 'LOCAL',
    description: 'Split a PDF by page range, or into one file per page.',
    input_schema: {
      type: 'object',
      properties: {
        file_id: { type: 'string' },
        mode: { type: 'string', enum: ['range', 'every_page'] },
        ranges: { type: 'array', items: { type: 'string' }, description: 'e.g. ["1-3","4-6"], required when mode is range' }
      },
      required: ['file_id', 'mode']
    }
  },
  {
    name: 'compress_pdf',
    dispatch: 'LOCAL',
    description: 'Shrink a PDF by stripping metadata and repacking its object structure.',
    input_schema: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'] }
  },
  {
    name: 'convert_image_to_pdf',
    dispatch: 'LOCAL',
    description: 'Convert one or more JPG/PNG images into a PDF, one image per page.',
    input_schema: { type: 'object', properties: { file_ids: { type: 'array', items: { type: 'string' } } }, required: ['file_ids'] }
  },
  {
    name: 'convert_pdf_to_image',
    dispatch: 'LOCAL',
    description: 'Render PDF pages out as JPG/PNG images.',
    input_schema: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'] }
  },
  {
    name: 'watermark_pdf',
    dispatch: 'LOCAL',
    description: 'Stamp text across every page of a PDF.',
    input_schema: {
      type: 'object',
      properties: { file_id: { type: 'string' }, text: { type: 'string' }, opacity: { type: 'number' } },
      required: ['file_id', 'text']
    }
  },

  // ---- REMOTE: needs a real model, hits an edge function, counts as an AI action ----
  {
    name: 'ocr_pdf',
    dispatch: 'REMOTE',
    edge_function: 'ocr-pdf-pages',
    description: 'Extract editable text from a scanned or photographed PDF.',
    input_schema: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'] }
  },
  {
    name: 'ask_document',
    dispatch: 'REMOTE',
    edge_function: 'pdf-os-ask-document',
    description: 'Answer a natural-language question about the contents of a document.',
    input_schema: { type: 'object', properties: { file_id: { type: 'string' }, question: { type: 'string' } }, required: ['file_id', 'question'] }
  },
  {
    name: 'summarize_document',
    dispatch: 'REMOTE',
    edge_function: 'pdf-os-summarize',
    description: 'Produce a short summary of a document.',
    input_schema: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'] }
  },
  {
    name: 'extract_data',
    dispatch: 'REMOTE',
    edge_function: 'pdf-os-extract',
    description: 'Pull structured fields or table data out of a document (e.g. invoice line items, bank statement rows).',
    input_schema: { type: 'object', properties: { file_id: { type: 'string' }, fields: { type: 'array', items: { type: 'string' } } }, required: ['file_id'] }
  }
];
