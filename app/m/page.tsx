import MobileApp from "../components/mapp/MobileApp";

// The phone app. Phones landing on / or /home are brought here by MobileGate;
// desktop and print never see it.
export default function MobilePage() {
  return <MobileApp />;
}
