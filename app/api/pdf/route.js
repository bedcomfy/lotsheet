// Server-side PDF export, rendered with @react-pdf/renderer (pure JS — no
// headless browser / native libraries). Deterministic Letter-size output that
// prints identically on every device.

import { renderToBuffer } from "@react-pdf/renderer";
import { getSheet, getFlags } from "../../lib/store";
import { buildSheetPdf } from "../../lib/SheetPdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BUILD = "reactpdf-1";

export async function GET(req) {
  const maint = new URL(req.url).searchParams.get("maint") === "1";
  try {
    const [{ sheet }, flags] = await Promise.all([getSheet(), getFlags()]);
    const buf = await renderToBuffer(buildSheetPdf({ sheet, flags, maint }));
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="lot-sheet.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return new Response(`PDF generation failed [${BUILD}]: ${err?.message || err}`, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
