// Server-side PDF export, with a cache so "Print PDF" feels instant.
//
// A headless Chromium renders the live app page at /?print=1 into a Letter PDF
// (1:1 with the website, identical on every device). Generated PDFs are cached
// by a signature of the sheet + flags, and the client pre-builds the PDF in the
// background after edits — so by the time you click, it's already made and the
// request just returns the stored file.

import { createHash } from "crypto";
import { getSheet, getFlags, getPdfCache, setPdfCache } from "../../lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUILD = "chromium-html-3";
// Bump when the print layout changes so old cached PDFs are invalidated.
const PDF_VERSION = "1";

// Recursively sort object keys so the signature doesn't depend on key/row
// order (Postgres returns flag rows in no guaranteed order).
function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") {
    return Object.keys(v)
      .sort()
      .reduce((o, k) => {
        o[k] = stable(v[k]);
        return o;
      }, {});
  }
  return v;
}

function signature(sheet, flags, maint) {
  return createHash("sha1")
    .update(JSON.stringify({ v: PDF_VERSION, maint: !!maint, sheet: stable(sheet || null), flags: stable(flags || {}) }))
    .digest("hex");
}

const PDF_HEADERS = {
  "Content-Type": "application/pdf",
  "Content-Disposition": 'inline; filename="lot-sheet.pdf"',
  "Cache-Control": "no-store",
};

// Local dev sets CHROME_EXECUTABLE_PATH to a normal Chrome; production uses the
// bundled @sparticuz/chromium build.
async function launchBrowser() {
  const puppeteer = (await import("puppeteer-core")).default;

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
  const chromium = (await import("@sparticuz/chromium")).default;
  chromium.setGraphicsMode = false;
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    defaultViewport: chromium.defaultViewport,
  });
}

async function renderPdf(req, maint) {
  const host = req.headers.get("host");
  const proto =
    req.headers.get("x-forwarded-proto") ||
    (host && host.startsWith("localhost") ? "http" : "https");
  const pageUrl = `${proto}://${host}/?print=1&maint=${maint ? "1" : "0"}`;

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.goto(pageUrl, { waitUntil: "networkidle0", timeout: 45000 });
    await page.waitForSelector("#print-ready", { timeout: 20000 });
    const pdf = await page.pdf({ format: "letter", printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    if (browser) await browser.close();
  }
}

export async function GET(req) {
  const url = new URL(req.url);
  const maint = url.searchParams.get("maint") === "1";
  const prewarm = url.searchParams.get("prewarm") === "1";

  try {
    const [{ sheet }, flags] = await Promise.all([getSheet(), getFlags()]);
    const sig = signature(sheet, flags, maint);

    // Serve from cache when the sheet + flags haven't changed since last build.
    const cached = await getPdfCache(maint);
    if (cached && cached.signature === sig && cached.data) {
      if (prewarm) return Response.json({ ok: true, cached: true });
      return new Response(Buffer.from(cached.data, "base64"), { status: 200, headers: PDF_HEADERS });
    }

    // Cache miss — generate (this is the slow path) and store for next time.
    const pdf = await renderPdf(req, maint);
    await setPdfCache(maint, sig, pdf.toString("base64"));
    if (prewarm) return Response.json({ ok: true, cached: false });
    return new Response(pdf, { status: 200, headers: PDF_HEADERS });
  } catch (err) {
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
