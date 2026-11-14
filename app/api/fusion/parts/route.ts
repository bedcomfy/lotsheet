import { failureResponse, FusionFailure, requireSameOrigin } from "../../../lib/fusion/server";
import { accessResponse, withFusionAccess } from "../../../lib/fusion/access";
import { partsParameters, readPartHistory, readPartsContext, readPartsIndex, readStockReport } from "../../../lib/fusion/parts-server";
import type { IndexKind } from "../../../lib/fusion/parts";

export const dynamic = "force-dynamic";
export const maxDuration = 180;
export async function GET(request: Request) {
  try {
    requireSameOrigin(request);
    const query = partsParameters(new URL(request.url).searchParams);
    const value = await withFusionAccess(request, async token => query.kind === "context" ? readPartsContext(token)
      : query.kind === "history" ? readPartHistory(token, query.itemId, query.bus, query.offset)
      : query.kind === "stock-report" ? readStockReport(token, query.offset)
      : readPartsIndex(token, query.kind as IndexKind, query.offset), { persist: query.kind === "context", pinned: query.kind !== "context" });
    return accessResponse(value, { ...value.result, expiresAt: value.expiresAt });
  } catch (error) {
    if (error instanceof FusionFailure && error.diagnostic) console.warn("fusion_parts_read", { code: error.code, ...error.diagnostic });
    return failureResponse(error);
  }
}
