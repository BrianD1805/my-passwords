# Password-Encrypt Ver-1.005.04 — Emergency Access Settings Split

## Scope

Emergency Access in Settings is now divided into two clear customer-facing purposes:

1. **Nominate a Trusted Person** — manage the customer's own Trusted Person arrangement, package preparation, invitation, waiting period and release flow.
2. **Receive an Emergency Package** — enter an Import Code from a package released by another Password-Encrypt customer and view packages already imported into this vault.

The Nominate section appears first. Receive is deliberately outside the customer's own Emergency Access plan-entitlement gate, so a customer can receive a package even when their plan does not allow them to configure their own Trusted Person arrangement.

Release-page and FAQ instructions now direct Password-Encrypt recipients to:

**Settings → Emergency Access → Receive an Emergency Package**

## Database / environment

No new Supabase SQL is required for Ver-1.005.04.
No Netlify environment-variable changes are required.
Existing VAPID keys remain unchanged.

## Version alignment

- App: Password-Encrypt Ver-1.005.04
- npm: 1.5.4
- Service worker cache: my-passwords-v1.005.04
- Server APP_VERSION: Password-Encrypt Ver-1.005.04

## Verification

Static security, reliability, legal, landing UX, mobile, Emergency Access, onboarding, push-notification and Ver-1.005.04 feature checks pass.

The supplied source package intentionally does not include `node_modules`; run the normal local `npm run build` after overwriting the project files.
