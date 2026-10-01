import PmMileagePage from "../components/PmMileagePage";
import PmMileagePrintView from "../components/PmMileagePrintView";
import { normalizePmFilter } from "../lib/pmMileage";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  if (params.print === "1") {
    return <PmMileagePrintView filter={normalizePmFilter(params.pmFilter)} query={typeof params.pmQuery === "string" ? params.pmQuery : ""} />;
  }
  return <PmMileagePage />;
}
