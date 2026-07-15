import PrintBlankSheets from "../../components/PrintBlankSheets";

// Print-only composition: one blank copy of every service sheet in a single
// PDF (loaded by the renderer as /service/print-blank?print=1&blank=1).
// Not linked in the nav.
export default function ServicePrintBlankPage() {
  return <PrintBlankSheets />;
}
