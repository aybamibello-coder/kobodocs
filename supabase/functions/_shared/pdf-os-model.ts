// Shared by every PDF OS REMOTE tool: turn a PDF into text (reusing the
// same render+OCR path as ocr-pdf-pages), then call the model.
import { getDocument } from 'https://esm.sh/pdfjs-dist@3.11.174/legacy/build/pdf.mjs';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const GEMINI_MODEL = 'gemini-2.0-flash';

export async function extractDocumentText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const doc = await getDocument({ data: buf }).promise;

  // Try the text layer first — cheap, no model call needed for
  // born-digital PDFs (invoices, statements exported as PDF, etc.).
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: any) => it.str).join(' ') + '\n';
  }

  if (text.trim().length > 40) return text; // has a real text layer

  // No usable text layer -> scanned doc -> same OCR path as ocr-pdf-pages:
  // render each page to an image and send to Gemini vision.
  const pageImages: string[] = [];
  for (let i = 1; i <= Math.min(doc.numPages, 10); i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = new OffscreenCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx as any, viewport }).promise;
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    pageImages.push(await blobToBase64(blob));
  }

  return callGeminiVisionOcr(pageImages);
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

async function callGeminiVisionOcr(pageImagesBase64: string[]): Promise<string> {
  const parts = pageImagesBase64.map((b64) => ({ inlineData: { mimeType: 'image/png', data: b64 } }));
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: 'Transcribe all text from these document pages, in order. Return plain text only.' }, ...parts] }]
    })
  });
  if (!res.ok) throw new Error('OCR_CALL_FAILED');
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  buf.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}
