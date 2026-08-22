# Password-Encrypt Ver-1.020 — Small Bug Fixes and User Settings

## Changes

1. Admin permanent customer deletion now uses a Password-Encrypt warning popup instead of browser prompt/confirm dialogs.
2. Removed references to permanent customer deletion being a testing tool/action.
3. Fixed onboarding Step 8 when SMS is deferred before any SMS has been sent. Password-Encrypt now prepares the pending account first, then moves to email verification.
4. Added Settings → User Settings.
5. Secure device unlock password reminder count is configurable from 1–999 opens; default remains 10.
6. Added Never Force Password Again. This disables automatic periodic master-password interruption caused by elapsed days or secure-device open count. It does not remove the master password or disable manual vault locking.
7. Added User Data Format choices using reference date 5 June 2026:
   - 05/06/2026
   - 06/05/2026
   - 05/Jun/2026 (default)
8. User Settings are saved to the authenticated account and cached locally for secure-device checks before the cloud session is refreshed.

## Database

Run `SUPABASE_VER_1.020_USER_SETTINGS.sql` in Supabase SQL Editor before testing User Settings on the live deployment.

## Verification

Static regression suites pass for security, reliability, legal/commercial readiness, landing UX, mobile, onboarding, Emergency Access and push notifications. Ver-1.020 feature checks pass 17/17. Server-side JavaScript syntax checks pass.

The isolated packaging environment could not complete `npm install`, so run the normal local `npm install` and `npm run build` before deployment.
