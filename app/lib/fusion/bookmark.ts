import { startFusionBridge } from "./bridge";
import { FUSION_ORIGIN, FUSION_PROTOCOL } from "./config";

export function createFusionBookmark(appOrigin: string): string {
  const url = new URL(appOrigin);
  if (url.username || url.password ||
      (url.protocol !== "https:" &&
       !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    throw new Error("A secure Lotsheet address is required.");
  }
  const config = { appOrigin: url.origin, fusionOrigin: FUSION_ORIGIN,
    protocol: FUSION_PROTOCOL };
  // Encode the script, including its fragment character, as one bookmark URL.
  return "javascript:" + encodeURIComponent("void (" + startFusionBridge.toString() + ")(" + JSON.stringify(config) + ")");
}
