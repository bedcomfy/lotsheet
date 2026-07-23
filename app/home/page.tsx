import HomeDashboard from "../components/HomeDashboard";
import TonightPage from "../components/mapp/TonightPage";

// Desktop gets the full dashboard; phones get the Tonight board (the shell's
// home). Both read the same shared live data, so the numbers always agree.
export default function HomePage() {
  return (
    <>
      <div className="desktop-only">
        <HomeDashboard />
      </div>
      <div className="mobile-only">
        <TonightPage />
      </div>
    </>
  );
}
