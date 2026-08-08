# Password-Encrypt Ver-0.053 — Fixes, Improvements & Final Testing

Final pre-launch cleanup build before Version 1.000.

## Changes

- Enforces Ubuntu across the complete rendered UI, including mobile/PWA elements.
- Removes the long pricing/legal disclaimer beneath the public plan cards.
- Adds a prominent no-card trial message: no credit card details are taken during the free trial.
- Trial signup acceptance now covers Terms of Service and Privacy Policy only.
- Paid subscription checkout has its own required Subscription, Cancellation & Refund Policy acknowledgement.
- Stripe checkout independently enforces the billing-policy acknowledgement and records acceptance metadata.
- Moves signup steps 1–4 into the sticky create-account header: beside the title on desktop and below it on mobile.
- Retains Password-Encrypt branding, Personal-only public launch, security hardening, monitoring/recovery, legal pages and all Ver-0.052B functionality.

## Version alignment

- App/server: `Password-Encrypt Ver-0.053`
- npm: `0.0.53`
- service worker: `my-passwords-v0.053`
- patch folder: `password-encrypt-ver-0.053`

## Database / environment

No Supabase SQL changes and no new environment variables are required.

## Local testing

```bat
npm run security:check && npm run reliability:check && npm run legal:check && npm run build && netlify dev --no-open
```

## Deploy

```bat
git status && git add -A && git commit -m "Password-Encrypt Ver-0.053 final launch fixes and testing" && git push origin main
```
