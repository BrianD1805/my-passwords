# Password-Encrypt Ver-1.004.01 — Emergency Package UX & Minor Fixes

This is a full overwrite build based on Ver-1.004.

## Changes

1. Trusted Person stage saves no longer leave the page anchored below the next stage. The completed editor closes and the next stage remains visible without the save toast shifting the page.
2. Push activation reminder now offers **Decide later**, **Don't show again**, and **Activate notifications**. The permanent dismissal is stored locally per Password-Encrypt account and device.
3. The redundant Email selector has been removed from the Verify this device popup. Email-code details remain visible.
4. The Trusted Person Step 2 flow was checked: it does not directly trigger device verification. Verification is requested only if the existing customer session is no longer valid or cloud backup requires re-verification.
5. The trusted-person nomination page now includes a short About Password-Encrypt section and a landing-page link below the FAQs.
6. The Emergency Access link email remains transactional in wording; Gmail may still categorise it independently. No email copy was changed in this patch.
7. Admin customer status badges now occupy one fixed, left-aligned status column so the rows line up neatly.

## Version alignment

- App: Password-Encrypt Ver-1.004.01
- npm: 1.4.1
- Service worker cache: my-passwords-v1.004.01
- Server APP_VERSION: Password-Encrypt Ver-1.004.01

## Database / environment

No Supabase SQL changes. No Netlify environment-variable changes. Keep the existing VAPID keys.
