import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const config = JSON.parse(await readFile(new URL("vercel.json", root), "utf8"));
const html = await readFile(new URL("unavailable/index.html", root), "utf8");
assert.deepEqual(await readdir(new URL("unavailable/", root)), ["index.html"], "The published directory must contain only the notice.");
assert.equal(config.framework, null);
assert.equal(config.installCommand, "");
assert.equal(config.buildCommand, "");
assert.equal(config.outputDirectory, "unavailable");
assert.equal(config.git.deploymentEnabled, false);
assert.doesNotMatch(html, /<script\b|<iframe\b|<form\b|\bon\w+\s*=|\b(?:src|href)\s*=|url\s*\(|@import/i, "The notice must not load code, data, or external resources.");
assert.match(html, /This service is no longer available\./);
console.log("PASS: static notice contains no application code or external resources.");

const origin = process.argv[2];
if (!origin) process.exit(0);
const target = new URL(origin);
assert.equal(target.protocol, "https:");
assert.equal(target.pathname, "/");
assert.equal(target.search, "");
assert.equal(target.hash, "");

// Run only against the separately deployed notice project, after checking its
// deployment contains no application functions. No credentials are required.
const paths = ["/", "/parts", "/fusion", "/sheets/123/print", "/api/state", "/api/fusion/catalog", "/api/pm-mileage/import", "/_next/static/old-app.js", "/.env", "/vercel.json", "/index.html", "/unknown/path?test=1"];
for (const path of paths) {
  const response = await fetch(new URL(path, target), { redirect: "manual", signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 503, path);
  assert.equal(await response.text(), html, path);
  assert.match(response.headers.get("cache-control") ?? "", /no-store/, path);
  assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'none'/, path);
  console.log(`PASS: GET ${path} returns only the unavailable notice.`);
}
for (const method of ["HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
  const response = await fetch(new URL("/api/fusion/catalog", target), { method, redirect: "manual", signal: AbortSignal.timeout(20000) });
  // Vercel can answer static OPTIONS requests itself with an empty 204.
  if (method === "OPTIONS" && response.status === 204) {
    assert.equal(await response.text(), "");
    console.log("PASS: OPTIONS returns an empty platform response; no application handler.");
    continue;
  }
  assert.ok([405, 503].includes(response.status), `${method}: unexpected ${response.status}`);
  const body = await response.text();
  if (method !== "HEAD" && response.status === 503) assert.equal(body, html, method);
  console.log(`PASS: ${method} cannot access an application handler (${response.status}).`);
}
