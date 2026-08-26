# Changelog

## 0.26.0 - 2026-08-25

- Added a source-faithful Request Time Off form under Other Sheets with all
  leave choices, request dates, employee details, approval signatures, and
  final approval fields from the supplied paper form.
- Added live shared saving, previous-sheet history, current and blank Letter
  printing, the Pace mark, and a structural revision date.
- Added SheetKit registration, direct-route navigation, mobile Fit/100%
  viewing, schema coverage, and Storybook blank, typical, stress, and phone
  fixtures.

## 0.25.1 - 2026-08-25

- Fixed `Print Blank Daily Log` so it keeps the complete current hybrid bus
  roster and clears the date instead of clearing the buses.

## 0.25.0 - 2026-08-24

- Added a Monthly Bus Cleaning sheet under Other Sheets with the current active
  bus roster, excluding non-bus fleet entries such as the tow truck.
- Added a month selector and live cleaning-date and servicer fields while
  preserving a four-column printable layout based on the existing service
  sheets.
- Added current-roster and blank print options. The roster print uses the
  selected month, while the blank form leaves a handwritten line in the title:
  `Bus Cleaning Month of __________`.

## 0.24.1 - 2026-08-24

- Stacked Lot Sheet model/type and wrap tags vertically in the cell corner so
  both labels remain readable without crowding the bus number.

## 0.24.0 - 2026-08-24

- Added a separate Hybrid Bus Daily Servicing Log under Other Sheets with a
  selectable service date, the current eligible hybrid fleet, and 20 uniform
  write-in rows for fuel, DEF, farebox probing, pump readings, cleaning needs,
  issues or notes, and six-digit servicer IDs.
- Added current-roster and blank daily print options. Blank forms preserve the
  selected date without pre-filling bus numbers, and both variants use the same
  one-page Letter layout, Pace mark, structural revision date, and fresh PDF
  cache version.
- Enlarged the weekly hybrid log's bus and column labels and used more of the
  available page margins for clearer handwriting and improved legibility while
  preserving its supplied one-page structure.

## 0.23.0 - 2026-08-24

- Added a source-faithful Hybrid Bus Weekly Servicing Log under Other Sheets.
  The one-page Letter form follows the supplied Sunday-through-Saturday layout,
  updates every printed date from a selectable week, and fills itself from the
  current active Gillig hybrid fleet.
- Added a dedicated `Add to hybrid service log` fleet setting for the Gillig
  hybrid model. Existing hybrid buses move off Fuel/DEF in memory without a
  production-data migration, remain on Farebox checks, and can be reassigned
  explicitly from the protected bus editor or CSV.
- Added SheetKit registration, live saved week state and history, PDF cache
  invalidation, Storybook coverage, mobile Fit/100% viewing, and regression
  tests for week boundaries and hybrid sheet membership.

## 0.22.0 - 2026-08-24

- Added a guided `Setup Lane` workflow for rebuilding the printable service
  lane in the order Inspections, Retorques, Holds, Brake Tests, and Cards. It
  reviews the replacement before applying it, removes superseded assignments,
  and opens a fresh current-date PDF after the live update is confirmed.
- Unified flags, object codes, and plain-language notes into one searchable bus
  workspace. Notes become removable chips, detail-bearing flags keep the most
  recently added bus in view, and optional inspection or retorque details warn
  without blocking a valid save.
- Streamlined bus and flag editing throughout the Lot Sheet, global search, and
  dashboard, including preserved scroll position, clearer quick actions, and
  removal of redundant instructional copy.
- Corrected the Fuel Meter Readings print layout so only the two intended
  handwriting lines appear beneath the bus-wash reason heading.

## 0.21.2 - 2026-08-20

- Enlarged the Fuel and DEF grids with equal margins on all four sides while
  keeping the Pace logo in its original position and the header text clear of
  it. The Flag Summary and other printable sheets remain unchanged.
- Matched the Farebox preview and PDF margins, lowered the form slightly, and
  moved its Pace mark inward so the logo no longer crowds the page corner.

## 0.21.1 - 2026-08-20

- Reordered Service Sheets to Fuel, DEF, Meter Readings, Bus Errors, Flag
  Summary, and Farebox across the tabs, combined preview, and print bundles.
- Refined Fuel Meter Readings with evenly spaced handwriting lines while
  preserving the approved page structure and margins.
- Balanced Farebox `Y - N` choices around the center divider and reduced its
  side and bottom margins without changing the form height or crowding the
  Pace mark.
- Expanded the Interior Cleaning checklist spacing and rebalanced its foreman
  and defect-writing sections so the form fills the page with clear bottom
  separation.

## 0.21.0 - 2026-08-20

- Added an `Other Sheets` workspace with a source-faithful Interior Bus
  Cleaning form, and added Fuel Meter Readings and Bus Errors to Service
  Sheets. The new forms support live saved state, history, blank printing,
  Letter-size PDF output, and Paper Lab/Storybook coverage.
- Expanded the Service Sheets `All` preview and print bundle with the new
  service forms, consistent page alignment, separate North/South DEF pages,
  and direct access to Edit Flags. The Service Flag Summary can now be printed
  independently.
- Added Pace marks and structural revision dates to printable sheets while
  keeping them clear of form content. The Turnover revision is placed in its
  open Legal-page header area, and Bus Errors uses an ink-saving gray marker
  cell with protected logo spacing.
- Added a Probe Serial field and clearer structured issue reporting to the
  Farebox sheet. Restored its original issue-control size, four choices, and
  print margins after the final layout review.
- Added a third handwriting line for bus-wash explanations on Fuel Meter
  Readings and strengthened PDF cache/version checks and browser coverage for
  registered paper profiles, revision marks, and combined previews.

## 0.20.7 - 2026-08-18

- Added a dedicated `Clear flags` action when editing a bus in a Lot Sheet or
  Shop spot and in the shared flag manager used across the site. Clearing flags
  preserves the bus's current location and continues through the audited live
  flag endpoint.
- Bottom-aligned the Turnover Sheet table within its Legal page so its spare
  vertical paper space appears above the form while the bottom margin remains
  consistent.

## 0.20.6 - 2026-08-12

- Restored the Turnover Sheet bay layout with separate `1ST HALF` and
  `HOLDS / NOTES` fields. The notes area has no second vehicle-number column,
  and existing second-half text is preserved as holds/notes.
- Replaced the unsupported centered service asterisk with a PDF-safe ASCII
  marker. Multiple service flags now print as `*` on Fuel, DEF, and the Service
  Lane summary instead of a missing-glyph box.

## 0.20.5 - 2026-08-12

- Restored the asterisk beside bus numbers on the Service Lane flag summary
  when a bus carries multiple service flags. The marker now uses a plain,
  PDF-safe glyph and appears consistently in the preview and generated PDF.

## 0.20.4 - 2026-08-11

- Simplified the Turnover Sheet bay section to `BAY | REASON`. Removed the
  unused second-half column and expanded each reason field through the
  remaining width of the legal-size sheet on screen and in new PDFs.

## 0.20.3 - 2026-08-07

- Freeform bus notes now save as independent custom flag chips. Pressing Enter
  or Add commits the note, clears the field for the next entry, and lets each
  note be removed without disturbing the bus's other notes or maintenance
  flags.
- Turnover fast entry uses the same behavior: recognized text still selects its
  matching flag or inspection code, while unmatched text becomes a removable
  custom flag instead of being merged into one long note.
- Existing single-note records remain readable and removable. Custom notes stay
  concise on Lot Sheet grid cells, appear in full-detail sheet and fleet views,
  sync through the existing realtime flag channel, and require no production
  database migration.
- Added data-layer, Storybook, and browser regressions for multiple notes,
  punctuation-safe persistence, legacy compatibility, individual removal, and
  bulk custom-note clearing.

## 0.20.2 - 2026-08-07

- Removed the duplicate iPhone safe-area padding between the Lot Sheet action
  bar and the main mobile navigation. Fill, Flags, Shop, Print, and Tools now
  sit directly above the Home/Lot/Sheets/Fleet/More bar without covering the
  sheet or changing print output.
- Added a mobile geometry regression using the full iPhone safe-area inset so
  the gap cannot return unnoticed. Sheet data and realtime behavior are
  unchanged.

## 0.20.1 - 2026-08-06

- Removed double-tap zoom from the Lot Sheet and every SheetKit paper viewer.
  Fit and 100% remain available through the explicit on-screen control, so
  normal taps, scrolling, selection, and drag gestures no longer compete with
  a hidden zoom gesture.
- Rebuilt long mobile editors as bounded dialog frames with one intentional
  scroll region. Flag lists and lot lists now scroll independently while their
  search controls, titles, and Done buttons remain reachable above the iPhone
  keyboard.
- Removed duplicated bottom safe-area spacing while the keyboard is visible,
  contained overlay overscroll so swipes cannot leak into the sheet behind a
  menu, and kept the mobile multi-select bar in the page layout instead of over
  the paper. The Fit control now hides during selection rather than colliding
  with bulk actions.
- Added Storybook and Playwright regressions for keyboard-reduced viewports,
  long flag and lot lists, single-owner scrolling, explicit zoom controls, and
  selection-mode geometry. Sheet data, realtime synchronization, printable
  layouts, and PDF output are unchanged.

## 0.20.0 - 2026-08-06

- Added confirmed one-tap clearing for North Lot, East Lot, Fence, R/C,
  Apron, Cards, Bays, North Lane, South Lane, and Off Property. Each action
  shows the affected bus count, preserves blocked bay spots, archives the
  current Lot Sheet when appropriate, and offers Undo.
- Location updates from the Shop and Turnover pages now send only the group
  that changed and retry the newest local value after a failed request. A
  simultaneous edit in another location is preserved instead of being
  replaced by an older whole-sheet save.
- Reworked phone overlays around the live visible viewport and safe areas.
  Long menus scroll inside their body, action rows remain reachable above the
  keyboard, nested dialogs no longer stack, and the bottom navigation yields
  until closing animations finish.
- Prevented iOS focus zoom on small printable fields without changing paper
  typography, and improved Fill Rows, multi-select, and paper pan/fit spacing.
- Expanded Storybook and Playwright coverage for long dialogs, safe areas,
  three phone sizes, nested workflows, simultaneous edits, paper geometry,
  and production PDF output. Printable sheet layouts and PDF profiles are
  unchanged.

## 0.19.5 - 2026-07-29

- HOLD is now the top-priority flag everywhere. On the Lot Sheet's printed
  "BUSES WITH FLAGS" summary, any bus carrying a HOLD files under the HOLD
  section (listed first) no matter what other flags it has, and HOLD leads
  the bus's spelled-out flag list on every sheet and menu. First print
  regenerates the cached PDFs.

## 0.19.4 - 2026-07-29

Two production hotfixes.

- Dark mode: bus numbers typed on the sheets (the Turnover BAY column, the
  bay flag notes, the Lot Sheet header fields) were rendering white-on-white
  and looked blank. On-paper inputs are now always dark ink, matching the rest
  of the sheet. Printing is unchanged.
- A bus can only be in one place at a time: adding a bus to a list (Fence,
  North/South Lane, R/C, Apron, Bay, Cards, North/East Lot) now removes it
  from any other list, bay slot, or grid spot it was in — no more
  "Fence, South Lane" double listings. Buses already double-listed clear up
  the next time they're added where they belong.

## 0.19.3 - 2026-07-29

- The Service Lane flag summary page prints noticeably bigger — larger title,
  section headers, bus numbers, and flag text with roomier rows — so it reads
  at a glance on the clipboard. First combined-service print regenerates the
  cached PDF.

## 0.19.2 - 2026-07-29

- The Lot Sheet bar gains the in-the-shop chip next to Out of Service (tap it
  to open the Shop overview), and the placement summary now reads
  "Ready for Use · In Lots · Missing" in proper case.

## 0.19.1 - 2026-07-29

Cristian's preview-review round on the density pass.

- Pan/Fit no longer shows on desktop (phones keep it), and the "Saved …"
  timestamps are gone from every sheet bar (the Lot Sheet still warns when
  it's offline and retrying).
- Recent-bus chips removed everywhere — Home, the fleet search, and the
  phone Buses tab.
- Retorque editing: adding a bus by flag no longer saves on the first tire
  tap (the row used to re-sort mid-entry and jump away). Pick all the tires,
  then press Save to add the bus. Tire names are now Left/Right instead of
  Curbside/Roadside.
- The Shop page now hosts editors for North Lane, South Lane, R/C, and Off
  Property — the lists that had no editor of their own. The "in the shop"
  count still means Apron + Bays + Cards only.
- The Turnover bar shows live Usable / Out of Service / in-the-shop chips.
- Farebox sheet: SERV column narrowed with the space given to a longer
  Other line, Other now has its own checkbox (auto-checks when a reason is
  written), Y / N spread apart for easier circling, and the side margins
  slimmed for more writing room. Old saved sheets load unchanged; the
  first print regenerates the PDF.
- "On grid" now reads "Ready for Use" across Home, the Lot Sheet bar, and
  the phone Tonight board.

## 0.19.0 - 2026-07-29

Desktop density and fewer-clicks pass — chrome only; sheets and print output
untouched.

- The whole desktop chrome is tighter: compact controls, slimmer sidebar
  (with a new Collapse toggle that shrinks it to an icon rail), and a 52px
  header. Phones keep full touch sizing.
- One search: the header fleet search is now THE bus search — press "/" or
  Ctrl+K from anywhere, get recents, and act on the result (Open on Lot
  Sheet now also works while already on the Lot Sheet; new Edit flags
  button opens the flag editor right from the search result). The duplicate
  per-page Find bus boxes on the Lot, Turnover, and Shop pages are gone.
- One title: sheet toolbars and page headers no longer repeat the page name
  the header already shows — the paper and content start a full band higher
  on Lot, Turnover, Fuel/DEF, Farebox, Work Order, Service, Shop, Staffing,
  and Object Codes.
- Print PDF is a split button: click prints as always, the arrow offers
  Print blank (and lane copies where they exist) without opening More.
- Home is a cockpit: the hero banner is gone; one dense action row (Open
  Lot Sheet, Fill Rows, Work Order, Service Sheets) plus recent-bus chips,
  with the metrics and panels right below.

## 0.18.5 - 2026-07-28

- Farebox sheet: new "Probed & Dumped" column — a Y / N per bus that servicers
  circle (tap on screen, pen on paper), so every serviced farebox gets written
  down. Prints exactly as marked; blank forms print plain letters to circle.
- Farebox sheet: "Bypassed" checkbox joins No Power / Won't Probe in the
  "why won't it probe" column.
- Old saved farebox sheets load unchanged; first print after the update
  regenerates the cached PDF with the new layout.

## 0.18.4 - 2026-07-24

- Restored vertical touch and wheel scrolling inside the full-screen Fill Rows
  workflow while keeping its header and Done action fixed and reachable.
- Added an app regression check that scrolls from the first Fill Rows inputs to
  the final row on a phone-sized viewport.

## 0.18.3 - 2026-07-24

- Added one shared mobile paper viewer for Fuel, DEF, Farebox, Flag Summary,
  and legal-size Turnover sheets. Each opens at true 100% paper size with
  contained two-axis panning and can switch to a complete-page Fit view.
- Made multi-page Farebox previews fit one full printed page at a time while
  retaining vertical page-to-page scrolling, like a standard PDF reader.
- Kept service-sheet tabs, dates, selectors, and viewer frames inside narrow
  phone viewports, including automatic centering of the selected long tab.
- Inset the mobile navigation from curved screen edges and the home indicator,
  reserved matching content space above it, and kept full-screen directory
  footers reachable.
- Preserved all desktop paper geometry and print markup. PDF versions and
  output remain unchanged.

## 0.18.2 - 2026-07-24

- Expanded the Fuel and DEF tables into 25% of their former left, right, and
  bottom white margins while preserving the existing top spacing and text size.
- Kept normal Fuel and DEF cell text centered horizontally and vertically, with
  flagged bus cells continuing to center the flag and bus number as one group
  so neither value overlaps the other.
- Updated the affected SheetKit render versions so PDF caching cannot reuse
  pre-change Fuel, DEF, or combined service-sheet output.

## 0.18.1 - 2026-07-24

- Fixed the GitHub verification runner by installing the Chromium binary used
  by Storybook interaction tests before the full verification pipeline runs.
- Updated the checkout and Node setup actions to their Node 24-compatible
  releases, removing the runner's deprecated Node 20 action warning.

## 0.18.0 - 2026-07-24

- Rebuilt the application UI on a Pace-owned React Aria foundation with shared
  buttons, fields, menus, dialogs, navigation, page states, safe-area handling,
  light/dark themes, and CSS Modules. Storybook now documents and tests these
  controls independently so feature work no longer depends on fragile global
  application CSS.
- Finished the responsive operations shell: desktop content clears the fixed
  sidebar and header, mobile fleet-placement cards open useful bus lists, long
  dialogs keep their actions reachable, and global bus search opens live bus
  details instead of redirecting blindly to the Lot Sheet.
- Added SheetKit with a typed sheet registry, Zod validation, storage adapters,
  exact Letter and Legal profiles, reusable paper viewport/page primitives, and
  `npm run sheet:new` scaffolding for future forms.
- Added Paper Lab and visual regression coverage for both themes, long phone
  menus, safe areas, Letter/Legal geometry, and mobile paper fitting. Existing
  paper content remains on its trusted markup and retains its physical layout.
- Made PDF generation profile-driven and deterministic: each print captures one
  immutable data snapshot, waits for fonts and images, uses content-addressed
  cache versions, and renders the declared physical page. Automated tests now
  call every registered PDF route and verify page counts and MediaBoxes.
- Fixed blank Work Orders producing a second empty page, kept blank Lot Sheets
  to page one, and confirmed Turnover renders as true 8.5 x 14 Legal while the
  other registered sheets remain 8.5 x 11 Letter.
- Hardened realtime Lot Sheet collaboration with stable operation ids,
  idempotent retries, atomic bus moves, granular clear/lock operations, a
  durable browser outbox, visible offline retry state, and paged catch-up that
  cannot skip edits beyond the former 500-operation window.
- Added integration and unit coverage for duplicate delivery, concurrent edits,
  last-writer behavior, atomic moves, outbox recovery, operation paging,
  desktop wheel scrolling, mobile sheet access, and print-mode chrome removal.

## 0.17.1 - 2026-07-24

- Excluded the JUDI support vehicle from every fleet total, placement group,
  missing list, off-property count, and flagged-bus summary.
- Made off-property a separate, mutually exclusive fleet state instead of
  including it in Out of Service, even when an older grid or lot placement
  remains on the sheet.
- Added dedicated Off Property overview cards to the desktop and mobile home
  pages, with the existing drill-down list available from the desktop card.

## 0.17.0 - 2026-07-24

- Promoted the Maintenance Logistics redesign from preview: the responsive
  operations dashboard, navigation, light/dark themes, and mobile hubs now
  surround the existing live sheets without changing sheet data or print
  markup.
- Fixed Fleet search results and other phone bus cards being covered by the
  bottom navigation. Dialog bodies now scroll within the available viewport
  while their action footer remains reachable above the tab bar and keyboard.
- Added Fleet to the main navigation and page switcher, so `/buses` is labeled
  correctly instead of falling back to "Lot Sheet" on phones.
- Renamed the Lot Sheet's phone action drawer from "More" to "Tools", tightened
  redundant mobile sheet toolbars, and centered dashboard icons precisely.
- Carried forward the remaining useful UI polish from PR #2: intentional
  loading skeletons and cleaner mobile service-page hierarchy.
- Verified print readiness for Lot, Turnover, Fuel, DEF, Farebox, Work Order,
  and blank service sheets; print/PDF layout and `PDF_VERSION` are unchanged.

## 0.16.0 - 2026-07-24

- Added an alternate Maintenance Logistics interface for preview: a deep navy
  operations sidebar, compact fleet command bar, photographic garage banner,
  live readiness metrics, fleet distribution, available staffing, exception
  monitoring, and streamlined daily-action panels.
- Reworked the phone home, bottom navigation, and full-screen Sheets and More
  hubs to match the new interface in both light and dark mode with real icons,
  safe-area spacing, and reliable scrolling.
- Restyled shared application controls, page headers, admin surfaces, and
  toolbars without changing the live sheet data model, paper sheet markup, or
  print/PDF styles.

## 0.15.1 - 2026-07-24

- Fixed the Lot Sheet's "More" sheet on phones being partly hidden behind the
  bottom tab bar: the bar sat on top of the sheet's last rows, so Clear Grid
  and Clear Lots couldn't be tapped. The sheet now layers with the other
  dialogs, above the tab bar, and the scrim dims the whole screen.

## 0.15.0 - 2026-07-24

- New phone navigation: a bottom tab bar on every screen — Tonight, Lot,
  Sheets, Buses, More — so there is always a one-tap way anywhere. The Lot
  Sheet's action dock sits above the bar, never on top of it.
- Tonight: phones now open a floor-friendly status board (usable / out of
  service, missing buses, lot progress) instead of the squeezed desktop
  dashboard. Desktop keeps the full dashboard; both read the same live data.
- New Buses tool on phones: type or tap a bus → its card with live location,
  flags, tonight's fuel/DEF/farebox, and one-tap Flags or Move (to a lot, an
  open shop bay, or an empty grid spot — one atomic change, so a bus can
  never be in two places).
- Sheets hub: every paper one tap away (Lot, Turnover, Service sheets with
  Fuel/DEF/Farebox shortcuts, Work Order), each shown exactly as printed —
  fixed size, pan to move around, no zoom controls, tap to edit as always.
- More hub: Shop, Staffing, Object codes, and the light/dark switch.
- The sheets themselves are untouched, on phones and desktop alike; print
  output is unchanged.

## 0.14.1 - 2026-07-23

- Fixed phones being unable to scroll to the bottom of tall sheets (Turnover
  and the other service pages): a vertical swipe on the paper was being
  swallowed by the sheet's pan container instead of scrolling the page, which
  also left a dark band under the sheet. Horizontal panning is still contained,
  and the Lot Sheet's fixed viewer is unaffected.
- Phone dialogs now track the on-screen keyboard's real height (ported from
  the /m experiment): the flag editor, tall dialogs, dropdown menus, and the
  Lot Sheet's More menu shrink to sit fully above an open keyboard, so inputs
  and action buttons can't hide underneath it.
- Desktop and print output unchanged.

## 0.14.0 - 2026-07-23

- Fixed the phone "More" menu sometimes appearing but ignoring every tap: its
  open state no longer depends on an animation frame that could be delayed or
  dropped, so it is always clickable the moment it appears.
- Phone dialogs and menus now respect notches, rounded corners, and the home
  indicator; long dialogs keep their header and action buttons fixed with one
  reliable scrolling middle, so Close / Done / Save are always reachable.
- Dialog close buttons and small dialog actions are full thumb-size on phones,
  and the More menu's bottom rows can no longer be clipped by the screen edge.
- Unified menu/dialog layering on phones so nothing can appear underneath the
  action dock, toolbar, or navigation again.
- Desktop and print output are completely unchanged.

## 0.13.2 - 2026-07-17

- Restored mouse-wheel scrolling over the paper on every desktop sheet by
  allowing vertical wheel input to continue to the page while keeping wide
  sheet panning contained horizontally.
- Kept phone sheet scrolling and all print/PDF geometry unchanged.

## 0.13.1 - 2026-07-15

- Simplified the Farebox sheet to three columns by removing the Probed &
  Emptied field and moving Serv directly beside Bus.
- Renamed the expanded handwriting area to "IF FAREBOX WON'T PROBE, WHY?" and
  gave it all reclaimed table width while making Serv about 4px wider.
- Kept the Farebox browser preview and printable North/South sets on the same
  exact Letter-page table geometry without deleting older saved check data.

## 0.13.0 - 2026-07-15

- Reworked the phone Lot Sheet into a paper viewer: the unchanged Letter sheet
  now pans inside a fixed-height viewport while the page and navigation stay put.
- Added a five-button mobile action dock for Fill, Flags, Shop, Print, and More.
  The scrollable More sheet retains Find Bus, fleet status, selection, previous
  sheets, sharing, blank printing, maintenance details, and both clear actions.
- Added Fit and 100% viewing modes plus double-tap zoom that returns to the
  tapped area when expanding the sheet.
- Replaced the cramped mobile page select with a full-screen page switcher built
  from the shared navigation list, including descriptions and current-page state.
- Added a compact mobile Lot Sheet status pill and one-tap bus search in the top
  bar, both wired to the existing live status and search behavior.
- Kept multi-select controls above the phone action dock and made all sheet
  scrollers contain two-axis touch panning without creating page-level overflow.
- Simplified the desktop sidebar, brand treatment, buttons, and toolbar surfaces
  with calmer weights, flatter controls, and less visual decoration.
- Print routes and PDF geometry are unchanged; mobile viewer controls are not
  rendered in Lot Sheet print mode.

## 0.12.0 - 2026-07-15

- Rebuilt Service Sheets around one full-width navigation and print bar with a
  shared date, blank/flag options, and exact print previews for every sheet.
- Fuel, DEF, and Farebox now use the same letter-page geometry on screen and in
  generated PDFs, including the corrected full-width Farebox layout.
- Both Lot Sheet pages now use the same Letter dimensions and internal margins
  on screen as in generated PDFs, without changing sheet editing or page-two
  content.
- Added a small Pace mark to Fuel, DEF, Farebox, and Service Lane pages
  without changing their printable table geometry. Turnover remains unbranded.
- Flag Summary is now its own Service Sheets tab. It is excluded from
  individual sheet PDFs and appears once at the end of a flagged Print All.
- Print All now produces Fuel, both DEF lane copies, all Farebox lane copies,
  and the optional single Flag Summary in the same order shown in the preview.
- Farebox now matches Fuel/DEF's 16px sheet text, uses a larger title and taller
  column headings, labels checks as "Probed & Emptied," and places page numbers
  in the bottom-right margin. Its servicer field is wider without reducing the
  Notes field, and totals appear at bottom-left only on each lane set's final
  page. DEF Start and End lines are now equal length.
- The standalone service-lane summary uses a cleaner "Service Lane" heading
  and a larger printed date.
- Farebox Notes now has separate "No Power" and "Won't Probe" checkboxes plus
  an Other write-in line; existing notes remain in Other.
- The DEF header now uses fixed, non-overlapping zones for its date, N/S lane,
  and equal Start/End fields.
- Service Sheets now offers only filled Print PDF and Print Blank actions;
  blank DEF/Farebox forms retain plain N / S, and Farebox blanks omit the date.
- Farebox now uses 32 taller rows per page, preserving four-page lane sets while
  giving the Other write-in line more handwriting room.
- Farebox removes the toolbar completion counter and labels its reason column
  "If No, Why?" to make the Y/N workflow explicit.
- Fuel, DEF, and Farebox cells now share explicit middle alignment and uniform
  line-height so text placement stays consistent through the final row.
- The Farebox header now distributes its title, date, and N/S lane marker
  across the full printable width.

## 0.11.0 - 2026-07-15

- Service Sheets now uses the same header + tabs layout as Staffing/Admin, with
  a new "All" tab that shows every sheet on one page.
- New "Print Blank (all sheets)" on the All tab: one PDF with a blank Fuel, a
  blank DEF (no N/S indicator), and one blank Farebox set — no flags, no
  detailed flag list, ready for the clipboard stash.
- Regular prints always include the flags now, so the "Print with flags"
  checkbox is gone. DEF and Farebox print an N-circled copy and an S-circled
  copy in one PDF — no more circling the lane by hand.
- Farebox: the sheet is now real letter-size pages (35 uniform rows each,
  "Total · Page X of Y" on every page) instead of one long strip, the header is
  much more compact, and "Probed & Dumped" is a circle-able Y / N — tap it on
  screen, or circle it with a pen on paper. The last page is padded with empty
  same-size slots for writing in buses serviced more than once in a night.

## 0.10.0 - 2026-07-15

- New Farebox sheet (Daily Fare Box Checks): every service-lane bus gets a row
  with one Probed & Dumped box, the servicer, and a notes line for why a box
  wasn't done. Fill it on screen or print it (2 copies — north & south lane)
  for the clipboard; the printout flows across pages with the title and column
  headers repeating on every page.
- Fuel, DEF, and the new Farebox sheet now live together on one "Service
  Sheets" page with tabs (each tab notes how many copies to print at shift
  start). The sidebar shows one entry instead of two; /fuel and /def links
  still work.

## 0.9.0 - 2026-07-15

- The Lot Sheet's bus flags now update live: a flag changed from any other
  device appears on an already-open Lot Sheet within about a second, instead of
  waiting for a reload. (It was the last screen still loading flags once.) If
  the flag service is unreachable, PDFs still render — with empty flags —
  instead of timing out.
- Made the heavy list pages fast: the admin Fleet editor no longer re-renders
  all 130+ rows on every keystroke or single-row edit, off-screen rows on the
  Fleet / Object Codes / Flag Editor lists skip layout and paint entirely, and
  searching stays responsive while long lists re-filter in the background.
- Menus that open on tap (Edit Flags, Fill Rows, Prev Sheets, lot editors, the
  CSV editor) now load on first use instead of with every page, trimming
  15-66kB of JavaScript per page.
- Maintainability: LotSheet.tsx shrank from 2,219 to 1,853 lines (grid cells,
  the Shop menu, and the status modals moved to their own files) and the
  6,900-line stylesheet became 9 ordered partials — both verified identical in
  behavior and byte-identical in built CSS output, so nothing printed changes.

## 0.8.1 - 2026-07-13

- Flag notes and the "Other" hold reason now save automatically — as you type, on
  blur, and when you close the menu — so you no longer have to press Enter first.
  (A focused input that gets removed when a dialog closes never fired its blur, so
  the last thing typed could be lost.)

## 0.8.0 - 2026-07-13

- Completed the shared/live data migration: the Fuel, DEF, Turnover, Shop,
  Seniority, and Work Pick screens now read flags and the employee roster from the
  same cached, deduplicated source as Home, so a flag or roster change appears on
  every screen within about a second — no more per-screen polling. Each sheet's
  own state and autosave are unchanged.
- Added an error boundary: if one screen hits an unexpected error it shows a
  friendly "try again" card instead of a blank page.
- Added continuous integration: type-check, tests, and a production build run
  automatically on every push and pull request.

## 0.7.1 - 2026-07-13

- Pinned the Node.js version to 24.x (matching the Vercel project + local dev) so
  a future Node release can't silently change the deploy runtime.
- Removed the unused full `puppeteer` dev dependency (only `puppeteer-core` is
  used at runtime) and the now-unneeded `.npmrc`, clearing the build warnings.

## 0.7.0 - 2026-07-13

- Overhauled PDF generation for reliability and speed while keeping the exact
  print layouts. One long-lived headless browser is now reused across renders
  (a fresh page per PDF) instead of launching a browser every time — this fixes
  local generation on Windows (concurrent renders no longer fight over the temp
  profile) and makes warm requests much faster.
- The print view no longer holds the real-time connection open, and rendering
  waits for the page's own "ready" marker (and web fonts) instead of full network
  idle — so a background request can't stall a print. Every sheet's PDF now
  generates in about a second, even several at once.

## 0.6.0 - 2026-07-13

- Added a test suite. Vitest covers the business logic (availability including the
  overnight day-attribution, fleet stats) and the data layer end-to-end against an
  in-memory PGlite database — 19 tests. `npm run verify` now runs the tests
  between the type-check and the build.
- Added a Playwright end-to-end smoke scaffold (`npm run e2e`) for whole-page
  rendering checks; run `npx playwright install chromium` once first.

## 0.5.0 - 2026-07-13

- Added real-time sync: a single change token bumps on every shared-data write,
  and an /api/live long-poll returns the instant it advances, so the dashboard
  and shared data refresh within about a second of any change on any device —
  without each client polling on a fixed interval.
- Query refetch intervals are now generous fallbacks; the live signal handles
  immediacy.

## 0.4.0 - 2026-07-13

- Introduced TanStack Query for shared, cached, deduplicated server state, and
  rebuilt the Home dashboard on it — one cache instead of five separate polling
  loops. Reusable hooks (sheet, flags, bus master, employees, work pick) are
  ready for the rest of the app to adopt.
- Moved the admin-unlock state to a Zustand store, so every gated screen
  (Seniority, Work Pick, Admin Tools) shares one reactive unlock instead of each
  keeping its own copy — unlocking anywhere unlocks everywhere for the session.

## 0.3.0 - 2026-07-13

- Replaced the hand-rolled data layer with a single typed one (Drizzle ORM). The
  same queries now run in every environment: Neon/Postgres in production, an
  embedded PGlite database in local development — no more separate JSON-file dev
  backend that could drift from production.
- Added Zod validation at the API boundaries (flags, employees, keyed state), so
  malformed requests are rejected with a clear 400 instead of reaching storage.
- No data migration: production keeps its existing tables and the same idempotent
  schema setup; storage isolation for previews is unchanged.

## 0.2.0 - 2026-07-13

- Upgraded to Next.js 16 and React 19 (from Next 14.2 / React 18).
- Migrated the config to the stable `serverExternalPackages` and top-level `outputFileTracingIncludes`, and removed the OneDrive-era webpack cache workaround (the repo now lives on a local drive).
- Made the dynamic `[key]` API routes await their params, per the Next 15+ async request API.
- Builds now use Turbopack by default.

## 0.1.18 - 2026-07-13

- Added a new Staffing section to the sidebar with a Seniority list and an editable Work Pick schedule.
- Seniority shows the shop seniority roster (sortable, searchable); editing is unlocked with the admin password.
- Work Pick mirrors the printed schedule — every shift, its hours, each person's worked/off days, and break times — pre-loaded with the current pick and editable for future picks.
- Added an "Available Now" section on Home that counts, by role bucket (Mechanics vs. Cleaner/Janitor/Servicer/Utility), who is on the clock based on the current Chicago day and time, including overnight shifts. Tap a bucket to see who.
- Availability now attributes each shift to the day where most of its hours fall, so an overnight 3rd shift labeled "Monday" is counted as in progress from Sunday night through Monday morning.
- Added an employee availability status (Time Off, Vacation, Out of Service, Sick, Light Duty, Leave) editable in the Seniority roster; unavailable employees are excluded from "Available Now" and struck through on the Work Pick.
- Moved employee editing out of Admin Tools into Staffing › Seniority.
- Staffing and Admin Tools each show a single sidebar entry (their in-page tabs handle the rest), and the roster/pick editors have a Done button to leave edit mode.
- Simplified Seniority sorting to the column headers alone, with the active column highlighted, and fixed the header buttons showing as white boxes in dark mode.
- Flattened the sidebar into a single list of destinations under Home, with Admin Tools and the Audit Log pinned at the bottom.
- Added a search box on the Work Pick that highlights an employee's spot(s) on the schedule (by name or ID) instead of filtering the list, and scrolls the first match into view.
- The Lot Sheet "Usable / Out of Service" chip and the Home "Out of Service" card now open a list of each unusable bus with where it is and why (its flags), instead of the Missing dialog.

## 0.1.17 - 2026-07-10

- Renamed service readiness to Usable and Out of Service on Home and the Lot Sheet status bar.
- Added live drill-down menus to every Home fleet tile, including each bus's current grid, lot, shop, or off-property location.
- Kept fleet setup text fields focused while editing instead of remounting them after every keystroke.
- Focused flag search automatically when a bus flag editor opens.
- Added a confirmed Remove from all action to every By Flag result, with one saved and audited update per bus.

## 0.1.16 - 2026-07-10

- Reworked search and admin text fields so the full visible control is clickable, with a neutral outlined focus treatment instead of nested blue focus boxes.
- Added consistent native date pickers to the Lot, Turnover, Fuel, DEF, and Work Order sheets while preserving their stored and printed date formats.
- Kept Utilities and Admin Tools permanently visible in the desktop sidebar.
- Reduced heavy typography across navigation and admin pages, and removed the unintended card styling from Fleet rows.
- Added Ready for Service and Not Ready for Service indicators using live sheet locations, plus an Off Property status card on Home.

## 0.1.15 - 2026-07-10

- Removed repeated inspection shortcuts such as C-24 from flag displays when the linked object-code description already identifies the inspection type.
- Kept inspection details descriptive in compact fuel and DEF summaries that do not list object-code flags separately.
- Expanded the Flag Editor to all 371 object-code flags with Daily Flags and Object Codes filters.
- Separated bus models, inherited model tags, and Standard/Pulse wraps while preserving the existing slash-separated sheet badges.
- Added editable model definitions so changing a model tag updates every linked bus without editing buses one at a time.
- Included fleet appearance configuration in PDF cache signatures so tag text and color changes invalidate old printouts.

## 0.1.14 - 2026-07-10

- Added sortable employee columns and a mobile-friendly sort control for names, employee IDs, seniority, hire dates, and classifications.
- Linked every inspection chip to its authoritative object-code flag, including all A/B/C mileage intervals.
- Added Transmission PM-75000 as an inspection option linked to object code 1375.
- Recognized typed inspection shorthand such as C-24, PMC-24000, full PM descriptions, and transmission PM wording instead of saving them as Other notes.
- Normalized existing saved inspection options so their matching object-code flags appear automatically.

## 0.1.13 - 2026-07-10

- Spelled out object-code descriptions on-screen and in PDFs for the Turnover sheet and Buses with Flags summary while keeping compact Lot Sheet cells short.
- Imported the provided 43-person employee roster by employee ID without replacing existing employee records.
- Added separate Shop Seniority and Pace Hire Date fields to the employee editor.

## 0.1.12 - 2026-07-10

- Changed selected object-code flag chips to lead with the object-code description while keeping the number visible as supporting metadata.
- Fixed touch scrolling in mobile lot editors and other long menus.
- Standardized live fleet totals: lots are North, East, and Fence; shop is Apron, Bays, and Cards; every other known location and off-property bus stays out of Missing.
- Turned the Turnover sheet's 1st Half bay field into fast flag-or-note entry that updates the bus's universal flags.

## 0.1.11 - 2026-07-09

- Split Admin Tools into dedicated pages (Flag Editor, Bus Lists, Employees) with a shared tab bar instead of pop-up dialogs.
- Redesigned the Flag Editor as a searchable list you tap to edit one flag at a time, keeping every existing option.
- Made a flag's object codes a searchable dropdown that supports attaching several codes per flag.
- Reworked Bus Lists so you can add and remove bus types, edit each type's code and color, and give a bus more than one type.
- Added Standard to the bus type list and showed each bus's model (now editable) in the fleet list.
- Expanded employees to first name, last name, badge, start date, and classification; existing names migrate automatically.

## 0.1.10 - 2026-07-09

- Added true custom hex colors for admin-managed flags.
- Split flag color from priority so priority controls ordering while color controls presentation.
- Applied configured flag colors to flag pills and Lot Sheet cell/front flag text.
- Added color picker, hex input, and preset swatches to the Admin Tools Flag Editor.
- Bumped the PDF cache version so printed sheets regenerate with the new flag color model.

## 0.1.9 - 2026-07-09

- Added a protected Admin Tools sidebar section with Flag Editor, Bus Lists, and Employees.
- Kept the public Object Codes utility separate from administrative configuration.
- Added shared flag display configuration for names, sheet aliases, severity color, departments, quick chips, always-print behavior, aliases, and linked object codes.
- Moved Bus Lists and Employees out of the Shop section and behind the shared admin password session.
- Added audit logging for flag configuration changes.

## 0.1.8 - 2026-07-09

- Fixed the mobile header so Audit Log no longer appears twice.
- Gave the mobile sheet picker more room and kept the compact top bar focused on navigation, theme, and version.
- Added a mobile Lot Sheet bottom action bar with Fill Rows, Flags, Shop, and Print.
- Added a Pan/Fit view toggle for phone users reviewing the wide Lot Sheet.
- Simplified the phone Lot Sheet toolbar so search, status, Select, and More stay usable without crowding daily actions.

## 0.1.7 - 2026-07-08

- Made every object code assignable as a flag through the flag editor search.
- Kept object-code flags out of the quick-pick chips so daily flagging stays usable.
- Reworked the flag editor helper text so it no longer looks like a second search field.
- Added a reusable flag-detail definition layer for future sub-flag/detail expansion.

## 0.1.6 - 2026-07-08

- Added a collapsible Utilities sidebar section with an Object Codes page.
- Added a searchable object-code reference from the provided Pace object-code photos.
- Linked existing high-level flags to starter object-code metadata and made flag search match those codes.
- Added Follow Up as a quick chip inside the inspection type picker while keeping it as its own flag.
- Clarified the flag editor search/add fields so the lower input no longer reads like a dead search box.

## 0.1.5 - 2026-07-08

- Added GitHub Codespaces devcontainer setup for portable repo access.
- Added `AGENTS.md` with branch, handoff, data-safety, and verification rules.
- Added `npm run verify` for a single TypeScript/build pre-push check.

## 0.1.4 - 2026-07-08

- Fixed Lot Sheet time/date so automatic Chicago time is display-only and cannot overwrite shared sheet data.
- Preserved cell and lot edits made while a save is in flight by merging them with the saved server response.
- Preserved manually typed time/date values with explicit override markers.
- Added the app version under System in the sidebar for quick production verification.
- Returned sheet revision numbers from the sheet API so live edit polling starts from the correct revision.

## 0.1.3 - 2026-07-07

- Restored Fill Rows as a full-screen workflow that covers the app sidebar.
- Fixed dialog scroll locking so the sheet no longer shifts when menus open.

## 0.1.2 - 2026-07-07

- Fixed printed sheet dates/times to use Chicago, IL time.
- Updated PDF cache keys so printouts refresh when Chicago print time changes.
- Kept user-entered time/date values while autofilling blank fields.
- Changed Fill Rows to open as a normal modal instead of a full-screen manager panel.

## 0.1.1 - 2026-07-07

- Added the new sidebar navigation layout with clearer sheet and tool sections.
- Updated the Work Order sheet to better match the provided Pace sample and logo.
- Improved Lot Sheet printing so the printed time/date reflects the print moment.
- Added AM/PM plus military time formatting for the Lot Sheet timestamp.
- Added `Print Blank` from the Lot Sheet More menu; it opens a one-page blank PDF.
- Preserved manual time/date edits when a user overrides the automatic values.
- Fixed menu layering and Bus Lists password modal layout issues.
