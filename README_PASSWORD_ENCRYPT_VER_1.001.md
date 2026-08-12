# Password-Encrypt Ver-1.001 — Push Notifications

## Build summary

Ver-1.001 adds opt-in Web Push notifications to the Password-Encrypt PWA, with special handling for Trusted Person / Emergency Access owner control and a new Push Notifications area in Admin.

The notification channel carries operational status text only. It does not send vault contents, passwords, card details, document contents, master passwords, OTPs or recovery codes.

## Customer app

- New **Settings → Push Notifications** section.
- Customer must deliberately enable browser/app notification permission on each device.
- Shows whether push is active, blocked, unsupported or not yet configured on the server.
- Push subscriptions are bound to the validated Password-Encrypt tenant, user and verified device.
- A browser subscription is also locally bound to the correct Password-Encrypt account so it cannot silently move to another account using the same browser.
- Explicit session ending or verified-device removal disables the relevant server-side push subscription.
- Notification taps use same-origin Password-Encrypt routes and can open the relevant Settings area after unlock.
- Email notifications remain in place as the parallel/fallback notification channel.

## Trusted Person / Emergency Access owner alerts

Automatic owner push notifications are included for:

1. Trusted Person invitation accepted.
2. Trusted Person invitation declined.
3. Emergency Access request started — high-priority alert with the waiting period and direct link into Trusted Person Access.
4. Emergency package released after the waiting period completes without cancellation.
5. Quarterly Trusted Person reminder confirmed.

The Emergency Access request notification is deliberately prominent because it is the owner's key opportunity to review or cancel an unexpected request.

## Admin — Push Notifications

Admin now has a dedicated **Push Notifications** section with:

- Current active push-enabled device/user/account counts.
- Editable title and body text for each automatic Trusted Person notification.
- Enable/disable control for each automatic notification template.
- One-shot broadcast to all currently active push subscriptions.
- Broadcast target selection for Vault, Push Notification Settings or Trusted Person Access.
- Recent push-delivery history with targeted/delivered/failed/disabled counts.
- Admin audit entries for template edits and broadcasts.

A broadcast can only reach users/devices that have granted notification permission and have an active push subscription.

## Database migration

Run this migration in Supabase before testing push:

`db/migrations/2026-08-12_push_notifications_ver_1_001.sql`

It creates:

- `push_subscriptions`
- `push_notification_templates`
- `push_notification_log`

The tables use RLS with browser roles revoked and explicit `service_role` grants. Push log metadata has a 180-day retention period and is included in the scheduled operational retention cleanup.

## Netlify environment variables

Three variables are required on the existing Password-Encrypt Netlify site:

- `PUSH_VAPID_PUBLIC_KEY`
- `PUSH_VAPID_PRIVATE_KEY`
- `PUSH_VAPID_SUBJECT`

Generate one permanent VAPID key pair from the project folder with:

```text
node scripts/generate-vapid-keys.mjs
```

Set the printed values in Netlify. Keep the private key only in the Netlify environment; never commit it into Git or place it in the app/browser code.

Recommended subject for this project:

```text
PUSH_VAPID_SUBJECT=mailto:info@zippyweb.uk
```

Do not casually replace the VAPID key pair after customers subscribe. Existing browser subscriptions are restricted to the application-server public key used when they were created and would need to subscribe again after a key change.

## Deployment order

1. Run the Ver-1.001 Supabase migration.
2. Generate the VAPID key pair once.
3. Add the three VAPID variables to the Password-Encrypt Netlify environment.
4. Deploy the Ver-1.001 program files.
5. Open the installed PWA, verify the customer device, then enable Push Notifications in Settings.
6. Test Trusted Person acceptance and Emergency Access request alerts on a second device/browser.
7. Open Admin → Push Notifications, edit/save a template and send a small broadcast test.

## Verification

Static/regression verification for this package:

- Security: 13/13 PASS
- Reliability: 20/20 PASS
- Legal/commercial: 35/35 PASS
- Landing/plan UX: 36/36 PASS
- Mobile restoration: 6/6 PASS
- Trusted Person / Emergency Flow: 64/64 PASS
- Onboarding: 52/52 PASS
- Push Notifications: 24/24 PASS
- Modified JavaScript syntax: PASS
- JSX parser checks: PASS

The full Vite production bundle was not run in this isolated package workspace because the uploaded source ZIP does not include `node_modules`; no dependency installation was performed in the build workspace.

## Version alignment

- Customer/Admin display: `Password-Encrypt Ver-1.001`
- Service worker cache: `my-passwords-v1.001`
- npm package version: `1.1.0`
- Supabase/server application version: `Password-Encrypt Ver-1.001`
