# Password-Encrypt Ver-0.055a — Onboarding Flow Refinements

This patch refines the new-tenant onboarding journey while preserving the existing-customer-only Open My Vault route introduced in Ver-0.055.

## Changes

1. Every Create Account internal stage resets the popup body to the top when opened.
2. SMS verification UI is hidden while SMS delivery is not live. Email verification remains available; SMS implementation code is retained for later activation.
3. Removed the customer-facing “A welcome email has been sent.” notice.
4. New customers now use a dedicated Step 2 of 2 vault-setup screen after account creation instead of the normal existing-customer vault screen.
5. The onboarding journey is explicitly explained as two parts: Step 1 — Set up account; Step 2 — Set up vault.
6. The generic no-local-vault screen no longer offers Create Vault; new customers are sent back to the landing-page onboarding flow.
7. Admin/customer verification UI no longer treats unavailable SMS/mobile verification as an outstanding visible verification task.

## Database / environment

No Supabase SQL changes.
No new Netlify environment variables.

## Version alignment

- App/server: Password-Encrypt Ver-0.055a
- package.json: 0.0.55-a
- service worker cache: my-passwords-v0.055a
