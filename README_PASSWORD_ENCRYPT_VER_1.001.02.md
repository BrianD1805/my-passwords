# Password-Encrypt Ver-1.001.02 — Push Notifications Edits

Release date: 12 August 2026

## Included changes

1. Admin Push broadcast now uses a Password-Encrypt in-app confirmation popup instead of the browser confirm dialog.
2. The broadcast confirmation includes the notification title/text preview and a warning that delivered push notifications cannot be recalled.
3. The customer activation popup now says “Activate push notifications on this device.”
4. The activation explanation is generic to Password-Encrypt account, Admin, security and service messages rather than only Trusted Person Emergency Access.
5. Mobile popup footer buttons now have explicit spacing between “Not now” and “Activate notifications”.
6. Version references are aligned to Password-Encrypt Ver-1.001.02, npm package version 1.1.2 and service-worker cache my-passwords-v1.001.02.

## Database / environment

No new Supabase SQL is required for this patch. Keep the existing Ver-1.001 push tables and existing VAPID keys/environment variables.

## Verification

- Security: 13/13 PASS
- Reliability: 20/20 PASS
- Legal/commercial readiness: 35/35 PASS
- Landing/plan UX: 36/36 PASS
- Mobile restoration: 6/6 PASS
- Trusted Person / Emergency Flow: 64/64 PASS
- Onboarding: 52/52 PASS
- Push Notifications: 32/32 PASS
