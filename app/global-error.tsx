"use client";

// Last-resort boundary for errors thrown by the ROOT layout itself (before the
// normal error.tsx can render). It replaces the whole document, so it ships its
// own <html>/<body> and inline styles (globals.css isn't guaranteed here).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1a1d23",
          color: "#e8eaee",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", padding: 24, maxWidth: 440 }}>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ color: "#9aa1ac", lineHeight: 1.5, margin: "0 0 18px" }}>
            The app hit an unexpected error. Your saved data is safe — reload to continue.
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: "none",
              background: "#4f8ef7",
              color: "#fff",
              fontWeight: 600,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error?.digest && (
            <p style={{ color: "#6b7280", fontSize: 12, marginTop: 16 }}>Reference: {error.digest}</p>
          )}
        </div>
      </body>
    </html>
  );
}
