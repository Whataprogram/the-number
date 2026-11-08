# The Number — Settle Assist (browser extension)

Rides along on the IRS **Direct Pay** page and fills every field from your Number —
Reason for Payment, Apply Payment To, Tax Period, and the Amount. It **never submits**;
you always authorize the payment yourself.

## Why an extension (and not autofill from the website)

A website can't fill the IRS form — the browser's same-origin rule blocks any site from
touching `directpay.irs.gov`, and a bookmarklet gets blocked by the IRS page's security
policy. An extension's content script runs in an isolated world that's exempt from that
policy, so it *can* fill the fields — on your own browser, your own session. It stops
before Submit on purpose: The Number never moves your money.

## Load it (Chrome / Edge, ~20 seconds)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top-right)
3. Click **Load unpacked** and pick this `extension/` folder
4. Done — the extension is active.

## Demo it

1. In The Number, go to **Settle → Pay guided**. It opens the demo IRS Direct Pay
   replica (`/demo/irs`) with your values in the URL.
2. The **Settle Assist** panel appears top-right and fills each field one at a time.
3. Nothing is submitted — that's the point.

## Run it on the real IRS site

The content script already matches `https://directpay.irs.gov/*`. It targets the demo
replica's field ids first, then falls back to matching the real page's fields by their
labels. The live IRS DOM can change, so treat the live-site path as best-effort; the
demo replica is the reliable surface for a presentation.

## Files

- `manifest.json` — MV3 manifest (content script only, no special permissions)
- `content.js` — reads the values from the page URL hash, injects the panel, fills fields
