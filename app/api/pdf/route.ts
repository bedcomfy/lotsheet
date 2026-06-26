// Server-side PDF export, with a cache so "Print PDF" feels instant.
//
// A headless Chromium renders the live app page at /?print=1 into a Letter PDF
// (1:1 with the website, identical on every device). Generated PDFs are cached
// by a signature of the sheet + flags, and the client pre-builds the PDF in the
// background after edits — so by the time you click, it's already made and the
// request just returns the stored file.

import { createHash } from "crypto";
import { getSheet, getFlags, getState, getPdfCache, setPdfCache } from "../../lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUILD = "chromium-html-3";
// Bump when the print layout changes so old cached PDFs are invalidated.
const PDF_VERSION = "18";

// Sheets rendered by the deterministic react-pdf templates (no headless browser)
// instead of Chromium. Migrating sheet-by-sheet — the rest still use Chromium.
const REACT_PDF_PATHS = new Set(["/fuel", "/def"]);

// Recursively sort object keys so the signature doesn't depend on key/row
// order (Postgres returns flag rows in no guaranteed order).
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    return Object.keys(obj)
      .sort()
      .reduce<Record<string, unknown>>((o, k) => {
        o[k] = stable(obj[k]);
        return o;
      }, {});
  }
  return v;
}

function signature(data: unknown, maint: boolean): string {
  return createHash("sha1")
    .update(JSON.stringify({ v: PDF_VERSION, maint: !!maint, data: stable(data ?? null) }))
    .digest("hex");
}

// The data a sheet's PDF is built from — used for the cache signature so a
// cached PDF is reused until the underlying sheet actually changes.
async function sheetData(path: string) {
  if (path === "/") {
    const [{ sheet }, flags] = await Promise.all([getSheet(), getFlags()]);
    return { sheet, flags };
  }
  // Include the universal flags (R/H/I indicators) AND the bus master (the lane
  // list / types) so either change invalidates the cached PDF.
  const [{ value }, flags, busMaster] = await Promise.all([
    getState(path.slice(1)),
    getFlags(),
    getState("bus_master"),
  ]);
  return { value, flags, busMaster: busMaster.value || null };
}

const PDF_HEADERS = {
  "Content-Type": "application/pdf",
  "Content-Disposition": 'inline; filename="lot-sheet.pdf"',
  "Cache-Control": "no-store",
};

// Local dev sets CHROME_EXECUTABLE_PATH to a normal Chrome; production uses the
// bundled @sparticuz/chromium build. The puppeteer/chromium objects are typed
// loosely (any) — this is runtime glue around external headless-Chrome libs.
async function launchBrowser(): Promise<any> {
  const puppeteer: any = (await import("puppeteer-core")).default;

  const localPath = process.env.CHROME_EXECUTABLE_PATH;
  if (localPath) {
    return puppeteer.launch({
      headless: true,
      executablePath: localPath,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  // Force the AL2023 path so @sparticuz/chromium extracts its bundled shared
  // libraries (libnss3, etc.) — Vercel runs on Lambda but doesn't set the env
  // var the package checks. Must be set before importing it.
  process.env.AWS_EXECUTION_ENV = "AWS_Lambda_nodejs20.x";
  const chromium: any = (await import("@sparticuz/chromium")).default;
  chromium.setGraphicsMode = false;
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    defaultViewport: chromium.defaultViewport,
  });
}

// Sheets that can be exported to PDF. Each must render its print view at
// `<path>?print=1` and expose a #print-ready marker when loaded.
const ALLOWED_PATHS = new Set(["/", "/fuel", "/def", "/turnover"]);

// Deterministic, pure-JS render for the Fuel / DEF sheets via @react-pdf/renderer
// — no headless browser. Reads the same live data the screen uses (lane list,
// per-bus entries, universal flags). Imports are dynamic so the heavy renderer
// only loads when one of these sheets is actually generated.
async function renderReactPdf(path: string, maint: boolean, fz: number | null): Promise<Buffer> {
  const [{ renderToBuffer }, { buildFuelDoc }, { busHelpers, DEFAULT_MASTER }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("../../lib/pdf/FuelPdf"),
    import("../../lib/buses"),
  ]);
  const storageKey = path.slice(1); // "fuel" | "def"
  const [{ value }, flags, masterState] = await Promise.all([
    getState(storageKey),
    getFlags(),
    getState("bus_master"),
  ]);
  const mv = masterState.value as { buses?: unknown } | null;
  const master = mv && Array.isArray(mv.buses) ? mv : DEFAULT_MASTER;
  const lane = busHelpers(master as any).laneBuses();
  const isDef = storageKey === "def";
  const doc = buildFuelDoc({
    title: isDef ? "PNW DEF SHEET" : "PNW FUEL SHEET",
    showShiftFields: isDef,
    data: (value as any) || { entries: {} },
    lane,
    flags,
    fontPx: fz ?? 14,
    showFlags: maint,
  });
  return await renderToBuffer(doc);
}

async function renderPdf(req: Request, maint: boolean, path: string, fz: number | null): Promise<Buffer> {
  const host = req.headers.get("host");
  const proto =
    req.headers.get("x-forwarded-proto") ||
    (host && host.startsWith("localhost") ? "http" : "https");
  const pageUrl =
    `${proto}://${host}${path}?print=1&maint=${maint ? "1" : "0"}` + (fz ? `&fz=${fz}` : "");

  // On a cold start the chromium binary is still being extracted to /tmp when we
  // try to spawn it, which fails with "spawn ETXTBSY" (text file busy). Retry a
  // couple of times with a short backoff so a cold print doesn't just error out.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    let browser: any;
    try {
      browser = await launchBrowser();
      const page = await browser.newPage();
      await page.goto(pageUrl, { waitUntil: "networkidle0", timeout: 45000 });
      await page.waitForSelector("#print-ready", { timeout: 20000 });
      const pdf = await page.pdf({ format: "letter", printBackground: true, preferCSSPageSize: true });
      return Buffer.from(pdf);
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err);
      const transient = /ETXTBSY|spawn|Failed to launch|Target closed|Protocol error/i.test(msg);
      if (!transient || attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    } finally {
      if (browser) await browser.close();
    }
  }
  throw lastErr;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const maint = url.searchParams.get("maint") === "1";
  const prewarm = url.searchParams.get("prewarm") === "1";
  let path = url.searchParams.get("path") || "/";
  if (!ALLOWED_PATHS.has(path)) path = "/";
  // Optional font size (fuel/def) so the printout matches the chosen on-screen size.
  const fzRaw = parseInt(url.searchParams.get("fz") || "", 10);
  const fz = Number.isNaN(fzRaw) ? null : Math.max(8, Math.min(16, fzRaw));

  const name = path === "/" ? "lot-sheet" : path.replace(/\W+/g, "");
  const headers = { ...PDF_HEADERS, "Content-Disposition": `inline; filename="${name}.pdf"` };

  try {
    // Every sheet is cached by a signature of its data (+ font), so a later
    // "Print PDF" (or a background prewarm after edits) returns instantly.
    const sig = signature({ d: await sheetData(path), fz }, maint);
    const cached = await getPdfCache(path, maint);
    if (cached && cached.signature === sig && cached.data) {
      if (prewarm) return Response.json({ ok: true, cached: true });
      return new Response(Buffer.from(cached.data, "base64") as unknown as BodyInit, { status: 200, headers });
    }

    // Cache miss — generate (the slow path) and store for next time.
    const pdf = REACT_PDF_PATHS.has(path)
      ? await renderReactPdf(path, maint, fz)
      : await renderPdf(req, maint, path, fz);
    await setPdfCache(path, maint, sig, pdf.toString("base64"));
    if (prewarm) return Response.json({ ok: true, cached: false });
    return new Response(pdf as unknown as BodyInit, { status: 200, headers });
  } catch (err: any) {
    let diag = "";
    try {
      const fs = await import("node:fs");
      diag =
        ` | node=${process.version}` +
        ` awsenv=${process.env.AWS_EXECUTION_ENV || "-"}` +
        ` ld=${process.env.LD_LIBRARY_PATH || "-"}` +
        ` al2023nss=${fs.existsSync("/tmp/al2023/lib/libnss3.so")}`;
    } catch {}
    return new Response(`PDF generation failed [${BUILD}]: ${err?.message || err}${diag}`, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
