import type { Metadata } from "next";
import FusionPartsPage from "../../components/FusionPartsPage";

export const metadata: Metadata = { title: "Northwest Parts | Lotsheet", robots: { index: false, follow: false } };
export default function Page() { return <FusionPartsPage />; }
