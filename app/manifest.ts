import type { MetadataRoute } from "next";

// Makes the site installable ("Add to Home Screen"): a real icon + full-screen
// standalone launch with no browser chrome. Next serves this at /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pace Northwest Sheets",
    short_name: "Pace NW Sheets",
    description: "Digital garage sheets — lot, turnover, fuel, DEF",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/logo.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/logo.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/logo.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
