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

## Codespaces

The Codespaces/devcontainer setup runs `npm ci` automatically and forwards port `3000`.

Start the app with:

```powershell
npm run dev
```
