import { failureResponse, readOracle, readParameters, requireSameOrigin } from "../../../lib/fusion/server";
import { accessResponse, withFusionAccess } from "../../../lib/fusion/access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    requireSameOrigin(request);
    const query = readParameters(new URL(request.url).searchParams);
    const value = await withFusionAccess(request, token => readOracle(token, query.resource, query.search, query.offset), { persist: true });
    return accessResponse(value, { ...value.result, expiresAt: value.expiresAt });
  } catch (error) {
    // An earlier read can finish after another tab saves newer access. Browser
    // expiry and explicit Disconnect own cookie removal, not stale responses.
    return failureResponse(error);
  }
}
