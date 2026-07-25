# SheetKit and Paper Lab

Status: foundation implemented for the 0.18.0 release

The first production foundation is now live in the codebase:

- A typed sheet registry owns routes, paper profiles, versions, variants, and
  expected page ranges.
- Letter and Legal profiles use exact physical dimensions.
- `PaperPage` and `PaperViewport` provide shared page metadata and mobile fit.
- Existing trusted paper markup is registered and wrapped without reflowing it.
- Zod schemas validate stored sheet data at adapter boundaries.
- Generic keyed-state and specialized Lot Sheet storage adapters are available.
- The PDF API reads the registry, freezes one data snapshot, waits for assets,
  and renders the declared physical page.
- Paper Lab and Playwright verify Letter, Legal, phone fit, live previews, and
  production PDF MediaBoxes.
- `npm run sheet:new -- --id <name> --size <profile>` scaffolds a new sheet.

Pure paper/editor extraction can continue one sheet at a time when its content
needs to change. It is not required before using the shared profiles, storage,
generator, mobile fitting, or deterministic PDF pipeline.

## Purpose

SheetKit is the production foundation for creating, editing, saving, previewing,
and printing operational sheets. Paper Lab is the Storybook and automated
regression environment that proves those sheets still look and print correctly.

They solve a different problem from the application UI foundation:

- The UI foundation standardizes buttons, fields, menus, dialogs, navigation,
  responsive behavior, and interaction accessibility.
- SheetKit standardizes document data, physical paper, screen previews, storage,
  history, and print variants.
- Paper Lab supplies approved fixtures and visual, geometry, and PDF tests.

Neither system changes the approved content or arrangement of the existing
paper forms.

## Non-Negotiable Rules

1. Existing paper content and geometry remain unchanged unless a change is
   explicitly approved.
2. The on-screen paper preview and generated PDF use the same paper component.
3. Application chrome is separate from paper markup and never appears in PDFs.
4. Paper dimensions use physical units such as `in`, not viewport dimensions.
5. Mobile editors may be redesigned for usability without reflowing the printed
   document.
6. Current production data remains readable throughout migration.
7. The Lot Sheet operation log and multi-user protections are preserved.
8. Every migrated sheet receives approved blank, normal, and stress fixtures
   before its old implementation is removed.

## Architecture

Every sheet has three layers.

### 1. Typed Sheet Data

The data layer defines:

- The sheet's stored data shape
- A runtime validation schema
- Its current data version
- Its blank/default state
- Migrations from older saved versions
- Loading, saving, history, and collaboration behavior

### 2. Paper Component

The paper component defines only the physical document:

- Page size and orientation
- Printable safe area
- Tables, grids, fields, labels, and checkboxes
- Logo, title, and page numbering
- Blank/current/flagged visual variants
- Multi-page composition

The paper component receives validated data and renders deterministically. It
does not fetch, autosave, poll, open dialogs, or own application navigation.

### 3. Application Editor

The editor provides the best interface for entering the paper's data:

- Desktop controls may sit beside an exact paper preview.
- Mobile controls may use lists, cards, steps, and search instead of shrinking a
  full paper form into a phone.
- An optional Fit/100% paper preview remains available.

Both editors write to the same typed data consumed by the paper component.

## Sheet Definition Registry

Each sheet registers a definition similar to:

```ts
interface SheetDefinition<T> {
  id: string;
  title: string;
  dataVersion: number;
  schema: RuntimeSchema<T>;
  createBlank(context: SheetContext): T;
  migrate?(value: unknown, fromVersion: number): T;
  Paper: ComponentType<PaperProps<T>>;
  Editor: ComponentType<EditorProps<T>>;
  storage: SheetStorageAdapter<T>;
  print: PrintProfile;
}
```

The registry can drive:

- Routes and navigation
- Current and blank printing
- Previous Sheets
- Loading, saving, and error states
- Print options
- Paper Lab fixtures
- PDF generation and caching

## Paper Sizes

SheetKit must not assume Letter paper. A print profile declares exact physical
dimensions.

Built-in profiles should include:

- US Letter portrait: 8.5 x 11 inches
- US Letter landscape: 11 x 8.5 inches
- US Legal portrait: 8.5 x 14 inches
- US Legal landscape: 14 x 8.5 inches
- Custom physical dimensions when required

The Turnover Sheet uses US Legal portrait. Its viewport must calculate Fit from
the Legal aspect ratio, while its PDF uses Legal dimensions directly.

Example:

```ts
const turnoverPrintProfile = {
  page: { width: "8.5in", height: "14in" },
  orientation: "portrait",
  margins: {
    top: "0.25in",
    right: "0.25in",
    bottom: "0.25in",
    left: "0.25in",
  },
};
```

## Shared SheetKit Components

Foundation primitives:

- `PaperPage`
- `PaperViewport`
- `SheetToolbar`
- `SheetSaveStatus`
- `SheetHistory`

Specialized paper primitives should be added only when two or more real sheets
share the same geometry. Existing forms keep their proven tables and grids
until a tested extraction removes meaningful duplication.

`PaperViewport` owns Fit, 100%, panning, wheel behavior, touch containment, and
safe-area handling. It never changes the paper's physical dimensions.

## Paper Lab

Paper Lab is a dedicated Sheets section in Storybook. Every sheet receives
fixtures for:

- Blank data
- Typical populated data
- Maximum realistic data
- Long notes and descriptions
- Flags and bus type labels
- Every print variant
- Every page in a multi-page document
- Desktop 100% preview
- Desktop Fit preview
- Phone Fit preview
- Phone 100% preview
- Loading, saving, and error states for the editor

Automated checks should verify:

- Exact physical page dimensions
- Expected page count
- No content outside the printable safe area
- No unexpected clipping or wrapping
- Stable cell dimensions and alignment
- No application chrome in print documents
- Loaded fonts and decoded images before print readiness
- Visual differences from approved reference images and PDFs
- Reachable mobile controls and dialog actions

## Creating a New Sheet

A generator should scaffold new sheets:

```powershell
npm run sheet:new -- --id inspection --size legal
```

Generated files:

```text
app/sheets/inspection/
  definition.ts
  schema.ts
  InspectionEditor.tsx
  InspectionPaper.tsx
  fixtures.ts
  InspectionPaper.stories.tsx
  inspection.test.ts
```

The implementation sequence is:

1. Define and validate the sheet data.
2. Define the physical print profile.
3. Compose the approved paper from SheetKit primitives.
4. Build desktop and mobile editors.
5. Add blank, typical, and stress fixtures.
6. Generate and approve a reference PDF.
7. Register the definition to receive navigation, storage, history, and print
   integration.

## Changing an Existing Sheet

### Editor-Only Change

Change the desktop or mobile editor. The paper component and PDF remain
unchanged.

### Paper-Only Change

Change the paper component. Paper Lab displays the visual and geometry
differences, and a new baseline is accepted only after review.

### Stored-Data Change

Increment `dataVersion` and provide a migration. Current and archived documents
remain readable.

```ts
const migrations = {
  2: (oldValue: V2): V3 => ({
    ...oldValue,
    supervisor: "",
  }),
};
```

### Shared Primitive Change

A change to a component such as `PaperTable` runs the Paper Lab suite for every
sheet. This makes cross-sheet improvements possible without hidden regressions.

## Existing Sheet Migration

Migration must be incremental:

1. Capture the current approved HTML previews and PDFs as golden references.
2. Move existing paper markup into a pure paper component without restyling it.
3. Prove there is no visual or page-size difference.
4. Connect the existing storage behavior through a SheetKit adapter.
5. Move screen controls into the editor layer.
6. Replace duplicated infrastructure with shared primitives only after parity.

Suggested order:

1. Farebox
2. Fuel and DEF
3. Turnover
4. Work Order
5. Lot Sheet

## Lot Sheet Integration

The Lot Sheet benefits from SheetKit without replacing its realtime operation
model.

### Data Adapter

`LotSheetStorageAdapter` wraps the existing APIs and operation log:

- Load the current revision
- Subscribe to new operations
- Apply a field or placement operation
- Archive the current sheet
- Create blank print data
- Clear the grid or printed lots through existing operations

The current merge, serialization, actor, and latest-operation behavior stays in
place.

### Paper Components

The current printable DOM is separated into:

- `LotSheetDocument`
- `LotSheetPageOne`
- `LotSheetPageTwo`

Both pages declare their exact Letter print profiles. Current, blank,
maintenance, and flag variants are typed options rather than unrelated query
parameter branches.

### Editor Components

Desktop retains direct grid editing. Mobile can use operational views such as:

- Find bus
- Fill rows
- Move bus
- Edit flags
- Manage lots and shop locations
- Fit/100% paper preview

These editors submit the same existing Lot Sheet operations. They do not own
paper geometry.

### Expected Improvements

- Sheet scrolling and scaling are owned by one tested viewport.
- A paper adjustment cannot accidentally move a toolbar or dialog.
- Mobile workflows no longer depend on fitting the entire grid on screen.
- Page one and page two are tested independently and together.
- Blank/current/maintenance PDFs share one deterministic rendering path.
- The 81 KB Lot Sheet component can be divided by responsibility without
  rewriting synchronization.

## PDF Printing Improvements

### 1. Typed Print Profiles

Each sheet declares page dimensions, orientation, margins, expected page count,
and supported variants. The PDF API reads the definition instead of maintaining
route-specific assumptions.

### 2. Immutable Print Snapshots

Printing should capture a specific validated sheet revision before launching
the browser renderer. The renderer must not fetch a newer live state halfway
through PDF generation.

A print request should identify:

- Sheet id
- Data revision or content hash
- Print variant
- Definition version
- Print profile version

This is especially important for the multi-user Lot Sheet.

### 3. Deterministic Readiness

The print page exposes readiness only after:

- Data is validated and rendered
- `document.fonts.ready` resolves
- Logos and other images finish decoding
- Expected pages are mounted
- Geometry checks pass

The renderer waits for this contract instead of relying on an arbitrary delay.

### 4. CSS-Defined Physical Pages

Use `@page` with the declared physical dimensions and Chromium's
`preferCSSPageSize`. This supports Letter, Legal, landscape, and custom forms
without route-specific scaling guesses.

### 5. Content-Addressed PDF Cache

Cache keys should include:

- Sheet id
- Data hash or revision
- Variant
- Definition render version
- Print profile version

Changing Farebox paper should not invalidate an unchanged Fuel PDF. Current
revisions can be prewarmed after successful saves.

### 6. PDF Regression Tests

For every approved fixture:

- Generate the actual PDF with the production renderer.
- Assert page count and physical page dimensions.
- Rasterize each page.
- Compare it with the approved image baseline.
- Fail on clipping, unexpected pages, or geometry drift.

### 7. Print Diagnostics

Failures should return a clear error and diagnostic id instead of opening a
blank document. Logs should record the sheet, revision, profile, readiness
stage, render duration, and failure reason without storing unnecessary document
content.

### 8. Exact Preview

The normal screen preview uses the shared paper component. A final print-preview
option may display the cached generated PDF when absolute printer output needs
to be inspected before printing.

## Database Direction

Do not begin with a large production database migration.

First introduce typed schemas and storage adapters over the current `app_state`,
history, and Lot Sheet operation tables. A later schema can add generalized
sheet instances and operations if operational requirements justify it.

The generic direction may eventually include:

- `sheet_instances`: current metadata and version per sheet/date
- `sheet_revisions`: immutable archived versions
- `sheet_operations`: append-only field operations for collaborative sheets
- `print_jobs`: short-lived print snapshot metadata and cache references

The Lot Sheet remains on its proven specialized operation path until a
replacement demonstrates equal conflict and recovery behavior.

## Implementation State

Completed in the foundation release:

1. Shared page profiles, registry, schemas, storage adapters, and viewport.
2. Paper Lab geometry and visual baselines.
3. Production PDF profile, page-count, and MediaBox regression coverage.
4. Farebox, Fuel, DEF, Turnover, Work Order, service summaries, and Lot Sheet
   registered with physical page metadata.
5. Legal-size Turnover mobile fitting.
6. Deterministic immutable print snapshots and content-addressed caching.
7. New-sheet generator.
8. Specialized Lot Sheet operation adapter without changing its data model.

Deliberately deferred:

- Generalized database tables. Existing keyed state/history and the specialized
  Lot Sheet operation log remain the safer production model.
- Mechanical extraction of trusted paper tables into smaller components when
  no feature needs them. That refactor should happen with a sheet-specific
  golden reference, not as churn inside a foundation release.
