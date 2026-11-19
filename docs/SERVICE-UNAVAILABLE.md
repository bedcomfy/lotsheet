# Unavailable notice — 2026-11-19

The public Vercel addresses serve only `unavailable/index.html`:

> Unable to connect
>
> This service is no longer available.
>
> Please contact your system administrator or the site owner for support.

## Hosting boundaries

- The original `lotsheet` Vercel project (`prj_bX4zOH18zY6Dh97U6RFhCLY3jciS`) remains **paused**, blocking its active production deployment. Pause alone does not block every historical deployment.
- Its published firewall rule `rule_application_unavailable_2ft8Ty`, named **Application unavailable**, denies every request whose path starts with `/`, with no host, method, or environment exceptions. This covers historical production and preview deployments. Existing Vercel authentication protection is also retained. Anonymous requests can encounter the sign-in gate first; a browser already signed into Vercel was verified to receive `403 FORBIDDEN` from an old preview.
- The separate `lotsheet-unavailable` project (`prj_shYt8eskiYQQfpbgByyuHI88fekZ`) serves the notice. Deployment `dpl_F4X4L5EnxjNetS4nzGUPaJjN6U7T` was uploaded with exactly two source files: the notice and `vercel.json`. It has no application source, dependencies, functions, or application credentials.
- All 35 previously listed `*.vercel.app` aliases were reassigned to the notice deployment, including `lotsheet.vercel.app` and the branch aliases.
- `nwmaint.app` stays disconnected through its existing nonresolving DNS overrides. Its registration is retained.
- The catch-all route returns HTTP 503 and the same HTML for page, API, asset, and unknown paths. Vercel can return an empty 204 to static OPTIONS requests. There is no application handler behind either response.
- The notice has no links, forms, scripts, fonts, images, analytics, database access, or AI calls. Its Content Security Policy prevents external resources and browser connections. Responses are not cached.

Application source remains in this repository for restoration. The root `vercel.json` disables automatic Git deployments and limits a deliberate new deployment of this revision to the notice directory. It does not rewrite old branches or historical deployments; the original project's pause and firewall block must remain in place.

## Verification

`npm run verify` passed: TypeScript, 82 test files / 453 tests, Storybook build, and Next.js build. This checks the retained application source; the Next.js build is not published by the notice project.

Run `node scripts/verify-unavailable.mjs` to inspect the static artifact. After confirming the target is the notice deployment with no application functions, append its HTTPS origin to test pages, API paths, assets, and HTTP methods. Do not run its write-method checks against the original app.

Desktop (1280 px) and phone (390 px) browser checks confirmed a readable page, no horizontal overflow, no interactive elements, and only one document request. All 35 reassigned aliases returned HTTP 503 with the notice on `/parts`. Live tests confirmed that old application paths return only the notice. The original active production deployment returned `DEPLOYMENT_PAUSED`; an authenticated visit to a historical preview returned `403 FORBIDDEN` after publishing the firewall block.

## Preservation and restoration

The verified full backup remains at `F:\Lotsheet-Backups\Lotsheet-20261118-234753`. It was not modified by this change. Database contents and environment variables were not changed.

The separate `F:\Lotsheet-Backups\Service-unavailable-20261119\routing-journal.json` records each former alias/deployment association and its replacement. The previous DNS change is recorded separately in `F:\Lotsheet-Backups\Domain-routing-20261119`.

Restoration requires a new, explicit decision: prepare and verify the intended application, decide which features and credentials may run, then deliberately change hosting and domain routing. Do not unpause the original project or remove its firewall block merely to edit this notice. Removing the block can reactivate historical deployments, which must be considered separately from the new application. Content already downloaded to a visitor's device is not erased by this shutdown.
