/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep the Postgres driver and the headless-Chromium packages out of the
  // server bundle (they're loaded at runtime via dynamic import). Stable in
  // Next 15+, so no longer under `experimental`.
  serverExternalPackages: ["pg", "@sparticuz/chromium", "puppeteer-core", "@electric-sql/pglite"],
  // Force the Chromium binary AND its sibling shared libraries (libnss3.so, etc.)
  // into the /api/pdf function bundle. Next's tracer includes the binary but
  // misses these runtime-loaded files — the cause of the earlier
  // "libnss3.so: cannot open shared object file" failures on Vercel.
  outputFileTracingIncludes: {
    "/api/pdf": ["./node_modules/@sparticuz/chromium/**"],
  },
};

export default nextConfig;
