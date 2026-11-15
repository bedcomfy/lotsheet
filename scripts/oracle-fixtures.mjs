// Offline, read-only fixture explorer. Never contacts Oracle or loads credentials.
import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("../app/lib/fusion/fixtures/live/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", root), "utf8"));
const fixtures = new Map(manifest.filter(m => m.status === 200).map(m => [m.name, JSON.parse(readFileSync(new URL(m.name + ".json", root), "utf8"))]));
if (process.argv.includes("--contracts")) {
  const contracts = manifest.map(entry => {
    const body = fixtures.get(entry.name), fields = new Map();
    function walk(value, path = "$", depth = 0) {
      const type = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
      if (!fields.has(path)) fields.set(path, new Set()); fields.get(path).add(type);
      if (depth > 12) return;
      if (Array.isArray(value)) value.forEach(v => walk(v, path + "[]", depth + 1));
      else if (value && typeof value === "object") Object.entries(value).forEach(([k,v]) => walk(v, path + "." + k, depth + 1));
    }
    if (body) walk(body);
    return { ...entry, note: "Observed response types only; not a complete Oracle schema or write contract.", fields: Object.fromEntries([...fields].map(([k,v]) => [k,[...v].sort()])) };
  });
  writeFileSync(new URL("contracts.json", root), JSON.stringify(contracts, null, 2) + "\n");
  console.log(`Generated ${contracts.length} observed response contracts.`);
} else {
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json"); response.setHeader("Cache-Control", "no-store");
    if (request.method !== "GET") { response.writeHead(405); response.end(JSON.stringify({ error: "Read-only offline fixtures" })); return; }
    const pathname = new URL(request.url, "http://localhost").pathname;
    const name = pathname.startsWith("/fixtures/") ? pathname.slice(10) : null;
    const body = pathname === "/fixtures" || pathname === "/" ? manifest : fixtures.get(name);
    response.writeHead(body ? 200 : 404); response.end(JSON.stringify(body ?? { error: "No captured fixture for this name" }));
  });
  server.listen(4010, "127.0.0.1", () => console.log("Offline Oracle fixtures: http://127.0.0.1:4010/fixtures (GET only; no Oracle connection)"));
}
