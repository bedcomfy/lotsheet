# Saved Oracle Fusion access

Open `/fusion` in Lotsheet. Copy the favorite address into the address field of a
browser favorite named **Connect Lotsheet**. Sign into Fusion in that browser and
click the favorite. When the new Lotsheet tab says **Access saved**, close Fusion
and use Lotsheet. Access survives navigation, page refreshes, and reopening
Lotsheet in the same browser until the Oracle token expires. Reconnect with the
favorite when prompted. In private testing, **Saved on site** confirms encrypted
server storage. Disconnect removes this browser's contributed token from the
test pool and clears its local access.

The v0.56.1 favorite replaces v0.56.0's ongoing tab connection. Copy the new
address once. Favorites are tied to the Lotsheet origin from which they are
copied; save the production favorite when moving from a preview to production.

## Handoff and session

The favorite calls Oracle's anti-CSRF and token-relay endpoints using the user's
existing signed-in Fusion session. It transfers the bearer token once using
`postMessage` to the exact Lotsheet origin, window, and random pairing ID. The
receiver sends the token directly to `/api/fusion/session` in an HTTPS POST body.
It does not put it in a URL, clipboard, React state, local storage, or session
storage. The bookmark clears its token and listeners after acknowledgement.

The session endpoint checks the token with a bounded Oracle GET before saving it.
With `FUSION_TEST_VAULT_KEY` configured, AES-256-GCM ciphertext goes into the dedicated
`fusion_test_credentials` table, using the existing environment table suffix.
A signed, host-only `Secure`, `HttpOnly`, `SameSite=Strict` tester permit scoped to
`/api/fusion` replaces the bearer cookie. Permit lifetime ends at the JWT's `exp`; credentials with missing,
expired, over-24-hour or unsupported claims are rejected. Decoding JWT claims is
only a local lifetime check: Oracle verifies the actual credential on creation
and every data request. Cookie size is bounded to fit normal browser limits.

Only a browser with a valid signed tester permit, or private server test authorization,
can borrow a saved token. Anonymous visitors and the general site/admin passwords
cannot use the pool. Reads try the contributed token first, then other saved tokens
when Oracle denies authentication or permission. A borrowed token never extends the
browser permit's expiry. This is shared private test access, not per-user production
authorization. Oracle enforces the selected credential's permissions on every read.

No bearer is returned by any API or written to logs, browser storage, or source files.
The encryption key is a server-only 32-byte secret in production environment settings;
it is not an Oracle API key. The private testing header uses a separately derived HMAC.
Session responses contain status, storage, sharing and expiry metadata only.
All API responses disable caching. Expired rows are unusable immediately and purged on
vault access; a 401 deletes the rejected token. A 403 retains it for other resources.

Existing bearer cookies migrate on their next successful verified session/context/record
read. Without the vault key, local/test deployments retain the previous browser-only
cookie flow. A configured vault storage failure fails closed rather than silently
claiming server storage succeeded. Rotating the key invalidates permits and stored
ciphertext; reconnect with the favorite afterward.

## Reads and expiration

`/api/fusion/records` resolves authorized saved access for server-to-server reads. Only GET
requests to the fixed Oracle host's `maintenanceWorkOrders` and
`installedBaseAssets` endpoints are allowed. Searches are exact numbers, fields
are projected, pages are capped at 25 rows, and offsets are bounded. There are
no Oracle create/update/delete operations and no caller-controlled upstream URL.

Requests require a same-origin custom header; session changes also require a
matching Origin and JSON input. The routes do not enable cross-origin access.
Oracle permission checks still apply to each request. A 401 or token expiry
clears displayed results and asks for reauthentication. There is no automatic
refresh while Fusion is closed, and Oracle may reject access before `exp`.
Disconnect removes the contributed server token and cookies; it does not revoke the
Oracle-issued token. Restoring the Fusion page now verifies an actual Oracle read,
not just the locally decoded expiry. Catalog access is still a separate permission.

## Verification

Run `npm run verify`, then `npm run e2e:fusion` against the compiled app. The
browser test runs real Lotsheet session and read handlers with a synthetic
Oracle server boundary loaded only by its isolated test server. No test mode or
alternate upstream exists in production code. Tests close Fusion before reads,
refresh and reopen Lotsheet, check browser isolation, exercise reauthentication,
expiry and disconnect, and inspect desktop/phone layouts. All credentials and
records in tests are synthetic. A final live test requires the signed-in work
browser and confirms Oracle accepts requests from the deployed Lotsheet server.

References: [Oracle token relay](https://docs.oracle.com/en/cloud/paas/visual-builder-addin/dev-guide/oracle-fusion-applications-token-relay-authentication.html)
and [cookie attributes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).
