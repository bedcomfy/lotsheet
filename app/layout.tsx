import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import SheetNav from "./components/SheetNav";
import { BusMasterProvider } from "./components/BusMasterProvider";
import FlagConfigProvider from "./components/FlagConfigProvider";
import BusTypeConfigProvider from "./components/BusTypeConfigProvider";

export const metadata: Metadata = {
  title: "Pace Northwest Sheets",
  description: "Digital garage sheets — lot, turnover, fuel",
  // Installable app ("Add to Home Screen"): real icon, full-screen standalone
  // launch with no browser bars. The manifest lives in app/manifest.ts.
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pace NW Sheets",
  },
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Allow pinch-zoom so the full grid stays usable on phones.
  maximumScale: 5,
  userScalable: true,
};

// Applies the saved (or default) theme to <html> BEFORE first paint, so the
// dark chrome never flashes light on load. Defaults to dark — the app's look —
// unless the device has saved "light".
const THEME_INIT = `(function(){try{var t=localStorage.getItem('pace:theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <BusMasterProvider>
          <FlagConfigProvider>
            <BusTypeConfigProvider>
              <SheetNav />
              {/* The wide sheet is contained here (overflow-x: clip) instead of on
                  <body>, so the sticky mobile nav can pin to the viewport — a clip
                  on <body> makes body children stick to the scrolling body instead. */}
              <div className="appmain">{children}</div>
            </BusTypeConfigProvider>
          </FlagConfigProvider>
        </BusMasterProvider>
      </body>
    </html>
  );
}
