"use client";

// Browser-side PDF text extraction. The report PDFs are scans of several
// megabytes, more than a serverless request may carry, so the browser reads
// the text layer itself with pdf.js and sends only the positioned text (a
// few hundred kilobytes at most) to the import route. Same shape the server
// reader produces, so the parsers don't know the difference.

import type { PositionedText } from "./pmReport";

export async function readPdfTextInBrowser(file: File): Promise<PositionedText[][]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, disableFontFace: true }).promise;
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
        items.push({
          text: item.str,
          x: Math.round(x * 100) / 100,
          y: Math.round(y * 100) / 100,
          dirX: Math.round((a / len) * 1000) / 1000,
          dirY: Math.round((b / len) * 1000) / 1000,
        });
      }
      pages.push(items);
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}
