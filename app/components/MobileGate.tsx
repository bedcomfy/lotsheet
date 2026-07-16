"use client";

// Sends PHONES that land on the site's front doors (/ and /home) to the phone
// app at /m. Renders nothing, changes nothing for desktop:
//   - only acts on viewports under 700px
//   - never acts in print mode (?print=1 — the PDF renderer's URLs)
//   - never acts on deep links (only / and /home), so every desktop page stays
//     reachable from a phone via the app's More tab or a direct URL
//   - "Use the desktop site" in the app sets pace:m:optout, which disables it

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function MobileGate() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/" && pathname !== "/home") return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("print") === "1") return;
    if (window.innerWidth >= 700) return;
    try {
      if (localStorage.getItem("pace:m:optout") === "1") return;
    } catch {}
    router.replace("/m");
  }, [pathname, router]);

  return null;
}
