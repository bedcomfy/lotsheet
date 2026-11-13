import { failureResponse, FusionFailure, privateJson, readOracle, readParameters, requireSameOrigin, savedAccess } from "../../../lib/fusion/server";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(request: Request) {
  try {
    requireSameOrigin(request);
    const query = readParameters(new URL(request.url).searchParams);
    const access = savedAccess(request);
    if (!access) throw new FusionFailure("AUTH", 401);
    return privateJson(await readOracle(access.token, query.resource, query.search, query.offset));
  } catch (error) {
    // An earlier read can finish after another tab saves newer access. Browser
    // expiry and explicit Disconnect own cookie removal, not stale responses.
    return failureResponse(error);
  }
}
