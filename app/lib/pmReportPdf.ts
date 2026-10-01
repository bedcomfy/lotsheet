// Server-only: pull the positioned text out of a PDF with pdf.js and hand it
// to the pure report parser. Works on any PDF that has a text layer — the
// garage's scanner adds one (OCR) — and returns no rows for photo-only scans,
// which is the cue to fall back to the AI reader if one is configured.

import { parsePmReport, type PmReportParse, type PositionedText } from "./pmReport";

export async function readPdfText(pdf: Buffer): Promise<PositionedText[][]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdf),
    useSystemFonts: true,
    disableFontFace: true,
  }).promise;
  const pages: PositionedText[][] = [];
  try {
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items: PositionedText[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const [a, b, , , x, y] = item.transform;
        const len = Math.hypot(a, b) || 1;
        items.push({ text: item.str, x, y, dirX: a / len, dirY: b / len });
      }
      pages.push(items);
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}

export async function parsePmReportPdf(pdf: Buffer): Promise<PmReportParse> {
  return parsePmReport(await readPdfText(pdf));
}
