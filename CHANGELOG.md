# Changelog

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
