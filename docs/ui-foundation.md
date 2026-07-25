# UI Foundation

The UI foundation is the workshop for application chrome: navigation, forms,
menus, dialogs, status displays, and administrative tools. It does not replace
or restyle the printable sheets.

## Architecture

- **Behavior:** React Aria Components provides accessible interaction,
  keyboard behavior, focus management, and mobile input support.
- **Appearance:** Pace-owned `--ui-*` design tokens and CSS Modules define the
  visual language. Components should feel operational, calm, and easy to scan.
- **Icons:** Use Lucide icons. Include text with unfamiliar actions and an
  accessible label for icon-only controls.
- **Workshop:** Storybook documents and exercises components independently of
  live sheet data.
- **Regression checks:** Storybook Vitest runs rendering and accessibility
  checks. Playwright stores focused visual snapshots for shared primitives.

The light theme is anchored by Ghost White (`#E8E9F3`). The dark theme uses a
neutral charcoal ladder rooted near Onyx rather than blue-black surfaces.
Pace blue is reserved for actions, navigation, links, and focus, while green,
amber, blue, and coral communicate operational states.

React Aria is the single interaction system for application controls. The
legacy Radix and hand-rolled overlay layers have been removed. Menus, dialogs,
confirmation flows, fields, tabs, checkboxes, and selections now share one
focus, dismissal, keyboard, and mobile-scroll model.

Mantine, DaisyUI, Magic UI, Adobe Spectrum, and Ark UI are references, not
runtime dependencies. Borrow layout and interaction ideas selectively; rebuild
them through the local tokens and React Aria primitives so the site keeps one
behavior model and one visual language.

## App And Paper

The application and the paper sheets are separate design systems:

- `app/ui` owns application controls and chrome.
- Colocated CSS Modules own feature layouts and application-only states.
- `app/styles` is reserved for the document reset, route-level responsive
  swap, trusted live paper DOM, and print/PDF rules.
- Printable DOM and print CSS remain unchanged unless a sheet-specific task
  explicitly requires an edit and PDF output is verified.
- A shared application primitive must never leak styles into printable markup.

This separation lets navigation and editing tools evolve without changing a
trusted paper layout.

## Component Contract

Shared components belong in `app/ui` and should:

1. Use semantic React Aria components rather than clickable generic elements.
2. Use CSS Modules and `--ui-*` tokens instead of global feature selectors.
3. Keep text weight moderate and letter spacing at zero.
4. Support keyboard, pointer, touch, focus-visible, disabled, and error states.
5. Constrain long content with a scrolling body while keeping primary actions
   visible.
6. Respect `100dvh`, safe-area insets, and reduced-motion preferences.
7. Include Storybook coverage for the states that can break in production.

Avoid nested cards and ornamental effects. Operational pages should prioritize
clear hierarchy, dense scanning, predictable actions, and generous touch
targets.

## Storybook

Start the local component workshop:

```powershell
npm run storybook
```

Open `http://localhost:6006`. Use the Storybook toolbar to switch light/dark
themes and phone safe-area simulation.

Run component behavior and accessibility checks:

```powershell
npm run test:ui
```

Run visual regression checks:

```powershell
npm run test:visual
```

Update approved snapshots deliberately:

```powershell
npm run test:visual:update
```

## Migration Order

1. Build and approve shared primitives in Storybook.
2. Replace one low-risk application control at a time.
3. Verify desktop, mobile, keyboard, and long-content behavior.
4. Migrate page chrome and operational workflows without changing paper DOM.
5. Add route-level regression checks before deleting legacy selectors.
6. Treat paper-sheet markup and printing as a separate project.

This is intentionally incremental. The foundation should make feature work
faster without forcing a risky whole-site rewrite.

## Live Adoption

The live migration now covers application chrome and operational surfaces:

- `app/lib/navigation.ts` is the route catalog for the desktop rail, mobile
  page switcher, and mobile Sheets/More hubs.
- `SheetNav.tsx` renders the shared `AppNavigation` component on desktop.
- `MobileNavigationBar` and `NavigationHub` provide the phone tab bar and
  full-screen page directories. The hub header and footer remain fixed while
  a safe-area-aware body owns long-content scrolling.
- `HomeDashboard.tsx` uses shared fields, buttons, badges, and metric tiles.
- `MTonight.tsx` is the dedicated phone Home surface. Its status groups use the
  same fleet calculations as desktop and open `ResponsiveDialog` sheets with
  scroll-owned bodies.
- Reference, staffing, service, shop, and Admin Tools pages use the shared page
  shell and form controls.
- Lot Sheet toolbars, cell editing, Fill Rows, flag management, lot editing,
  status details, Shop, and history browsers use the same responsive dialog
  contract. Headers and footers stay fixed while the body owns scrolling.
- Printable paper markup, live synchronization, and print/PDF styling remain
  independent and unchanged.
- Global legacy application selectors have been removed. The few global
  live-only selectors that remain are direct states on the Lot Sheet paper
  grid (drag source, drop target, found bus, selected cell, and lock icon).
- `Workflow Regressions` stories exercise inline bus lookup, long phone
  location lists, fixed dialog actions, bulk flag removal, revision-history
  states, and Work Order screen controls.

## Regression Matrix

Before a UI foundation change is ready:

1. Storybook must render light and dark themes.
2. Phone stories must simulate modern safe-area insets at 390 x 844.
3. Long menus and dialogs must keep their final action visible.
4. Empty, loading, error, and populated page states must be covered.
5. `/?print=1` must contain no application navigation or mobile chrome.
6. `npm run verify`, `npm run test:ui`, `npm run test:visual`, and the Playwright
   smoke suite must pass.
