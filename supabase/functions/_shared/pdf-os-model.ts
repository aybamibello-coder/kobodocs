// Shared by every PDF OS REMOTE tool that needs document content.
// Does NOT render PDFs itself — that requires a browser canvas, which the
// Deno edge runtime doesn't reliably provide. Rendering happens client-side
// (pdf-os/extract-client.js), same proven pattern as the live ocr-pdf-pages
// function. This module just resolves whatever the client already
// prepared (text layer, or base64 page images) into plain text, then
// makes the task-specific model call.
//
// Confirmed against the live ocr-pdf-pages function: env var is
// GEMINI_API_KEY, model is gemini-2.5-flash.

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const GEMINI_MODEL = 'gemini-2.5-flash';

export type DocumentInput =
  | { mode: 'text'; text: string }
  | { mode: 'images'; images: { data: string; mime_type: string }[] };

const OCR_SYSTEM_PROMPT = `You transcribe text from scanned document page images.
Transcribe ALL visible text exactly as it appears, in order, no commentary.
Respond ONLY with valid JSON: {"pages": ["page 1 text", "page 2 text", ...]}`;

export async function resolveDocumentText(input: DocumentInput): Promise<string> {
  if (input.mode === 'text') return input.text;

  // Same call shape as ocr-pdf-pages: all page images in one Gemini call.
  const imageParts = input.images.map((img) => ({ inlineData: { mimeType: img.mime_type, data: img.data } }));
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: OCR_SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [...imageParts, { text: `Transcribe these ${input.images.length} page image(s) in order.` }] }],
      generationConfig: { maxOutputTokens: 8000, responseMimeType: 'application/json' }
    })
  });
  if (!res.ok) throw new Error('OCR_CALL_FAILED');
  const data = await res.json();
  const raw = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('\n')?.trim();
  if (!raw) throw new Error('OCR_EMPTY_RESULT');
  const parsed = JSON.parse(raw);
  return (parsed.pages || []).join('\n\n');
}

export async function callModel(args: { system: string; document: string; question?: string; instruction?: string }): Promise<string> {
  const userText = args.question
    ? `Document:\n${args.document}\n\nQuestion: ${args.question}`
    : `Document:\n${args.document}\n\n${args.instruction || 'Summarize this document.'}`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: args.system }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }]
    })
  });
  if (!res.ok) throw new Error('MODEL_CALL_FAILED');
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

export async function callModelForJson(args: { system: string; document: string; instruction: string }): Promise<unknown> {
  const raw = await callModel({ ...args, system: args.system + ' Respond ONLY with valid JSON, no markdown fences, no preamble.' });
  const cleaned = raw.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}
