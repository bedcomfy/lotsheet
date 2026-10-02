// The decoy served by proxy.ts to browsers without the unlock cookie: a
// self-contained typing-speed test with no link to the real site. It posts
// each finished run to GATE_UNLOCK_PATH; a run whose text is the passphrase
// comes back as a "personal best" and the page reloads into the real site.
// Kept as plain HTML/CSS/JS on purpose so it shares nothing with the app
// (no chunks, fonts, icons, manifest, or styles that could identify it).
//
// Behaves like a real typing site: the box turns red as soon as the typed
// text leaves the passage, wrong letters are highlighted in the passage, a
// progress bar fills, passages come from a large pool split by length and
// never repeat recently used texts across reloads, Tab gives a new text,
// and recent results stay in the browser's localStorage.

import { GATE_UNLOCK_PATH } from "./siteSession";
import { DECOY_ICON_DATA_URI } from "./siteGateIcon";

const PASSAGES = [
  // short
  "The quick brown fox jumps over the lazy dog near the quiet riverbank.",
  "Practice makes progress, not perfection. Keep your wrists loose and your eyes on the text.",
  "A single candle can light a whole room, but only if someone bothers to strike the match.",
  "Rain on a tin roof sounds like applause for a show nobody can see.",
  "Good tools do not make a craftsman, but a craftsman always keeps good tools.",
  "The library smelled of paper and dust, and nobody there was in a hurry.",
  "Sailors once read the stars the way we now read maps on glowing screens.",
  "Honey never spoils. Jars found in ancient tombs were still perfectly edible.",
  "Every expert was once a beginner who refused to quit on a bad day.",
  "The kettle clicked off, and for a moment the kitchen was completely silent.",
  "Octopuses have three hearts, and two of them stop beating when they swim.",
  "A map is only useful if you also know where you are standing on it.",
  "Morning fog hid the far shore, so the lake looked as wide as an ocean.",
  "Bananas are berries, but strawberries are not. Botany has a sense of humor.",
  "Write the first draft quickly. Edit the second one slowly.",
  // medium
  "Bread rises slowly in a warm kitchen. Patience is the only ingredient you cannot buy at the store, and it is the one that matters most.",
  "A river carves its path not through strength but through persistence, returning to the same stone day after day until the stone gives way.",
  "The train left at seven, exactly on time, and the platform emptied so fast you would think the whole town had somewhere better to be.",
  "Good writing is clear thinking made visible. Short sentences carry more weight than long ones that wander around looking for a point.",
  "Sound travels about four times faster through water than through air, which is why whales can hear each other across entire oceans.",
  "The old clock in the hallway ran six minutes fast, and nobody had fixed it in years because everyone had simply learned to subtract.",
  "Learning to type well is less about speed and more about rhythm. Speed arrives on its own once the rhythm stops breaking.",
  "A lighthouse does not run around the island looking for ships to save. It stands where it is and keeps its light steady.",
  "The first photograph ever taken needed an exposure of about eight hours, so the sun appears on both sides of the buildings.",
  "Nobody remembers the meeting where everything went according to plan. They remember the one where the projector caught fire.",
  "The vegetable garden had been planted in neat rows in April, and by August it had become a cheerful, overgrown argument with itself.",
  "When the power went out, the neighbors came outside with flashlights and discovered they had been living next to each other for years.",
  "Venus spins so slowly that a single day there lasts longer than its entire year, which makes birthday planning a philosophical problem.",
  "A good recipe tells you what to do. A great recipe tells you what it should look like when you have done it right.",
  "The museum guard had worked the same gallery for thirty years and still found something new in the paintings every single week.",
  // long
  "The orchestra tuned for a long minute, a swirl of unrelated notes searching for a single pitch, and then the hall went still. The conductor raised one hand, waited, and let the silence stretch until it felt like part of the music.",
  "Most of the salt in the ocean came from rivers, which pick up tiny amounts of minerals from rocks and carry them downstream for millions of years. The sea never gives the salt back, so it keeps slowly growing saltier.",
  "The bakery opened at five, long before the street woke up, and by the time the first streetcar rolled past the windows were fogged and the shelves were already half empty. Regulars did not need to order; they just nodded.",
  "A bicycle stays upright not because the rider is clever but because of a quiet partnership between momentum, steering, and the shape of the front fork. Push it riderless down a gentle hill and it will balance itself for a while.",
  "Before refrigeration, ice was cut from frozen lakes in winter, packed in sawdust, and shipped around the world. A block harvested in New England could end up cooling a drink in India months later, only slightly smaller.",
  "The best advice she ever got was to finish things. Not perfectly, not impressively, just finished. A finished page can be fixed in the morning, but a page that never gets written stays exactly as blank as the day it was started.",
  "Deep in the cave the air was the same temperature all year, and the only sound was water finding its way through stone one drop at a time. Visitors whispered without being asked to, as if the place had its own rule about noise.",
  "A chess clock does not care how brilliant your plan is. It only counts the seconds you spend admiring it. Strong players learn to make the good move now instead of hunting for the perfect move until the flag falls.",
];

const STYLE = `
  :root { color-scheme: light; --ink: #1f2430; --muted: #6b7280; --line: #e3e5ec; --brand: #3b4cca; --ok: #16a34a; --bad: #dc2626; --bad-bg: #fee2e2; }
  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body { font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: var(--ink); background: #f4f5f9; }
  a { color: inherit; }
  .wrap { max-width: 780px; margin: 0 auto; padding: 28px 16px 48px; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 34px; }
  .brand { font-weight: 700; font-size: 19px; letter-spacing: 0.04em; color: var(--brand); text-decoration: none; }
  .brand span { color: var(--ink); font-weight: 500; }
  nav a { color: var(--muted); text-decoration: none; margin-left: 18px; font-size: 14px; }
  nav a.on { color: var(--ink); font-weight: 600; }
  h1 { font-size: 28px; margin: 0 0 6px; }
  .hint { margin: 0 0 18px; color: var(--muted); }
  .modes { display: flex; gap: 8px; margin-bottom: 18px; flex-wrap: wrap; }
  .modes button { background: #fff; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 6px 14px; font: inherit; font-size: 14px; cursor: pointer; }
  .modes button.on { color: var(--brand); border-color: var(--brand); background: #eef1ff; font-weight: 600; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 18px; }
  .stat { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; }
  .stat b { display: block; font-size: 26px; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums; }
  .stat small { color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; font-size: 11px; }
  .card { background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 22px; box-shadow: 0 1px 2px rgba(20, 24, 40, 0.04); }
  .bar { height: 6px; background: #eceef4; border-radius: 999px; overflow: hidden; margin-bottom: 18px; }
  .bar div { height: 100%; width: 0; background: var(--brand); transition: width 120ms linear; }
  .bar.done div { background: var(--ok); }
  .passage { font: 20px/1.75 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; color: #9aa0ad; margin-bottom: 18px; min-height: 3.5em; }
  .passage .ok { color: var(--ink); }
  .passage .bad { color: #b91c1c; background: var(--bad-bg); border-radius: 3px; text-decoration: underline; text-decoration-color: var(--bad); }
  .passage .cur { border-left: 2px solid var(--brand); margin-left: -2px; animation: blink 1s steps(2) infinite; }
  @keyframes blink { 50% { border-color: transparent; } }
  .field { position: relative; }
  input { width: 100%; font: 18px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; padding: 12px 14px; border: 1px solid #cfd3de; border-radius: 10px; background: #fbfbfd; color: var(--ink); outline: none; transition: border-color 100ms, background 100ms, color 100ms; }
  input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px rgba(59, 76, 202, 0.15); }
  input.err, input.err:focus { border-color: var(--bad); background: #fff5f5; color: var(--bad); box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.15); }
  input:disabled { background: #f1f2f6; color: var(--muted); }
  .errnote { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 12px; color: var(--bad); font-weight: 600; display: none; }
  input.err + .errnote { display: block; }
  .actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 16px; flex-wrap: wrap; }
  button.btn { font: inherit; font-weight: 600; padding: 9px 16px; border-radius: 10px; border: 1px solid var(--brand); background: var(--brand); color: #fff; cursor: pointer; }
  button.btn.ghost { background: #fff; color: var(--brand); }
  .tip { color: var(--muted); font-size: 14px; }
  kbd { font: 12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #f1f2f6; border: 1px solid #d5d8e1; border-bottom-width: 2px; border-radius: 5px; padding: 1px 6px; color: var(--ink); }
  .result { margin-top: 20px; padding: 16px 18px; border-radius: 12px; background: #eef1ff; }
  .result b { font-size: 18px; }
  .result[hidden] { display: none; }
  .history { margin-top: 28px; }
  .history h2 { font-size: 16px; margin: 0 0 10px; }
  .history table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; font-size: 14px; }
  .history th, .history td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); }
  .history th { color: var(--muted); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
  .history tr:last-child td { border-bottom: 0; }
  .history[hidden] { display: none; }
  footer { margin-top: 36px; color: #9aa0ad; font-size: 13px; text-align: center; }
  footer a { color: inherit; text-decoration: none; margin: 0 6px; }
  @media (max-width: 560px) { h1 { font-size: 24px; } .passage { font-size: 17px; } .stats { grid-template-columns: repeat(2, 1fr); } .stat b { font-size: 22px; } nav a { margin-left: 12px; } .errnote { display: none !important; } }
`;

const SCRIPT = `
(function () {
  var PASSAGES = ${JSON.stringify(PASSAGES)};
  var RESULTS_URL = ${JSON.stringify(GATE_UNLOCK_PATH)};
  var $ = function (id) { return document.getElementById(id); };
  var passageEl = $('passage'), input = $('typed'), wpmEl = $('wpm'), accEl = $('acc'), timeEl = $('time'), progEl = $('prog');
  var bar = $('bar'), barFill = $('bar-fill'), result = $('result'), resultText = $('result-text');
  var historyEl = $('history'), historyBody = $('history-body'), bestEl = $('best');
  var passage = '', started = 0, timer = null, done = false, current = -1;

  function load(key, fallback) { try { var v = JSON.parse(localStorage.getItem(key)); return v === null || v === undefined ? fallback : v; } catch (e) { return fallback; } }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }
  function sizeOf(text) { return text.length < 100 ? 's' : text.length < 180 ? 'm' : 'l'; }
  var mode = load('kf:mode', 'm');

  function escapeChar(c) { return c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c; }

  // Pick a passage of the chosen length that was not used recently (across
  // reloads too), so the test never shows the same text twice in a row.
  function pick() {
    var recent = load('kf:recent', []);
    var pool = [];
    for (var i = 0; i < PASSAGES.length; i++) if (sizeOf(PASSAGES[i]) === mode && recent.indexOf(i) < 0 && i !== current) pool.push(i);
    if (!pool.length) { for (var j = 0; j < PASSAGES.length; j++) if (sizeOf(PASSAGES[j]) === mode && j !== current) pool.push(j); }
    current = pool[Math.floor(Math.random() * pool.length)];
    recent.push(current); while (recent.length > 8) recent.shift(); save('kf:recent', recent);
    passage = PASSAGES[current];
    started = 0; done = false;
    if (timer) clearInterval(timer);
    timer = null;
    input.value = '';
    input.disabled = false;
    input.classList.remove('err');
    result.hidden = true;
    bar.classList.remove('done');
    barFill.style.width = '0%';
    timeEl.textContent = '0:00';
    wpmEl.textContent = '0';
    accEl.textContent = '100%';
    progEl.textContent = '0%';
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
    // TypeRacer-style: the box goes red as soon as what you typed is off the text.
    var onTrack = passage.indexOf(typed) === 0;
    input.classList.toggle('err', !onTrack && typed.length > 0);
  }

  function stats(typed) {
    var correct = 0;
    for (var i = 0; i < typed.length && i < passage.length; i++) if (typed.charAt(i) === passage.charAt(i)) correct++;
    var minutes = started ? (Date.now() - started) / 60000 : 0;
    var wpm = minutes > 0 ? Math.round((correct / 5) / minutes) : 0;
    var acc = typed.length ? Math.round((correct / typed.length) * 100) : 100;
    var progress = Math.min(100, Math.round((Math.min(typed.length, passage.length) / passage.length) * 100));
    return { wpm: wpm, acc: acc, progress: progress };
  }

  function tick() {
    var s = Math.floor((Date.now() - started) / 1000);
    timeEl.textContent = Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
    var st = stats(input.value);
    wpmEl.textContent = String(st.wpm);
    accEl.textContent = st.acc + '%';
    progEl.textContent = st.progress + '%';
    barFill.style.width = st.progress + '%';
  }

  function renderHistory() {
    var rows = load('kf:history', []);
    historyEl.hidden = !rows.length;
    var best = 0, html = '';
    for (var i = rows.length - 1; i >= 0; i--) {
      var r = rows[i];
      if (r.wpm > best) best = r.wpm;
      html += '<tr><td>' + r.when + '</td><td>' + r.size + '</td><td>' + r.wpm + ' WPM</td><td>' + r.acc + '%</td><td>' + r.time + '</td></tr>';
    }
    historyBody.innerHTML = html;
    bestEl.textContent = best ? 'Best: ' + best + ' WPM' : '';
  }

  function finish(early) {
    if (done) return;
    done = true;
    if (timer) clearInterval(timer);
    tick();
    var typed = input.value;
    var st = stats(typed);
    input.disabled = true;
    result.hidden = false;
    if (!early) {
      bar.classList.add('done');
      var rows = load('kf:history', []);
      var d = new Date();
      rows.push({ when: d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), size: mode === 's' ? 'Short' : mode === 'm' ? 'Medium' : 'Long', wpm: st.wpm, acc: st.acc, time: timeEl.textContent });
      while (rows.length > 8) rows.shift();
      save('kf:history', rows);
      renderHistory();
    }
    resultText.innerHTML = (early ? 'Stopped early. ' : (st.acc === 100 ? 'Flawless! ' : 'Nice work! ')) + '<b>' + st.wpm + ' WPM</b> at <b>' + st.acc + '%</b> accuracy in ' + timeEl.textContent + '.';
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
    if (input.value === passage) finish(false);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!done && input.value.length) finish(true);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      pick();
    }
  });
  $('restart').addEventListener('click', pick);
  $('again').addEventListener('click', pick);
  var modeButtons = document.querySelectorAll('[data-mode]');
  function paintModes() { for (var i = 0; i < modeButtons.length; i++) modeButtons[i].classList.toggle('on', modeButtons[i].getAttribute('data-mode') === mode); }
  for (var i = 0; i < modeButtons.length; i++) modeButtons[i].addEventListener('click', function () { mode = this.getAttribute('data-mode'); save('kf:mode', mode); paintModes(); pick(); });
  paintModes();
  renderHistory();
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
<link rel="icon" type="image/png" href="${DECOY_ICON_DATA_URI}">
<style>${STYLE}</style>
</head>
<body>
<div class="wrap">
  <header>
    <a class="brand" href="/">keyflow<span>.</span></a>
    <nav><a class="on" href="#">Test</a><a href="#">Practice</a><a href="#">Leaderboard</a><a href="#">About</a></nav>
  </header>
  <main>
    <h1>Typing Speed Test</h1>
    <p class="hint">Type the text below as quickly and accurately as you can. The timer starts with your first keystroke.</p>
    <div class="modes" role="group" aria-label="Text length">
      <button type="button" data-mode="s">Short</button>
      <button type="button" data-mode="m">Medium</button>
      <button type="button" data-mode="l">Long</button>
    </div>
    <section class="stats" aria-label="Live results">
      <div class="stat"><b id="wpm">0</b><small>WPM</small></div>
      <div class="stat"><b id="acc">100%</b><small>Accuracy</small></div>
      <div class="stat"><b id="time">0:00</b><small>Time</small></div>
      <div class="stat"><b id="prog">0%</b><small>Progress</small></div>
    </section>
    <section class="card">
      <div class="bar" id="bar"><div id="bar-fill"></div></div>
      <div class="passage" id="passage" aria-hidden="true"></div>
      <div class="field">
        <input id="typed" type="text" aria-label="Type the text here" placeholder="Start typing here…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done">
        <span class="errnote" aria-hidden="true">Fix the mistake</span>
      </div>
      <div class="actions">
        <button id="restart" class="btn ghost" type="button">New text</button>
        <span class="tip"><kbd>Enter</kbd> stops early · <kbd>Tab</kbd> new text</span>
      </div>
      <div class="result" id="result" hidden>
        <div id="result-text"></div>
        <div class="actions"><button id="again" class="btn" type="button">Try again</button><span class="tip" id="best"></span></div>
      </div>
    </section>
    <section class="history" id="history" hidden>
      <h2>Your recent results</h2>
      <table>
        <thead><tr><th>When</th><th>Length</th><th>Speed</th><th>Accuracy</th><th>Time</th></tr></thead>
        <tbody id="history-body"></tbody>
      </table>
    </section>
  </main>
  <footer>keyflow · a simple typing practice tool · <a href="#">Privacy</a>·<a href="#">Terms</a>·<a href="#">Contact</a></footer>
</div>
<script>${SCRIPT}</script>
</body>
</html>
`;
}
