import { accessResponse, withFusionAccess } from "../../../lib/fusion/access";
import { diagnoseParts } from "../../../lib/fusion/parts-server";
import type { IndexKind } from "../../../lib/fusion/parts";
import { failureResponse, FusionFailure, requireSameOrigin, verifyOracleAccess } from "../../../lib/fusion/server";
import { machineAuthorized } from "../../../lib/fusion/vault";

export const dynamic = "force-dynamic";
export const maxDuration = 180;
export async function GET(request: Request) {
  try {
    requireSameOrigin(request);
    if (!machineAuthorized(request)) throw new FusionFailure("FORBIDDEN", 403);
    const params = new URL(request.url).searchParams, kind = params.get("kind") ?? "catalog";
    if ([...params.keys()].some(key => key !== "kind") || params.getAll("kind").length > 1 || !["catalog", "locations", "subinventories", "balances"].includes(kind)) throw new FusionFailure("REQUEST", 400);
    const value = await withFusionAccess(request, async token => { await verifyOracleAccess(token); return diagnoseParts(token, kind as IndexKind); });
    return accessResponse(value);
  } catch (error) { return failureResponse(error); }
}
