// Server-side PDF export. Renders /print with a headless Chromium and returns a
// Letter-size PDF, so the printout is identical on every device/browser (it no
// longer depends on each OS's own print engine).

import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
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
    return new Response(`PDF generation failed: ${err?.message || err}`, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  } finally {
    if (browser) await browser.close();
  }
}
