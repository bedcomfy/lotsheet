// Loaded ONLY by playwright.fusion.config.ts into its isolated Next.js server.
// The app's real handlers and cookies run; Oracle's network boundary is mocked.
// Production code has no test endpoint, alternate upstream, or mock-mode flag.
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.origin !== "https://iaymqy.fa.ocs.oraclecloud.com") return nativeFetch(input, options);
  const request = new Request(input, options);
  const authorization = request.headers.get("authorization") ?? "";
  const report = url.pathname === "/xmlpserver/services/ExternalReportWSSService";
  if (request.method !== (report ? "POST" : "GET") || request.headers.has("cookie") || !authorization.match(/^Bearer e30\.[A-Za-z0-9_-]+\.mock-token-\d+$/)) {
    return Response.json({ error: "Unexpected synthetic Oracle request" }, { status: 401 });
  }
  if (url.searchParams.get("q") === "WorkOrderNumber='REAUTH'") {
    return Response.json({ privateError: "never-forward-upstream-error" }, { status: 401 });
  }
  if (url.pathname.endsWith("/maintenanceWorkOrders")) return Response.json({
    items: [{ WorkOrderNumber: "NWD-1683", WorkOrderDescription: "Inspection", WorkOrderStatus: "Released", AssetNumber: "6396",
      PlannedStartDate: "2026-11-13T08:00:00Z", PlannedCompletionDate: null, privateField: "never-forward-business-field" }], hasMore: false,
  });
  if (url.pathname.endsWith("/installedBaseAssets")) return Response.json({
    items: [{ AssetNumber: "6396", Description: "Test bus", ItemNumber: "BUS", SerialNumber: "TEST-ONLY",
      OperatingOrganizationCode: "NWD", CurrentLocationName: "Garage" }], hasMore: false,
  });
  const org = { OrganizationId: 300000004581674, OrganizationCode: "NWD" };
  const catalog = [
    { ...org, ItemId: 100000024478060, ItemNumber: "910090", ItemDescription: "ENGINE COOLANT BULK", PrimaryUOMCode: "QT", PrimaryUOMValue: "Quart", ItemStatusValue: "Active" },
    { ...org, ItemId: 100000024478086, ItemNumber: "910103", ItemDescription: "ENGINE COOLANT PREMIX", PrimaryUOMCode: "QT", PrimaryUOMValue: "Quart", ItemStatusValue: "Active" },
  ];
  const offset = Number(url.searchParams.get("offset") ?? 0);
  // Intentionally cap pages to one row: app must use actual offsets, not its requested 250.
  const page = rows => Response.json({ items: rows.slice(offset, offset + 1), hasMore: offset + 1 < rows.length, offset });
  if (report) {
    const body = await request.text();
    if (!body.includes("<p:runReport>") || !body.includes("Pace Northwest Division") || !body.includes("PACE_Buyers_Inventory_12_Month_Usage_Report")) return new Response("Bad report", { status: 400 });
    const numbers = [...body.matchAll(/<p:item>(\d+)<\/p:item>/g)].map(match => match[1]);
    const cells = values => "<tr>" + values.map(v => `<td>${v}</td>`).join("") + "</tr>";
    const html = "<table>" + cells(["ITEM_NUMBER", "ORGANIZATION_CODE", "SUBINVENTORY_CODE", "SEGMENT1", "SEGMENT2", "SEGMENT3", "OH_QTY"]) + numbers.map(n => cells([n, "NWD", "Northwest", "TANK AREA", "**", "**", n === "910090" ? "3060.47" : "678"])).join("") + "</table>";
    return new Response(`<reportBytes>${Buffer.from(html).toString("base64")}</reportBytes>`);
  }
  const q = url.searchParams.get("q") ?? "";
  if (!q.includes("OrganizationId=300000004581674")) return new Response("Missing Northwest scope", { status: 400 });
  if (url.pathname.endsWith("/itemsV2")) return page(catalog);
  if (url.pathname.endsWith("/locatorItems")) return page([{ ...org, InventoryItemId: catalog[0].ItemId, LocatorItemId: 300000021769924, ItemNumber: "910090", SubinventoryCode: "Northwest", LocatorName: "TANK AREA-**-**" }]);
  if (url.pathname.endsWith("/subinventoryItems")) return page([{ ...org, InventoryItemId: catalog[0].ItemId, SubinventoryItemId: "100000024478060_300000012931087", ItemNumber: "910090", SecondaryInventory: "Northwest" }]);
  if (url.pathname.endsWith("/inventoryOnhandBalances")) return Response.json({}, { status: 403 });
  if (url.pathname.endsWith("/maintenanceWorkOrderTransactionHistory")) {
    const component = Number(q.match(/ComponentItemId=(\d+)/)?.[1]);
    if (component !== catalog[0].ItemId) return page([]);
    return page([
      { ...org, TransactionId: 1, WorkOrderId: 10, WorkOrderNumber: "NWD-1680", AssetNumber: "6403", ComponentItemId: component, OperationSequenceNumber: 10, TransactionDate: "2026-11-13T03:00:00Z", TransactionType: "MATERIAL_ISSUE", Quantity: 22, UnitOfMeasure: "Quart", SubInventory: "Northwest", LocatorCode: "TANK AREA-**-**", CreatedBy: "Synthetic technician" },
      { ...org, TransactionId: 2, WorkOrderId: 20, WorkOrderNumber: "NWD-1676", AssetNumber: "6396", ComponentItemId: component, TransactionType: "MATERIAL_ISSUE", Quantity: 2, UnitOfMeasure: "Quart" },
      { ...org, TransactionId: 3, WorkOrderId: 10, WorkOrderNumber: "NWD-1680", AssetNumber: "6403", ComponentItemId: component, TransactionType: "MATERIAL_RETURN", Quantity: 1, UnitOfMeasure: "Quart" },
    ]);
  }
  return Response.json({ error: "Unexpected Oracle path" }, { status: 404 });
};
