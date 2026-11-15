import { requireSameOrigin, failureResponse, privateJson, FusionFailure } from "../../../lib/fusion/server";
import { withFusionAccess } from "../../../lib/fusion/access";
import { readSavedCatalog, saveCatalog } from "../../../lib/fusion/catalog-store";
import { captureCatalog } from "../../../lib/fusion/catalog-server";

export const dynamic = "force-dynamic";
export const maxDuration = 180;
// The saved business catalog is deliberately independent of Oracle credentials.
export async function GET(request: Request) {
  try { requireSameOrigin(request); return privateJson({ catalog: await readSavedCatalog() }); }
  catch (error) { return error instanceof FusionFailure ? failureResponse(error) : privateJson({ error: "The saved Northwest catalog could not be loaded." }, 503); }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const access = await withFusionAccess(request, token => captureCatalog(token));
    await saveCatalog(access.result);
    return privateJson({ catalog: await readSavedCatalog() });
  } catch (error) { return failureResponse(error); }
}
