# Site gate

Every request to the site, on any path, hostname, or method, is checked by
`proxy.ts` until the browser holds an unlock cookie. The proxy has no
`matcher` on purpose: a request the matcher skipped would bypass the gate.
Page-like paths get the decoy, a plain typing-speed test ("keyflow") with no
link to the real site: no app chunks, fonts, icons, manifest, or styles. API
paths, Next's own chunks and image optimizer, Vercel paths, and files answer a
bare 404, so nothing can be enumerated. Trailing slashes, different casing,
encoded slashes, `..` segments, query strings, and RSC or prefetch requests
make no difference: anything that is not one of the two exempt paths below is
locked.

## How it unlocks

The typing test posts every finished run to `/api/typing/results`. A run whose
text is the passphrase comes back as a "personal best" with the unlock cookie,
and the page reloads into the real site at the same URL. The crew types the
passphrase into the box instead of the passage and presses Enter. Any other
run is acknowledged and dropped; nothing is stored.

The passphrase comparison ignores case and whitespace. Guesses are slowed by a
short delay and never confirmed in the response.

## Where the passphrase lives

`app/lib/siteGate.ts` ships with the SHA-256 hash of the built-in passphrase.
Set `SITE_GATE_PASSPHRASE` (Vercel: Production, Preview, and Development) to
replace it. The cookie is keyed off the active passphrase, so changing it also
signs every browser out and makes the crew type the new one once.

For local development without the variable, the built-in passphrase works.

## Cookie

`kf_session`, HttpOnly, SameSite=Lax, Secure in production, one year, stateless
(an HMAC keyed off the passphrase hash). Separate from the admin cookie
(`pace_admin`), which still gates admin edits after the site is unlocked.

## What gets through without the cookie

- `/api/typing/results`, the unlock endpoint.
- `/api/pm-mileage/sync`, which GitHub Actions calls every 30 minutes with no
  browser session. The route accepts no payload and has its own cooldown.

The PDF route renders sheets with a headless browser against the public host
and sets the unlock cookie on that browser first, so printing is unaffected.

## Tests

- `app/lib/siteGate.test.ts`, `app/lib/siteGateProxy.test.ts`, and
  `app/api/typing/results/route.test.ts` cover the module, the proxy, and the
  unlock route with a test passphrase.
- `e2e/gate.setup.ts` checks the decoy in a real browser, unlocks with the
  passphrase from `playwright.config.ts`, and saves the cookie jar the other
  end-to-end tests start from.
