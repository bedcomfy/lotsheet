# Mobile Overhaul — Direction A: "Paper Viewer"

**Status: approved by Cristian, not yet built.** This is the complete spec for
the mobile redesign. It was chosen from three mocked-up directions; the mockups
lived in a Claude artifact ("Lot Sheet Mobile — 3 Directions"). Direction A won.
**Build exactly A — do NOT include Direction B's features** (no R1–R11 row-jump
chips, no tap-anywhere-to-zoom on a fitted sheet). Those were proposed as
add-ons in the original recommendation and were explicitly cut.

## The one rule that governs everything

**The paper sheet is sacred. The frame around it is not.**

Cristian's words: *"we can completely overhaul menus, layout, etc but I still
need all sheets and all sheet functions to remain as close to desktop as
possible."* An earlier attempt that reflowed the Lot Sheet grid into phone-sized
cards was rejected outright ("horrible"). Never reflow, restyle, shrink-to-fit
by default, or otherwise redesign the sheet itself. The desktop-identical paper
pans inside a window, like a PDF in a viewer app — that's the whole idea.

Hard constraints:

- **Desktop (≥ 700px) is untouched.** Every change lives behind the existing
  mobile breakpoints (the app uses `max-width: 699px` for sheet swaps and
  `max-width: 899px` / `480px` for chrome) and/or mobile-only components
  marked `no-print`.
- **Print/PDF is untouched.** The PDF renderer loads `<path>?print=1` headlessly;
  it must never see any mobile chrome. Print CSS is never ≤699px, but belt-and-
  suspenders: everything new is `no-print`.
- **No behavior changes.** Every action must call the exact same handlers the
  desktop toolbar calls. No new data paths, no new state semantics.

## What Direction A looks like (the approved mockup, surface by surface)

### 1. Top bar (app-wide, mobile)
Slim 48–56px bar (the app already has a 56px sticky mobile bar in `SheetNav`):
logo mark, **current page title as a button with a ▾** (this replaces the
cramped `<select>` dropdown picker), a compact status pill (e.g. "142 usable ·
12 out" — tappable, opens the same usable/out-of-service modals), and a search
icon. Keep the iOS-safe *in-flow sticky* pattern that's already documented in
the nav CSS — do not switch to `position: fixed` (it desynced on iOS before).

### 2. Full-screen page switcher
Tapping the title button opens a **full-screen grid of page tiles** (replacing
the `<select>`): one tile per destination — Home, Lot Sheet, Turnover, Service
Sheets, Shop, Work Order, Staffing, Object Codes, Admin Tools, Audit Log — each
with the page name and a one-line description, current page highlighted. Big
targets, one tap to switch, tap outside or an X to close. Source of truth for
the list: the `SHEETS` array in `SheetNav.tsx` (don't hardcode a copy).

### 3. The sheet viewport (Lot Sheet first)
The paper renders at **100% desktop size inside its own pan window**:

- The page itself never scrolls on the Lot Sheet; the app becomes a fixed
  full-height frame (top bar → viewport → bottom bar, `100dvh`-based since the
  URL bar collapses). The viewport owns BOTH scroll axes:
  `overflow: auto; overscroll-behavior: contain; -webkit-overflow-scrolling:
  touch; touch-action: pan-x pan-y` — this kills the "shoddy scrolling" (page
  rubber-banding, history-swipe fights, the toolbar dragging away).
- **Zoom pill** floating bottom-right, above the action bar: two stops, **Fit**
  (whole sheet visible, scaled — the existing `--fit` behavior) and **100%**
  (default). One tap toggles. LotSheet already has this state as
  `mobileSheetView: "pan" | "fit"` with `.sheet-scroll--pan/--fit` CSS — reuse
  it; the pill replaces the old Pan/Fit segmented control in the toolbar.
- **Double-tap** anywhere on the paper toggles Fit ⟷ 100%, and when zooming IN
  it centers the viewport on the tapped spot (set scroll after forcing layout —
  a reflow must happen before `scrollLeft/Top` are set or they clamp to 0).
- At Fit zoom, cells are too small to tap reliably — that's accepted; you zoom
  to work. (Do NOT add B's tap-to-zoom-at-tap-point on the fitted sheet.)
- Single tap on a cell at 100% behaves exactly like desktop (opens CellEditor).
  Drag-and-drop (dnd-kit long-press) must keep working — test it.

### 4. Bottom action bar
Fixed-height bar docked at the bottom of the frame (safe-area padded), five
big labeled buttons: **Fill** (primary blue), **Flags**, **Shop**, **Print**,
**More**. The app already has a 4-button `.mobile-actions` bar at ≤480px —
extend/replace it with this 5-button version and make it a flex child of the
frame rather than `position: fixed`, so it never overlaps content.

### 5. The "More" bottom sheet — nothing cut off, ever
Tapping More slides up a bottom sheet (grab handle, scrim behind, tap-scrim or
Escape closes, max ~75% screen height, internally scrollable) containing **every
remaining desktop toolbar feature**, so the wrapped 3-row mobile toolbar can be
completely hidden on phones:

- **Find bus** input (numeric keypad, same live locate + "where" message as the
  toolbar findbox)
- **Status** row: usable / out of service / missing — tappable chips opening the
  same modals as the desktop chips
- **Actions**: Select buses (toggle, shows current mode), Prev Sheets, Share as
  text, Print Blank
- **Maintenance info** checkbox (print-with-maintenance toggle, same state)
- **Danger zone**: Clear Grid, Clear Lots (styled red, same confirms)

Every item calls the existing handler and then closes the sheet. There is a
WIP component `app/components/MobileLotChrome.tsx` (untracked at time of
writing — may or may not still exist) that implements the bar + bottom sheet +
zoom pill as a props-driven component; it was never wired into LotSheet. Use it
as a starting point if present, but note it includes B's row chips
(`mchrome__chips` / `onJumpRow`) — **strip those out**.

Note: input-heavy dialogs (CellEditor etc.) deliberately anchor to the TOP on
phones so the keyboard can't cover them (documented in the modal CSS). Keep
that. The More sheet has only one input (Find) at its top, so bottom-sheet is
fine there.

### 6. With the More sheet in place, hide the Lot Sheet toolbar on phones
Everything the toolbar did is now reachable (top-bar pill + bottom bar + More
sheet), so `.toolbar` can be `display: none` at the mobile breakpoint **for the
Lot Sheet only** — scope it (e.g. an `.app--lot` wrapper class) so the other
sheets' small toolbars are unaffected. This is the single biggest win: the
sheet gets the whole screen.

### 7. Other sheets (Fuel/DEF/Farebox/Turnover/Work Order)
Lighter treatment, same philosophy: their `.sheet-scroll` gets the same
contained-scrolling fixes (overscroll containment, both-axis pan on phones).
Their toolbars are small enough to keep. No zoom pill needed unless trivial to
share. Do not restructure them in this pass.

### 8. Multi-select mode
When Select mode is on, the desktop shows a bulk-action bar. On mobile make
sure it doesn't collide with the bottom action bar (either replace the bar's
contents contextually or stack above it). Test: select 2 buses → send to lot →
clear selection.

## Acceptance checklist (verify at 375×812)

1. No page-level horizontal overflow anywhere; the paper pans only inside its
   viewport; the page behind never scrolls or bounces.
2. The paper at 100% is pixel-identical to desktop (same DOM/CSS, no scaling).
3. Fit/100% pill works; double-tap toggles and centers on the tapped spot.
4. Cell tap → CellEditor; drag a bus cell → drop works (long-press).
5. All five bar buttons work; every More-sheet item fires its real handler.
6. Find bus in the More sheet locates + highlights, keyboard doesn't cover it.
7. Page switcher: every tile navigates; current page highlighted.
8. Nothing new renders in print: `/?print=1` DOM contains zero mobile chrome,
   and a generated Lot PDF is byte-comparable to pre-change (same PDF_VERSION —
   do NOT bump it; this change must not alter print output).
9. Desktop ≥700px: zero visual diff (spot-check toolbar, sheetview toggle,
   grid, modals).
10. `npm run verify` green (tsc + 19 tests + build).

## How to verify (hard-won environment lessons)

- **Screenshots time out** on the running app — the `/api/live` long-poll never
  lets the page go network-idle. Verify with DOM/JS probes
  (`javascript_tool`: computed styles, `getBoundingClientRect`, scroll metrics,
  dispatch clicks) and `read_page`. Real print output can be produced with
  headless Edge CLI: `msedge --headless --print-to-pdf=... "<url>?print=1"`
  (needs sandbox disabled in the harness; the app's own /api/pdf can't launch a
  browser from the sandboxed dev server).
- Radix dropdowns need real pointer events (`pointerdown`+`pointerup`), not
  synthetic `.click()`. Overlay ×/Done buttons also don't respond to synthetic
  clicks — use Escape or judge by state, not by close-failure.
- The seed browser tab's console log accumulates across reloads/HMR — check
  errors in a FRESH tab before believing them.
- Dev DB is PGlite at `.data/pglite`; if every API 500s with
  `RuntimeError: Aborted()`, stop the server, delete that dir, restart
  (dev-only data; prod is Neon).
- F: drive npm installs sometimes don't persist — `ls node_modules/<pkg>` after
  installing (no new deps should be needed for this work anyway).

## Where things live (re-audit before building — this repo moves fast)

Line numbers WILL be stale; these are anchors, not gospel. Multiple sessions
have shipped since this spec was written (check `git log` and the CHANGELOG
first).

- `app/components/LotSheet.tsx` — `mobileSheetView` state, `.sheet-scroll`
  viewport div, the old `.mobile-actions` bar markup, all the handlers the
  chrome needs (`setFillOpen`, `setManagerOpen`, `setShopOpen`, `openPdf`,
  `openBlankPdf`, `shareSheet`, `newSheet`, `clearLots`, `setSelectMode`,
  `setServiceDetail`, `setMissingOpen`, `findVal`/`findBus`, `showMaint`).
- `app/components/SheetNav.tsx` — mobile top bar, the `<select>` picker to
  replace, the `SHEETS` array.
- `app/components/MobileLotChrome.tsx` — WIP chrome component (if it still
  exists; untracked). Strip the row chips (Direction B) before use.
- `app/styles/` — 9 ordered partials; ordering IS the cascade.
  `02-nav-admin.css` (nav + its ≤899px mobile block), `04-toolbar-sheet.css`
  (toolbar, `.sheetview`, `.sheet-scroll`, the ≤699px sheet block),
  `06-mobile.css` (≤480px toolbar wrap + `.mobile-actions` — most of this
  becomes obsolete when the toolbar hides).
- Branch: work happened on `mobile-paper-viewer` (may exist locally); it's fine
  to start a fresh branch from current main instead.

## Process requirements

- Build on a branch; `npm run verify` before any commit; verify the acceptance
  checklist in-browser before pushing.
- Cristian pre-authorized building AND pushing this to production once it
  passes verification ("you can just do it and push it") — but re-confirm
  against whatever instruction accompanies this document when it's handed back.
- Version bump + CHANGELOG entry in the house style (plain-language, what the
  crew notices).
