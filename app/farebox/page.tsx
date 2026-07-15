import FareboxSheet from "../components/FareboxSheet";

// Standalone route: the PDF renderer loads /farebox?print=1, and deep links
// keep working. The everyday way in is the Service Sheets page (/service).
export default function FareboxPage() {
  return <FareboxSheet />;
}
