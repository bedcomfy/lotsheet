// Shared "Print PDF" opener used by every sheet. Opens a tab synchronously
// (so it isn't pop-up-blocked), flushes the sheet's latest data to the server,
// then loads the server-rendered PDF — auto-opening the print dialog on desktop
// and the native PDF viewer on mobile.
export function openSheetPdf({ path = "/", maint = false, params = {}, flush } = {}) {
  if (typeof window === "undefined") return;
  const qs = new URLSearchParams({ path, maint: maint ? "1" : "0" });
  for (const [k, v] of Object.entries(params)) if (v != null) qs.set(k, String(v));
  const target = `/api/pdf?${qs.toString()}`;
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");
  const w = window.open("", "_blank");

  const go = () => {
    if (!w) {
      window.location.href = target;
      return;
    }
    if (isMobile) {
      w.location = target;
      return;
    }
    w.document.write(
      '<!doctype html><html><head><meta charset="utf-8"><title>Sheet</title>' +
        "<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100vh;display:block}</style>" +
        '</head><body><iframe src="' +
        target +
        '"></iframe><script>' +
        'var f=document.getElementsByTagName("iframe")[0];' +
        'f.addEventListener("load",function(){setTimeout(function(){try{f.contentWindow.focus();f.contentWindow.print();}catch(e){}},600);});' +
        "<\/script></body></html>"
    );
    w.document.close();
  };

  Promise.resolve(flush ? flush() : null)
    .catch(() => {})
    .then(go);
}
