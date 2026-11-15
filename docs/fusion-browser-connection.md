# Saved Oracle Fusion access

Open `/fusion` in Lotsheet. Copy the favorite address into the address field of a
browser favorite named **Connect Lotsheet**. Sign into Fusion in that browser and
click the favorite. When the new Lotsheet tab says **Access saved**, close Fusion
and use Lotsheet. Access survives navigation, page refreshes, and reopening
Lotsheet in the same browser until the Oracle token expires. Reconnect with the
favorite when prompted. In testing, **Saved on site** confirms encrypted
server storage. Disconnect removes this browser's contributed token from the
test pool and clears its local access.

Fusion and Parts show a live `HH:MM:SS` countdown and the exact local expiration
time. The countdown uses the server's effective access expiry (including the
browser permit limit when site-wide sharing is off) and calibrates against server response time. It recomputes
from that timestamp each second and when the tab becomes visible, turns amber
in the last 15 minutes, and stops at zero. Restoring a cached parts index uses
the freshly validated connection expiry. Countdown ticks do not call Oracle.

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

`FUSION_SHARED_TEST_ACCESS=on`, together with the vault key, enables the explicitly
requested redevelopment mode: every site visitor on any device can use the saved
read-only connection without an Oracle login, test code, cookie, or bookmark on that
device. This applies to session status, records, and Parts. The site's current access
gate is off, so this includes anonymous visitors. No browser permit is issued to a
borrower. The countdown uses the selected token's actual expiry, and an older device
permit does not shorten it. When all saved tokens expire or are rejected, reads stop.

With the switch off or absent, only a valid signed tester permit or private server
test authorization can borrow a saved token, and the permit's expiry bounds borrowed
access. Disable the switch and redeploy to restore that boundary; this is a testing
configuration, not per-user production authorization. Reads try the contributed
token first, then other saved tokens when Oracle denies authentication or permission.
Oracle enforces the selected credential's permissions on every read. Parts pagination
remains pinned to one credential so records from different connections are not mixed.

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
Disconnect is available to a browser that contributed access. It removes that server
token and cookies; a fresh device borrowing shared access cannot remove someone else's
token and does not show this control. Disconnect does not revoke the
Oracle-issued token. Restoring the Fusion page now verifies an actual Oracle read,
not just the locally decoded expiry. Catalog access is still a separate permission.

## Verification

The receiver checks for already-saved access every five seconds while a bookmark
handoff is pending, including after a remount with an unfinished pairing ID.
The complete handoff has a 45-second deadline that remains active during token
saving. Late responses cannot return a timed-out screen to Connected. The favorite
protocol is unchanged, so an existing v2 favorite does not need replacement.

Run `npm run verify`, then `npm run e2e:fusion` against the compiled app. The
browser test runs real Lotsheet session and read handlers with a synthetic
Oracle server boundary loaded only by its isolated test server. No synthetic Oracle
upstream exists in production code. Tests close Fusion before reads,
refresh and reopen Lotsheet, use a fresh phone browser without Oracle cookies to
read work orders, index Parts and read charge history, exercise reauthentication,
expiry and disconnect, and inspect desktop/phone layouts. All credentials and
records in tests are synthetic. Unit tests also verify the sharing-off boundary,
fallback, expiry and removal ownership. A final live test uses the saved connection
from a fresh browser to confirm the deployed site works without a device login.

References: [Oracle token relay](https://docs.oracle.com/en/cloud/paas/visual-builder-addin/dev-guide/oracle-fusion-applications-token-relay-authentication.html)
and [cookie attributes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).
