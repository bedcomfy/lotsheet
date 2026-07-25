# Agent Handoff Guide

This repo is used by one agent at a time. Before starting work, check the current branch and working tree:

```powershell
git status --short --branch
git pull --ff-only
```

## Branches

- Use `main` only for production hotfixes that should deploy immediately.
- Use a separate branch for redesign or larger UI work, for example `codex/ui-redesign-command-center`.
- Commit and push before switching machines or switching agents.

## Data Safety

- Do not edit or commit `.data`, `.env`, `.env.local`, `.vercel`, `.next`, or `node_modules`.
- Production data lives outside the repo in the configured database. Do not copy preview/dev data into production.
- Be careful around `app/lib/store.ts`, `app/lib/lotSheetOps.ts`, and sync/polling code. These protect multi-user sheet edits.

## Versioning

- Every committed change should bump `package.json` and `package-lock.json`.
- Add a matching entry to `CHANGELOG.md`.
- The sidebar displays the package version under `System`, so production can be verified visually after deploy.

## Verification

Run this before pushing:

```powershell
npm run verify
```

For urgent production fixes, at minimum run:

```powershell
npm exec tsc -- --noEmit
npm run build
```

## UI Foundation

- Build new application controls with the React Aria primitives in `app/ui`.
- Keep sheet and print styling separate from application chrome. Never import the
  UI foundation into a printable sheet without verifying both browser and PDF output.
- Use the namespaced `--ui-*` tokens and CSS Modules for new UI. Do not add
  feature styles to the legacy global cascade.
- Add or update Storybook stories for light, dark, long-content, narrow-screen,
  and safe-area states when a component supports them.
- React Aria is the sole application interaction layer. Do not add Radix,
  Mantine, DaisyUI, Magic UI, Ark UI, or native hand-rolled overlays without an
  explicit architecture decision.
- Use `ResponsiveDialog` for overlays and `ConfirmDialog` for destructive
  confirmation. Do not use `window.confirm` in new UI.
- Run `npm run test:ui` for behavior and accessibility checks. Run
  `npm run test:visual` when changing shared component visuals.

## Codespaces

The Codespaces/devcontainer setup runs `npm ci` automatically and forwards port `3000`.

Start the app with:

```powershell
npm run dev
```
