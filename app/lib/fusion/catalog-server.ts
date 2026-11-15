import { buildSavedCatalog, type CatalogSource } from "./catalog";
import { readCatalogNumbers, readPartsContext, readPartsIndex, readStockReport } from "./parts-server";
import { type Part, type PartLocation } from "./parts";
import { FusionFailure } from "./server";

export async function captureCatalog(token: string) {
  await readPartsContext(token);
  const startedAt = Date.now();
  async function scan(kind: "catalog" | "locations" | "subinventories") {
    let offset = 0; const rows: (Part | PartLocation)[] = [], seen = new Set<string>();
    while (true) {
      if (Date.now() - startedAt > 145000) throw new FusionFailure("NETWORK", 502);
      const page = await readPartsIndex(token, kind, offset);
      for (const row of page.items as (Part | PartLocation)[]) {
        const key = "id" in row ? row.id : row.key;
        if (seen.has(key)) throw new FusionFailure("FORMAT", 502);
        seen.add(key); rows.push(row);
      }
      if (!page.hasMore) return rows;
      if (page.nextOffset <= offset || page.nextOffset > 100000) throw new FusionFailure("FORMAT", 502);
      offset = page.nextOffset;
    }
  }
  async function scanReferences() {
    const references: NonNullable<CatalogSource["references"]> = []; let offset = 0;
    while (true) {
      if (Date.now() - startedAt > 145000) throw new FusionFailure("NETWORK", 502);
      const page = await readCatalogNumbers(token, offset); references.push(...page.items);
      if (!page.hasMore) return references;
      if (page.nextOffset <= offset || page.nextOffset > 100000) throw new FusionFailure("FORMAT", 502);
      offset = page.nextOffset;
    }
  }
  const [parts, locations, subinventories, references] = await Promise.all([scan("catalog"), scan("locations"), scan("subinventories"), scanReferences()]);
  const reportLocations: CatalogSource["reportLocations"] = [];
  let offset = 0;
  while (true) {
    if (Date.now() - startedAt > 145000) throw new FusionFailure("NETWORK", 502);
    const page = await readStockReport(token, offset);
    reportLocations.push(...page.items.map(({ itemId, partNumber, subinventory, locator }) => ({ itemId, partNumber, subinventory, locator })));
    if (!page.hasMore) break;
    if (page.nextOffset <= offset || page.nextOffset > 100000) throw new FusionFailure("FORMAT", 502);
    offset = page.nextOffset;
  }
  return buildSavedCatalog({ startedAt, fetchedAt: Date.now(), parts: parts as Part[], locations: locations as PartLocation[], subinventories: subinventories as PartLocation[], reportLocations, references });
}
