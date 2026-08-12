# Password-Encrypt Ver-1.001.01 — Push Notifications Edits

## Changes

1. Password-Encrypt automatically checks push-notification status on each fresh app opening once the customer session is verified and the vault is unlocked. If push is available/configured but not active on the current device, a customer-facing activation popup is shown once for that app opening.
2. Admin automatic push notification types are now selected from one dropdown. Only the selected notification editor is shown.
3. The Broadcast / Send to all enabled users panel is positioned above the automatic notification editor.
4. Automatic-notification Save remains grey/disabled until the selected template differs from the last server-loaded value. The broadcast Send button also remains disabled until required message fields are entered.

## Push permission behavior

Browser/PWA security rules still require a deliberate customer action before notification permission can be requested. Password-Encrypt therefore checks automatically and prompts automatically, but the customer must tap Activate notifications. If browser/app notification permission is blocked, the popup directs the customer to review Push Notifications settings instead of repeatedly requesting permission.

## Database

No new Supabase SQL is required for Ver-1.001.01. It uses the Ver-1.001 push-notification tables and templates unchanged.

## Environment

No new environment variables are required. Keep the existing Ver-1.001 values:

- PUSH_VAPID_PUBLIC_KEY
- PUSH_VAPID_PRIVATE_KEY
- PUSH_VAPID_SUBJECT

## Version alignment

- Customer/Admin display: Password-Encrypt Ver-1.001.01
- Server application version: Password-Encrypt Ver-1.001.01
- Service worker cache: my-passwords-v1.001.01
- npm package version: 1.1.1
