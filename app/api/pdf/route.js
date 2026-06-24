// Server-side PDF export. Renders /print with a headless Chromium and returns a
// Letter-size PDF, so the printout is identical on every device/browser (it no
// longer depends on each OS's own print engine).

import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Self-contained Chromium pack (binary + shared libraries like libnss3) is
// downloaded to /tmp at runtime. This avoids the bundler dropping the sibling
// .so files, which caused "libnss3.so: cannot open shared object file". The
// version here must match the @sparticuz/chromium-min package version.
const CHROMIUM_PACK =
  "https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar";

// Bumped on each PDF-pipeline change so the live error text tells us which
// build is actually serving (helps diagnose deploys we can't watch directly).
const BUILD = "pdf-min-3-node20";

export async function GET(req) {
  const url = new URL(req.url);
  const maint = url.searchParams.get("maint") === "1" ? "1" : "0";
  const fz = url.searchParams.get("fz") || "0";

  // Build the print URL from the incoming request's host (works on whatever
  // domain the app is served from).
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const printUrl = `${proto}://${host}/print?maint=${maint}&fz=${encodeURIComponent(fz)}`;

  let browser;
  try {
    // No on-screen graphics needed for PDF rendering; reduces required libs.
    chromium.setGraphicsMode = false;
    browser = await puppeteer.launch({
      args: [...chromium.args, "--no-sandbox", "--disable-setuid-sandbox"],
      executablePath: await chromium.executablePath(CHROMIUM_PACK),
      headless: chromium.headless,
      defaultViewport: chromium.defaultViewport,
    });
    const page = await browser.newPage();
    await page.goto(printUrl, { waitUntil: "networkidle0", timeout: 45000 });
    const pdf = await page.pdf({
      format: "letter",
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    return new Response(Buffer.from(pdf), {
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
  } finally {
    if (browser) await browser.close();
  }
}
