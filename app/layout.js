import "./globals.css";

export const metadata = {
  title: "Lot Sheet",
  description: "Digital lot sheet",
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
      <body>{children}</body>
    </html>
  );
}
