// Server-side PDF export. A headless Chromium loads the *actual* app page at
// /?print=1 and prints it to a Letter PDF — so the PDF is 1:1 with the website
// and there's a single layout to maintain. Output is identical on every device.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUILD = "chromium-html-2";

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

  // @sparticuz/chromium only extracts its bundled shared libraries (libnss3,
  // etc.) and sets LD_LIBRARY_PATH when it detects an AWS Lambda runtime via
  // AWS_EXECUTION_ENV. Vercel runs on Lambda but doesn't set it the way the
  // package expects, so it skips extraction and Chromium can't find libnss3.
  // Force the AL2023 path (matches Vercel's Node 20+ runtime) BEFORE importing
  // the package — its environment setup runs at import time.
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

export async function GET(req) {
  const url = new URL(req.url);
  const maint = url.searchParams.get("maint") === "1" ? "1" : "0";

  const host = req.headers.get("host");
  const proto =
    req.headers.get("x-forwarded-proto") ||
    (host && host.startsWith("localhost") ? "http" : "https");
  const pageUrl = `${proto}://${host}/?print=1&maint=${maint}`;

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.goto(pageUrl, { waitUntil: "networkidle0", timeout: 45000 });
    await page.waitForSelector("#print-ready", { timeout: 20000 });
    const pdf = await page.pdf({
      format: "letter",
      printBackground: true,
      preferCSSPageSize: true,
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
    // Diagnostics so a remaining failure tells us the runtime state directly.
    let diag = "";
    try {
      const fs = await import("node:fs");
      diag =
        ` | node=${process.version}` +
        ` awsenv=${process.env.AWS_EXECUTION_ENV || "-"}` +
        ` ld=${process.env.LD_LIBRARY_PATH || "-"}` +
        ` al2023nss=${fs.existsSync("/tmp/al2023/lib/libnss3.so")}` +
        ` al2nss=${fs.existsSync("/tmp/al2/lib/libnss3.so")}`;
    } catch {}
    return new Response(`PDF generation failed [${BUILD}]: ${err?.message || err}${diag}`, {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  } finally {
    if (browser) await browser.close();
  }
}
