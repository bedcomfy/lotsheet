"use client";

import { useEffect } from "react";
import { Button } from "./ui";
import styles from "./ErrorPage.module.css";

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
    <main className={styles.page}>
      <div className={styles.card}>
        <h1>Something went wrong</h1>
        <p>
          This screen hit an unexpected error. Your saved sheets and data are safe — try again, or
          head back to the home screen.
        </p>
        <div className={styles.actions}>
          <Button variant="primary" onPress={() => reset()}>
            Try again
          </Button>
          <Button onPress={() => window.location.assign("/home")}>
            Go to Home
          </Button>
        </div>
        {error?.digest && <p className={styles.digest}>Reference: {error.digest}</p>}
      </div>
    </main>
  );
}
