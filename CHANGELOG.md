# Changelog

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
