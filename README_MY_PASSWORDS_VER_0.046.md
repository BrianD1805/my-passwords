# My Passwords Ver-0.046 — Account, Session and Device Management

This roadmap build adds a complete customer account lifecycle while preserving the existing encrypted-vault model.

## Account and contact management

- Change the verified email address using a one-time code sent to the new address.
- Change the verified mobile number using an SMS one-time code.
- Use verified email or mobile details to sign in on a new device or recover account access.
- Recovery restores the customer account, subscription and verified-device session only.
- The master password remains unrecoverable and cannot be reset, revealed or used by the server to decrypt a vault.

## Sessions and verified devices

- Each verified browser/device receives a tracked server-side account session.
- Sessions expire after 30 days and renew securely when fewer than 7 days remain.
- The app refreshes session status when opened, brought back into focus, reconnected and periodically while active.
- Customers can view verified devices, last-use information and active-session counts.
- A lost or old verified device can be removed, ending all account sessions on that device.
- Customers can end the current session or end all account sessions.
- Existing signed sessions are upgraded to the new tracked-session model after the migration is applied.

Removing an account device does not remotely erase a local encrypted vault already stored on that device.

## Personal information and deletion lifecycle

- Customers can download a JSON export of account, subscription, verified-device, session, Emergency Access and account-activity information.
- The export contains only encrypted-vault metadata, not decrypted vault contents or the master password.
- Account deletion requires verification through the account's verified email address.
- A 14-day safety waiting period begins after confirmation.
- Customers can cancel deletion at any point before processing completes.
- A Netlify Scheduled Function checks due deletion requests daily and permanently removes the tenant and cascading encrypted cloud data only after the waiting period.
- For paid Stripe accounts, subscription cancellation must succeed before account deletion proceeds.

## Database migration

Run this migration in Supabase before deploying the application:

`db/migrations/2026-08-05_account_session_device_management_ver_0_046.sql`

The migration is additive. It does not alter or delete existing encrypted vault snapshots, document blobs, subscriptions or Emergency Access records.

## Required environment variables

Existing email verification and recovery uses:

- `RESEND_API_KEY`
- `OTP_EMAIL_FROM`
- `CUSTOMER_SESSION_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Production SMS verification additionally requires:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`

During Netlify local development, an SMS test code is returned in the app when SMS delivery is not configured. Production does not expose test codes.

## Deployment order

1. Run the Ver-0.046 Supabase migration.
2. Add the Twilio environment variables before testing production mobile verification, or test email-based flows first.
3. Deploy Ver-0.046.
4. Verify email change, mobile change, new-device sign-in/recovery, device removal, session ending, export and deletion cancellation.
