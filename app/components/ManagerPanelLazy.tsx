"use client";

import dynamic from "next/dynamic";

// The flag editor is 750+ lines and only appears when someone taps "Edit
// Flags" — every sheet imports THIS wrapper so the code loads on first open
// (one shared chunk, cached across routes) instead of on every page load.
export default dynamic(() => import("./ManagerPanel"), { ssr: false });
