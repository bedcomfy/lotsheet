import type { Metadata } from "next";
import FusionConnectionPage from "../components/FusionConnectionPage";

export const metadata: Metadata = { title: "Oracle Fusion | Pace Northwest Sheets", robots: { index: false, follow: false } };

export default function Page() { return <FusionConnectionPage />; }
