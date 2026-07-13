"use client";

import { useEffect } from "react";

// Route-level error boundary: if any page/segment throws while rendering, this
// friendly fallback shows instead of a white screen. "Try again" re-renders the
// segment; the data itself is untouched.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced for debugging; a real error reporter could hook in here.
    console.error(error);
  }, [error]);

  return (
    <main className="errpage">
      <div className="errpage__card">
        <h1>Something went wrong</h1>
        <p>
          This screen hit an unexpected error. Your saved sheets and data are safe — try again, or
          head back to the home screen.
        </p>
        <div className="errpage__actions">
          <button className="btn btn--primary" onClick={() => reset()}>
            Try again
          </button>
          <a className="btn" href="/home">
            Go to Home
          </a>
        </div>
        {error?.digest && <p className="errpage__digest">Reference: {error.digest}</p>}
      </div>
    </main>
  );
}
