# Oracle offline development kit

Captured from the authorized Northwest account on November 14, 2026 (capture timestamps in UTC in the manifest). This kit supports building and testing Lotsheet pages while Oracle is disconnected. It is evidence of **read behavior**, not approval or validation of create/update requests.

## What is saved

- The production `fusion_parts_catalog` table holds the complete saved NWD business catalog. It is independent of token lifetime, browser storage, and the current connection. The `/api/fusion/catalog` GET requires no Oracle token. No stock quantities, charge history or credentials are stored in this catalog.
- 8,648 report parts, 2,773 locator assignments, 2,759 stockroom assignments and 8,658 report location rows were read to completion. Multiple locations merge by part number. Blank report locations remain missing, not an invented bin.
- Expanded NWD stockroom reads yielded 4,299 distinct manufacturer/trade number associations across the catalog. Actual item IDs and usable location information were supplied for 2,755 parts. This does not establish that other items lack IDs or cross-references; those fields were not supplied by the bulk report.
- `app/lib/fusion/fixtures/live/*.json` contains real bounded response examples, including nulls, types, child links and pagination. `manifest.json` records exact paths, queries, HTTP status, capture time, count and `hasMore`. These fixtures contain no bearer tokens, cookies or authorization headers.
- `contracts.json` is a generated field/type inventory across each captured response. A field observed only as null is **not** established to be permanently null or nullable in a create request.

## Working offline

Run `npm run oracle:fixtures` for a loopback-only, GET-only fixture explorer at `http://127.0.0.1:4010/fixtures`. Fetch `/fixtures/work-orders`, `/fixtures/asset-6403`, `/fixtures/resource-history`, or another name in the manifest. It never contacts Oracle, renews credentials, or writes business records. Unknown names return 404 and writes return 405.

Tests can import the JSON files directly. `npm run oracle:contracts` regenerates the observed field inventory. Storybook includes saved-catalog offline, phone, dark, long-content and failed-refresh examples. `npm run e2e:fusion` runs the real Lotsheet handlers against the existing synthetic Oracle boundary, including saving a catalog, deleting the test connection, forcing Oracle context to return 401, and reloading the catalog from the real catalog handler. Real fixtures and synthetic transactions are kept distinct.

This is offline **from Oracle**. The production catalog still requires internet access to Lotsheet; this change does not install a device-offline PWA. The local fixture explorer works without internet.

## Captured resources and joins

REST base: `https://iaymqy.fa.ocs.oraclecloud.com/fscmRestApi/resources/11.13.18.05/`.
NWD organization ID: `300000004581674`; code `NWD`; report name `Pace Northwest Division`.

| Resource | Evidence / fields to use | Important distinction |
| --- | --- | --- |
| `maintenanceWorkOrders` | NWD-1670, NWD-1676, NWD-1693; IDs, descriptions, asset, planned/actual dates, status code and label, organization, creation/update metadata | `WorkOrderId` is the API key; `WorkOrderNumber` is display/search. Status codes and display labels differ. |
| Expanded work order | `NWD-1676-expanded.json` combines nested operations, materials, resource instances, asset and DFF data in one real response | Every nested collection still carries its own pagination; expansion is not a guarantee of completeness. |
| `.../{WorkOrderId}/child/WorkOrderOperation` | Complete operation lists for those three orders; 5, 10 and 13 operations at capture | Join `WoOperationId` to nested data; use `OperationSequenceNumber` with work-order ID for transaction history. Sequence is not globally unique. |
| `.../WorkOrderOperation/{WoOperationId}/child/WorkOrderOperationMaterial` | Empty and nonempty material examples | These are operation materials/requirements. Actual posted usage comes from transaction history. |
| `.../WorkOrderOperation/{WoOperationId}/child/WorkOrderOperationResource` | Mechanic labor resource, resource ID, operation/work-order IDs, usage, planned dates, resource type and work-center data | Required/planned usage does not prove actual labor charged. |
| `.../WorkOrderOperationResource/{WoOperationResourceId}/child/WorkOrderOperationResourceInstance` | One- and two-instance examples, names and instance IDs | Assigned instances are distinct from historical posted labor. |
| `maintenanceWorkOrderTransactionHistory` | Material issues and resource charges; component, work order, bus, sequence, dates, quantities, recorder, note, resource instance | `ComponentItemId` identifies the part; `InventoryItemId` can identify the bus model item. Never substitute one for the other. |
| `installedBaseAssets` | Bus 6403, asset ID `100000024726932`, operating organization, description, serial/VIN, nullable dates and flags | The bus number is not its Oracle asset ID. Enforce operating organization. |
| Asset children | Meters, descriptive flexfields, reference parts, relationships, notes and attachment/qualification examples | `partsListComponents` is a reference list, **not parts charged to that bus**. Samples with `hasMore=true` are incomplete by design. |
| `productionResources/300000012943508` | Mechanic master resource, child links | Resource identity/type is separate from employee identity. |
| `.../child/LaborInstance` | Employee names, labor identifier, instance ID, resource ID, organization and work center | Five-row sample, not a complete roster. No assumptions about employment status beyond supplied fields. |
| `workCenters` | NWD work center and child links | Organization-scoped setup data. |
| `standardOperations` | Three standard operation examples and resource links | Sample only; do not treat as a complete list of repair codes. |
| `itemsV2` | Full coolant 910090 item with unit, status, descriptions and flags | Broad catalog scans return search-required error in this tenant; exact number queries work. |
| `locatorItems`, `subinventoryItems` | Item IDs, part numbers, locator/stockroom assignments, planning fields | Assignments do not prove stock. Subinventory composite IDs must be retained as strings. |
| `subinventoryItems?expand=MPNs,GTINs` | Manufacturer numbers and trade-number child collections | Follow each child's `hasMore` separately. MPNs are strings; preserve leading zeros. Children are nested collection objects in this tenant. |
| `inventoryOnhandBalances` | Locator-level quantity and units | Live data only, deliberately excluded from the permanent catalog. |
| Work-order children | Status history, DFFs, work-order asset, project DFF, document references and attachments | Empty response means none in that sample, not that the endpoint is unusable. |

## Request and response rules

- All captured Oracle REST calls used GET, `Accept: application/json`, `REST-Framework-Version: 4`, and a bearer credential held only in memory. No browser cookies were sent upstream.
- Compound queries use `and`, not the semicolon filter syntax that failed earlier. Values must be validated and quoted safely. Always scope collection reads to NWD and verify returned organization data.
- List envelope: `items`, `count`, `hasMore`, `limit`, `offset`, and optionally `links`. Advance offsets by actual returned row count; Oracle can cap the requested limit. Sample limits are recorded; do not treat samples as complete when `hasMore` is true.
- IDs arrive as numbers or composite strings. Preserve IDs as strings in app models; validate safe integers before converting numeric IDs. Part numbers, MPNs, GTINs and employee identifiers remain strings.
- Dates include timezone offsets and sometimes fractional seconds. Preserve the source value and convert only for display. Empty text, null, omitted fields and zero have different meanings.
- Follow documented child links after validating the fixed tenant and resource path. Some item paths have opaque composite keys; do not guess a numeric item URL.
- Oracle's `links.properties.changeIndicator` is record-version metadata, not an authentication credential. Captures preserve it for future concurrency design; no write behavior has been tested.
- Historical mechanic display joins NWD + `WorkOrderId` + `OperationSequenceNumber`, reads `RESOURCE_CHARGE`, and takes `ResourceInstance` for mechanic resources. `CreatedBy` is the transaction recorder, not automatically the mechanic. Empty labor names remain explicitly unnamed.
- A `200` with zero items is not an authentication failure; `401`, `403`, query `400`, partial data, timeouts and malformed responses need distinct states. The offline test suite already covers these boundaries with synthetic failures.
- `WorkOrderStatus='UNRELEASED'` returned no rows, while `WorkOrderStatusCode='ORA_UNRELEASED'` returned an unreleased order. Both observations are retained; use the code field instead of guessing the case of a translated display label.

## Authentication retained in code, without credentials

See `docs/fusion-browser-connection.md`. Azure signs the user into Fusion; the bookmark performs the same-origin anti-CSRF/token-relay exchange and transfers a short-lived bearer to Lotsheet. Oracle validates it before the site saves it encrypted. JWT `exp` supplies the live countdown; the successful observed token lifetime was four hours. Decoding a JWT is not signature verification. No permanent API key or automatic indefinite refresh was established.

During authorized redevelopment, shared saved access allows site devices to use an unexpired saved connection. The catalog remains readable after that connection expires because it is retained business data, not a way to keep making Oracle requests. Refreshing the saved catalog still requires a valid Oracle connection and complete verified reads. A failed refresh retains the last good snapshot. The database table uses the repository's environment suffix isolation and never modifies lot-sheet state.

## Catalog update and organization controls

`GET /api/fusion/catalog` returns `{ catalog }`; initial empty database returns null. `POST` on the same endpoint takes no caller-supplied catalog, organization, endpoint or SQL: it performs the fixed NWD read and atomically replaces the saved snapshot only when all required sources complete. Only catalog business fields are projected into storage. A slower old capture cannot overwrite a newer completed capture. Catalog payload size is bounded to 3.5 MB.

The UI searches part number, description-derived name, full description, manufacturer/trade numbers, item IDs and locations. It supports a location dropdown, free-text location filter, ascending/descending sorting by part number/name/description/location, and display pagination. Missing locations are searchable as their own group. All rows are searched/sorted before display pagination.

## What remains for the next live session

1. Verify broader examples and permissions with both testers; capture missing field variants as needed. This kit covers the current planned read pages, not every Oracle module or field combination.
2. Test newly built read pages against live data and compare record counts, organization boundaries and joins. The fixtures are historical examples and will not establish current inventory or current work-order status.
3. Creation, part issues/returns, labor charging, release/completion actions, validation messages, idempotency, concurrency and rollback remain untested writes. Read responses are not reusable create payloads.
4. The separate work-order print/report workflow is documented in prior evidence where available; this capture did not establish a new PDF generation endpoint or template contract. Do not infer print behavior from REST read shapes.
5. Numbers saved here cover what Oracle returned for the indexed NWD stockroom items. Catalog-only rows can lack cross-reference details; acquiring those may need another permitted bulk resource/report.

Primary Oracle references: [Production resources](https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26b/fasrp/api-manufacturing-production-resources.html), [labor instances](https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26b/fasrp/api-manufacturing-production-resources-labor-instances.html), [subinventory manufacturer part numbers](https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26b/fasrp/api-inventory-management-subinventory-items-manufacturer-part-numbers.html), [maintenance inbound APIs](https://docs.oracle.com/en/cloud/saas/supply-chain-and-manufacturing/26b/faips/mtn-rest-apis-inbound.html). Live fixture evidence takes precedence over assumptions about fields returned by this tenant/account.
