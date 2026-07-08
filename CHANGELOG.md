# Changelog

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
