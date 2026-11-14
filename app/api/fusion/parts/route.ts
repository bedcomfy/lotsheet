import { failureResponse, FusionFailure, privateJson, requireSameOrigin, savedAccess } from "../../../lib/fusion/server";
import { partsParameters, readPartHistory, readPartsContext, readPartsIndex, readStockReport } from "../../../lib/fusion/parts-server";
import type { IndexKind } from "../../../lib/fusion/parts";

export const dynamic = "force-dynamic";
export const maxDuration = 90;
export async function GET(request: Request) {
  try {
    requireSameOrigin(request);
    const query = partsParameters(new URL(request.url).searchParams);
    const access = savedAccess(request);
    if (!access) throw new FusionFailure("AUTH", 401);
    const result = query.kind === "context" ? await readPartsContext(access.token)
      : query.kind === "history" ? await readPartHistory(access.token, query.itemId, query.bus, query.offset)
      : query.kind === "stock-report" ? await readStockReport(access.token, query.offset)
      : await readPartsIndex(access.token, query.kind as IndexKind, query.offset);
    return privateJson(result);
  } catch (error) { return failureResponse(error); }
}
