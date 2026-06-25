import "./globals.css";
import SheetNav from "./components/SheetNav";
import { BusMasterProvider } from "./components/BusMasterProvider";

export const metadata = {
  title: "Pace Sheets",
  description: "Digital garage sheets — lot, turnover, fuel",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  // Allow pinch-zoom so the full grid stays usable on phones.
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({ children }) {
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
