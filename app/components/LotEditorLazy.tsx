"use client";

import dynamic from "next/dynamic";

// The lot list editor only appears when someone taps a lot to edit it — every
// sheet imports THIS wrapper so the code loads on first open (one shared
// chunk, cached across routes) instead of on every page load.
export default dynamic(() => import("./LotEditor"), { ssr: false });
