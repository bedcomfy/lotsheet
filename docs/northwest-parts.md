# Northwest parts and charge history

The Parts page (`/fusion/parts`) lets a connected Lotsheet user search an NWD part number or multiple words from its description, inspect stock and assigned locations, and read the work orders where that component was actually issued or returned. The bus filter operates on all material entries loaded for the selected part. Repeated entries on one work order remain separate; the summary counts distinct work orders with issues. Returns are labeled and can be hidden. Quantities are displayed as Oracle returns them, without a synthetic net-consumption calculation.

## Scope and authentication

- Fixed tenant: `https://iaymqy.fa.ocs.oraclecloud.com`.
- Fixed organization: `300000004581674` / `NWD` / `Pace Northwest Division`.
- Uses the encrypted test vault described in [Saved Oracle Fusion access](fusion-browser-connection.md). With `FUSION_SHARED_TEST_ACCESS=on`, every device/site visitor can read through a valid saved connection without its own Oracle login. With sharing off, a signed, expiring browser permit or private test header is required.
- Every application request requires `X-Lotsheet-Fusion: 1`, same-origin checks, and an unexpired saved credential. Oracle validates the credential on every upstream read.
- The server checks returned organization IDs/codes and component/bus filters; it rejects mismatches rather than quietly filtering them out.
- The existing favorite is unchanged. Successful reads migrate old bearer cookies into encrypted server storage when `FUSION_TEST_VAULT_KEY` is configured.

## Reads

### Production correction in 0.57.2

Live reads on November 14 confirmed that the tenant rejects unqualified `itemsV2`
scans with `EGP-2776154` (three search characters required). The context check now
uses a bounded NWD `subinventoryItems` read. When that specific catalog rejection
occurs, the existing Buyers Inventory report is run with item parameter `All` and
organization fixed to Pace Northwest Division. It returned 8,648 distinct part
numbers and 8,658 stock rows in the captured live read. These are report coverage,
not a claim of unrestricted access to every Oracle item or transaction.

The corrected reader also completed live REST scans of 2,773 locator assignments,
2,759 stockroom assignments, and 2,531 on-hand balance rows. With the available
saved credential, the on-hand endpoint succeeded after the compound-filter fix.
Bus 6403 history returned part 081521 on NWD-1680 and coolant 910090 on NWD-1693.

The complete report is checked before results are served (48 MB upstream and 3.5 MB
per application payload limits); oversized/incomplete output fails explicitly.
Catalog and stock share a short, credential-bound in-memory business-data snapshot,
with a fresh Oracle permission check on reuse. Nothing from this cache authorizes
another account. This fallback does not enumerate thousands of guessed prefixes.

Report parts use an opaque encoded part-number key. History resolves that exact
number through a bounded NWD `itemsV2` lookup, verifies one exact match, then uses
the returned item ID to read material transactions. Locations join on the NWD part
number as well as item ID. Report units/status are left unknown when absent.
Compound filters use `and` with REST framework version 4; semicolon syntax failed
in live requests. The earlier REST-only design below applies when broad catalog
queries are allowed; the deployed fallback handles this tenant's restriction.

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

The Bus number field accepts any typed number, including a bus absent from the
selected part's returned history. Filtering uses an exact, trimmed, case-insensitive
match; blank shows all buses. A no-match message names the bus and part only after
the full history read completes. Partial or failed reads are never presented as
proof of no history.

Charge rows also show **Mechanics on operation**, separately from **Part recorded by**.
The server reads `maintenanceWorkOrderTransactionHistory` with
`TransactionType='RESOURCE_CHARGE'`, scoped to Northwest and the exact pairs of
`WorkOrderId` and `OperationSequenceNumber` in the material page. It takes names from
`ResourceInstance` for Oracle resources whose `ResourceName` contains "mechanic".
This was verified against this tenant's `Mechanic` resource. These are historical
posted mechanic labor entries, not a current assignment roster or proof of who
physically issued the part. `CreatedBy` never supplies a mechanic name.

Twenty operation pairs are read per batch with two concurrent streams, following
Oracle's actual pagination. Names are deduplicated per operation. Empty names are
flagged; no labor, unnamed labor and an unavailable lookup have different labels.
A failed/partial labor lookup preserves the verified material rows and marks
mechanics unavailable; an authentication failure still stops the read. Each batch
has a 5,000-row cap, and further labor pages stop after a 30-second lookup budget
(an in-flight bounded request may complete afterward). Part history itself is not
stored in the browser inventory cache.

Two read streams build the index. Catalog search works while indexing continues. A fully completed snapshot is saved to IndexedDB in the connected browser; it contains business fields and an opaque connection fingerprint, not an authorization credential. A page reload first validates access against Oracle and only restores the snapshot for the same connection while it is under 15 minutes old and the credential is unexpired. Refresh index rebuilds it. No shared sheet tables or production data are modified.

The page clears displayed data on expiry, a 401, or a changed connection fingerprint. Each response is bound to the connection that initiated the scan, so a new cookie midway through indexing cannot merge two accounts' data. Aborted or superseded part searches cannot replace the current part's history. Returning focus rechecks Oracle access. A network failure shows a warning about previously read values; a catalog-access denial clears the view. Browser cache expiry is evaluated when loaded, and cached business data is not an authentication credential.

## Verification and live limitation

Parts errors distinguish authentication, permission, Oracle query rejection, response format,
storage and network failures. Safe diagnostics identify the resource and upstream status
without returning Oracle error bodies or authorization headers. General Fusion connected
status does not claim that a separate catalog request succeeded.

Every index/history page sends the opaque `X-Lotsheet-Fusion-Connection` fingerprint from
the verified context; it selects that same vault credential. A different token is never
silently mixed into an in-progress scan. Refresh can select another authorized connection.
`GET /api/fusion/diagnostics?kind=catalog|locations|subinventories|balances` is restricted
to the private server test header. It performs four fixed one-row NWD probes, reporting
status and field types only. It cannot fetch arbitrary URLs, reports or organizations.

Unit tests exercise input restrictions, tenant/organization scoping, actual-offset paging, report parsing against captured Oracle HTML, quantity semantics, expired credentials, repeated pages, changed connections, stale responses and cache boundaries. Browser stories cover keyboard name search, exact part lookup, bus filtering, returns, empty/error/loading states, dark theme, long content and phone safe areas. The isolated full-flow test runs actual application handlers and cookies with a synthetic Oracle boundary, including capped pages, report fallback, refresh/cache restore and lost authentication.

Live verification on 2026-11-14 used shared saved access from a browser without an
Oracle login. The complete Northwest scan returned 8,648 parts, 2,773 locator
assignments, 2,759 stockroom assignments and 2,531 stock balances. Coolant part
910090 returned 58 material entries across 57 work orders. These are observed
counts for that read and may change. Separate live labor probes confirmed Selvin
A Zambrano on NWD-1670 operation 40 and Roberto Velasco Jr. on NWD-1693 operation
110, while material CreatedBy identified a different person.

Primary references consulted:

- https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26a/fasrp/op-itemsv2-get.html
- https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26b/fasrp/op-maintenanceworkordertransactionhistory-get.html
- https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26b/fasrp/op-inventoryonhandbalances-get.html
- https://react-aria.adobe.com/ComboBox

The stock report fixture is the previously captured five-item NWD coolant HTML output from 2026-11-13; it contains business data only. Story and full-flow transaction rows are test examples, not claims about additional live charges.
