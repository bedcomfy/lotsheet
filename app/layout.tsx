import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import SheetNav from "./components/SheetNav";
import { BusMasterProvider } from "./components/BusMasterProvider";

export const metadata: Metadata = {
  title: "Pace Sheets",
  description: "Digital garage sheets — lot, turnover, fuel",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Allow pinch-zoom so the full grid stays usable on phones.
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <BusMasterProvider>
          <SheetNav />
          {children}
        </BusMasterProvider>
      </body>
    </html>
  );
}
