# Northwest parts and charge history

The Parts page (`/fusion/parts`) lets a connected Lotsheet user search an NWD part number or multiple words from its description, inspect stock and assigned locations, and read the work orders where that component was actually issued or returned. The bus filter operates on all material entries loaded for the selected part. Repeated entries on one work order remain separate; the summary counts distinct work orders with issues. Returns are labeled and can be hidden. Quantities are displayed as Oracle returns them, without a synthetic net-consumption calculation.

## Scope and authentication

- Fixed tenant: `https://iaymqy.fa.ocs.oraclecloud.com`.
- Fixed organization: `300000004581674` / `NWD` / `Pace Northwest Division`.
- Uses the existing browser's Secure, HttpOnly, SameSite=Strict Fusion cookie. No access to another browser's connection and no central token store.
- Every application request requires `X-Lotsheet-Fusion: 1`, same-origin checks, and an unexpired saved credential. Oracle validates the credential on every upstream read.
- The server checks returned organization IDs/codes and component/bus filters; it rejects mismatches rather than quietly filtering them out.
- No new tokens, credentials, or environment variables. Existing Fusion connection setup is unchanged.

## Reads

The only new application endpoint is `GET /api/fusion/parts`. It accepts a fixed `kind`, an offset, and (for history only) a numeric component ID and optional exact bus. Arbitrary endpoints, SQL, organization IDs and report paths cannot be supplied.

| Kind | Oracle resource | Purpose |
| --- | --- | --- |
| context | `itemsV2`, limit 1 | Validate NWD catalog access before restoring a browser cache. Returns an opaque SHA-256 connection fingerprint, expiry and NWD; never the token. |
| catalog | `itemsV2` | Item ID, number, description, catalog unit/code and status. |
| locations | `locatorItems` | Item-to-subinventory/locator assignments. |
| subinventories | `subinventoryItems` | Item-to-stockroom assignments, including items without a locator assignment. |
| balances | `inventoryOnhandBalances` with `SummaryLevel='Locator'` | On-hand balances, locator, quantity and returned primary unit. |
| history | `maintenanceWorkOrderTransactionHistory` | `ComponentItemId` plus `MATERIAL_ISSUE` / `MATERIAL_RETURN`, optionally `AssetNumber`. Includes work order, bus, operation, date, quantity/unit, stockroom/locator, recorded-by and note. |
| stock-report | Fixed Buyers Inventory `runReport` | Fallback when the on-hand endpoint cannot finish a read. |

REST prefix: `/fscmRestApi/resources/11.13.18.05/`. REST calls are GETs, no cookies, no redirects, no HTTP caching, with `REST-Framework-Version: 4`. History sorts by transaction date and ID; catalogs/assignments have stable sort fields. Server output contains only selected business fields, no raw Oracle bodies or headers.

The fallback uses SOAP `runReport` at `/xmlpserver/services/ExternalReportWSSService` for `/Custom/Reports/ERP/Inventory/PACE_Buyers_Inventory_12_Month_Usage_Report - Layout 1.xdo`. This is a read-only report invocation despite its HTTP POST transport. It does not charge parts, create work orders, record labor or change inventory. Each call selects at most 100 NWD catalog items server-side and supplies those part numbers and the fixed Northwest organization as report parameters. The browser cannot provide another report or parameters. Returned HTML is parsed on the server and never rendered as application HTML.

## Completeness and quantity semantics

- Every list follows `hasMore` and advances by **actual returned rows**, including when Oracle caps the requested page size. The report stream advances by the underlying catalog page, since a part may have multiple stock rows.
- All catalog parts are indexed; no active-status or bus-reference-list filter is applied. Suggestions display up to 40 matches, but search runs over the complete loaded catalog.
- The history fetch follows every page, with no default date cutoff. Only material transactions for the selected component and NWD are included. Bus reference components are never treated as actual charges.
- UI history shows 50 entries at a time with Show more; this display size does not limit the read.
- The UI reports counts and complete/loading/incomplete states independently for catalog, locators, stockrooms and balances. Errors, duplicate/overlapping pages, nonadvancing pages, format changes and safety limits cannot produce a complete badge.
- Safety bounds: REST bodies 4 MB; report bodies 48 MB; report JSON 3.5 MB; maximum offset 1,000,000. A bound produces an explicit incomplete state, never silent truncation.
- A stock failure does not prevent catalog search or charge history. The UI identifies the stock source and last-read time.
- Missing quantity/stock rows stay unknown. An assigned locator is not evidence of stock. Only an explicit returned zero is shown as zero.
- A total is shown only after a complete on-hand read where every row has a known consistent primary unit. Buyers report OH_QTY has no unit in the saved output, so it is displayed separately without a converted total. The catalog unit is labeled separately.
- All reads are current-account scoped and occur over multiple requests; they are not a database snapshot. New transactions or catalog edits during a scan can cause overlapping pages (detected as incomplete) or other source movement. Refresh to repeat a scan. "All available" means all pages returned by Oracle under the current account and filters, not proof that the account can see every historical record.

## Browser index lifecycle

Two read streams build the index. Catalog search works while indexing continues. A fully completed snapshot is saved to IndexedDB in the connected browser; it contains business fields and an opaque connection fingerprint, not an authorization credential. A page reload first validates access against Oracle and only restores the snapshot for the same connection while it is under 15 minutes old and the credential is unexpired. Refresh index rebuilds it. No shared sheet tables or production data are modified.

The page clears displayed data on expiry, a 401, or a changed connection fingerprint. Each response is bound to the connection that initiated the scan, so a new cookie midway through indexing cannot merge two accounts' data. Aborted or superseded part searches cannot replace the current part's history. Returning focus rechecks Oracle access. A network failure shows a warning about previously read values; a catalog-access denial clears the view. Browser cache expiry is evaluated when loaded, and cached business data is not an authentication credential.

## Verification and live limitation

Unit tests exercise input restrictions, tenant/organization scoping, actual-offset paging, report parsing against captured Oracle HTML, quantity semantics, expired credentials, repeated pages, changed connections, stale responses and cache boundaries. Browser stories cover keyboard name search, exact part lookup, bus filtering, returns, empty/error/loading states, dark theme, long content and phone safe areas. The isolated full-flow test runs actual application handlers and cookies with a synthetic Oracle boundary, including capped pages, report fallback, refresh/cache restore and lost authentication.

During implementation the accessible local browser showed Not connected. No fresh Oracle credentials were available there. This feature therefore still requires the first live NWD scan in the user's connected work browser to establish current endpoint permissions, timings, inventory counts and full report coverage. The implementation does not claim that the live NWD inventory has already been populated.

Primary references consulted:

- https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26a/fasrp/op-itemsv2-get.html
- https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26b/fasrp/op-maintenanceworkordertransactionhistory-get.html
- https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26b/fasrp/op-inventoryonhandbalances-get.html
- https://react-aria.adobe.com/ComboBox

The stock report fixture is the previously captured five-item NWD coolant HTML output from 2026-11-13; it contains business data only. Story and full-flow transaction rows are test examples, not claims about additional live charges.
