# Oracle Fusion browser connection

Open `/fusion` in Lotsheet. Copy the favorite address into the address field of
a browser favorite named **Connect Lotsheet**. In the same browser, sign into
Fusion and click that favorite. It opens a new Lotsheet tab and connects it to
that specific Fusion tab. Choose work orders or assets and click **Read records**.

The favorite is tied to the Lotsheet origin from which it was copied. Save a new
favorite when moving from a preview to production, or when the connection code
changes. Keep the Fusion tab open. Reloading Fusion, signing in again, or closing
either tab requires another favorite click. Reloading the receiving Lotsheet tab
reconnects automatically while the original Fusion tab remains open.

## Scope and credentials

- Every Oracle operation is a GET. Only `maintenanceWorkOrders` and
  `installedBaseAssets` are allowed, with six selected columns and 25 rows per
  request. Search is by exact work-order or asset number; paging is bounded.
- The Fusion-side script uses the existing signed-in session to call
  `/fscmRestApi/anticsrf`, then `/fscmRestApi/tokenrelay` with `X-XSRF-TOKEN`.
  The API read uses the returned bearer token and omits browser cookies.
- Oracle credentials stay in the Fusion tab's closure. The receiving Lotsheet
  tab receives projected records and expiration metadata, never the token,
  cookies, or anti-CSRF value. It has no arbitrary URL or mutation capability.
- Both ends check the exact origin, window, and a random pairing ID. Request IDs
  correlate replies. The pairing ID alone cannot authorize a read.
- Results live in React state in the receiving tab. No records or credentials
  are saved to Lotsheet's database, browser storage, server routes, or logs.
  Only the non-credential pairing ID is kept in session storage for reloads.
- A read obtains replacement access near token expiration, or retries once
  after a 401. This depends on an active Fusion session; it is not unattended
  background access or a permanent integration credential.
- Disconnect clears the receiving tab and stops the Fusion-side listener.
  Closing/reloading Fusion stops the connection. Closing Lotsheet is detected
  by the Fusion-side script within five seconds.

## Verification

`npm run verify` covers the unit and Storybook suites and both builds.
After a successful Next.js build, `npm run e2e:fusion` starts the compiled app
with an isolated in-memory database. It mocks the entire Oracle origin and uses
only synthetic tokens and records. It clicks the actual generated JavaScript
URL, checks pairing, reads, token replacement, reload, disconnect, and phone
layout. It makes no live requests to Oracle.

The real work browser has separately demonstrated token relay, a bearer-only
work-order read, cross-tab messaging, and JavaScript favorites. The complete
saved-favorite flow still needs validation in that signed-in work browser.
Corporate browser policies, popup settings, and Oracle session changes can
affect that result.
