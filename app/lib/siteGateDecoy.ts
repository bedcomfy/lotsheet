// The decoy served by proxy.ts to browsers without the unlock cookie: a
// self-contained typing-speed test with no link to the real site. It posts
// each finished run to GATE_UNLOCK_PATH; a run whose text is the passphrase
// comes back as a "personal best" and the page reloads into the real site.
// Kept as plain HTML/CSS/JS on purpose so it shares nothing with the app
// (no chunks, fonts, icons, manifest, or styles that could identify it).

import { GATE_UNLOCK_PATH } from "./siteGate";

const PASSAGES = [
  "The quick brown fox jumps over the lazy dog while the sun sets slowly behind the distant hills and the evening air turns cool.",
  "Practice makes progress. Keep your eyes on the text, your wrists relaxed, and let your fingers find their own steady rhythm.",
  "A river carves its path not through strength but through persistence, returning to the same stone day after day until it yields.",
  "Good writing is clear thinking made visible. Short sentences carry more weight than long ones that wander off without a point.",
  "The library opened at nine, and by ten every table near the windows was taken by students with coffee, notebooks, and headphones.",
  "Sailors once navigated by the stars, reading the night sky the way we now read a map on a glowing screen held in one hand.",
  "Bread rises slowly in a warm kitchen. Patience is the only ingredient you cannot buy at the store, and it is the one that matters most.",
];

const STYLE = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body { font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2430; background: #f4f5f9; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 32px 16px 48px; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 36px; }
  .brand { font-weight: 700; font-size: 18px; letter-spacing: 0.04em; color: #3b4cca; }
  .brand span { color: #1f2430; font-weight: 500; }
  nav a { color: #6b7280; text-decoration: none; margin-left: 18px; font-size: 14px; }
  nav a.on { color: #1f2430; font-weight: 600; }
  h1 { font-size: 28px; margin: 0 0 6px; }
  .hint { margin: 0 0 24px; color: #6b7280; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px; }
  .stat { background: #fff; border: 1px solid #e3e5ec; border-radius: 12px; padding: 14px 16px; }
  .stat b { display: block; font-size: 26px; font-weight: 700; line-height: 1.1; }
  .stat small { color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; font-size: 11px; }
  .card { background: #fff; border: 1px solid #e3e5ec; border-radius: 16px; padding: 22px; box-shadow: 0 1px 2px rgba(20, 24, 40, 0.04); }
  .passage { font: 20px/1.7 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; color: #9aa0ad; margin-bottom: 18px; }
  .passage .ok { color: #1f2430; }
  .passage .bad { color: #c2410c; text-decoration: underline; text-decoration-color: #f97316; }
  .passage .cur { border-left: 2px solid #3b4cca; margin-left: -2px; }
  input { width: 100%; font: 18px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; padding: 12px 14px; border: 1px solid #cfd3de; border-radius: 10px; background: #fbfbfd; color: #1f2430; outline: none; }
  input:focus { border-color: #3b4cca; box-shadow: 0 0 0 3px rgba(59, 76, 202, 0.15); }
  input:disabled { background: #f1f2f6; color: #6b7280; }
  .actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 16px; flex-wrap: wrap; }
  button { font: inherit; font-weight: 600; padding: 9px 16px; border-radius: 10px; border: 1px solid #3b4cca; background: #3b4cca; color: #fff; cursor: pointer; }
  button.ghost { background: #fff; color: #3b4cca; }
  .tip { color: #6b7280; font-size: 14px; }
  .result { margin-top: 20px; padding: 16px 18px; border-radius: 12px; background: #eef1ff; color: #1f2430; }
  .result b { font-size: 18px; }
  .result[hidden] { display: none; }
  footer { margin-top: 36px; color: #9aa0ad; font-size: 13px; text-align: center; }
  @media (max-width: 520px) { h1 { font-size: 24px; } .passage { font-size: 17px; } .stat b { font-size: 22px; } nav a { margin-left: 12px; } }
`;

const SCRIPT = `
(function () {
  var PASSAGES = ${JSON.stringify(PASSAGES)};
  var RESULTS_URL = ${JSON.stringify(GATE_UNLOCK_PATH)};
  var passageEl = document.getElementById('passage');
  var input = document.getElementById('typed');
  var wpmEl = document.getElementById('wpm');
  var accEl = document.getElementById('acc');
  var timeEl = document.getElementById('time');
  var result = document.getElementById('result');
  var resultText = document.getElementById('result-text');
  var restart = document.getElementById('restart');
  var again = document.getElementById('again');
  var passage = '', started = 0, timer = null, done = false, last = -1;

  function escapeChar(c) {
    return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c;
  }
  function pick() {
    var i;
    do { i = Math.floor(Math.random() * PASSAGES.length); } while (PASSAGES.length > 1 && i === last);
    last = i;
    passage = PASSAGES[i];
    started = 0; done = false;
    if (timer) clearInterval(timer);
    timer = null;
    input.value = '';
    input.disabled = false;
    result.hidden = true;
    timeEl.textContent = '0:00';
    wpmEl.textContent = '0';
    accEl.textContent = '100%';
    render('');
    input.focus();
  }
  function render(typed) {
    var html = '';
    for (var i = 0; i < passage.length; i++) {
      var cls = i < typed.length ? (typed.charAt(i) === passage.charAt(i) ? 'ok' : 'bad') : (i === typed.length ? 'cur' : '');
      html += '<span class="' + cls + '">' + escapeChar(passage.charAt(i)) + '</span>';
    }
    passageEl.innerHTML = html;
  }
  function stats(typed) {
    var correct = 0;
    for (var i = 0; i < typed.length && i < passage.length; i++) if (typed.charAt(i) === passage.charAt(i)) correct++;
    var minutes = started ? (Date.now() - started) / 60000 : 0;
    var wpm = minutes > 0 ? Math.round((correct / 5) / minutes) : 0;
    var acc = typed.length ? Math.round((correct / typed.length) * 100) : 100;
    return { wpm: wpm, acc: acc };
  }
  function tick() {
    var s = Math.floor((Date.now() - started) / 1000);
    timeEl.textContent = Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
    var st = stats(input.value);
    wpmEl.textContent = String(st.wpm);
    accEl.textContent = st.acc + '%';
  }
  function finish(early) {
    if (done) return;
    done = true;
    if (timer) clearInterval(timer);
    var typed = input.value;
    var st = stats(typed);
    input.disabled = true;
    result.hidden = false;
    resultText.innerHTML = (early ? 'Stopped early. ' : 'Nice work! ') + '<b>' + st.wpm + ' WPM</b> at <b>' + st.acc + '%</b> accuracy.';
    submit(typed, st);
  }
  function submit(text, st) {
    try {
      fetch(RESULTS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: text, wpm: st.wpm, accuracy: st.acc })
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.personalBest) location.reload();
      }).catch(function () {});
    } catch (e) {}
  }
  input.addEventListener('input', function () {
    if (done) return;
    if (!started) { started = Date.now(); timer = setInterval(tick, 250); }
    render(input.value);
    tick();
    if (input.value.length >= passage.length) finish(false);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!done && input.value.length) finish(true);
    }
  });
  restart.addEventListener('click', pick);
  again.addEventListener('click', pick);
  pick();
})();
`;

export function decoyPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Typing Speed Test</title>
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand">keyflow<span>.</span></div>
    <nav><a class="on" href="#">Test</a><a href="#">Practice</a><a href="#">About</a></nav>
  </header>
  <main>
    <h1>Typing Speed Test</h1>
    <p class="hint">Type the text below as quickly and accurately as you can. The timer starts with your first keystroke.</p>
    <section class="stats" aria-label="Live results">
      <div class="stat"><b id="wpm">0</b><small>WPM</small></div>
      <div class="stat"><b id="acc">100%</b><small>Accuracy</small></div>
      <div class="stat"><b id="time">0:00</b><small>Time</small></div>
    </section>
    <section class="card">
      <div class="passage" id="passage" aria-hidden="true"></div>
      <input id="typed" type="text" aria-label="Type the text here" placeholder="Start typing here…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done">
      <div class="actions">
        <button id="restart" class="ghost" type="button">New text</button>
        <span class="tip">Press Enter to stop early</span>
      </div>
      <div class="result" id="result" hidden>
        <div id="result-text"></div>
        <div class="actions"><button id="again" type="button">Try again</button></div>
      </div>
    </section>
  </main>
  <footer>keyflow — a simple typing practice tool</footer>
</div>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
