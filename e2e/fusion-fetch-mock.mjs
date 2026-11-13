// Loaded ONLY by playwright.fusion.config.ts into its isolated Next.js server.
// The app's real handlers and cookies run; Oracle's network boundary is mocked.
// Production code has no test endpoint, alternate upstream, or mock-mode flag.
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.origin !== "https://iaymqy.fa.ocs.oraclecloud.com") return nativeFetch(input, options);
  const request = new Request(input, options);
  const authorization = request.headers.get("authorization") ?? "";
  if (request.method !== "GET" || request.headers.has("cookie") || !authorization.match(/^Bearer e30\.[A-Za-z0-9_-]+\.mock-token-\d+$/)) {
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
  return Response.json({ error: "Unexpected Oracle path" }, { status: 404 });
};
