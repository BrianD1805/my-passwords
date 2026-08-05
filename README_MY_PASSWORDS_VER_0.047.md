# My Passwords Ver-0.047 — SMS Integration

This roadmap build activates production SMS one-time-code delivery across the customer account lifecycle while preserving email verification and the separate, unrecoverable master-password model.

## Live SMS verification

SMS verification is now available for:

- New account verification during signup.
- New-device verification for secure backup and syncing.
- Account and subscription recovery using a verified mobile number.
- Verifying or changing the account mobile number.
- Resending a device-verification code by SMS.

Email remains available as an alternative verification channel.

## Provider design

The app prefers Twilio Verify when `TWILIO_VERIFY_SERVICE_SID` is configured. Twilio Verify creates and checks the SMS code through the provider service.

A direct Twilio Messaging fallback is supported when either `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM_NUMBER` is configured instead. In that mode, My Passwords generates the six-digit code, stores only its secure hash and sends the short-lived code through Twilio Messaging.

Production never returns an SMS code to the browser. Local test codes are available only when Netlify Dev is running without working SMS delivery, or when `SMS_TEST_MODE=true` is explicitly set.

## Security and abuse controls

- SMS codes expire after 10 minutes.
- A challenge is locked after five incorrect attempts.
- Code requests are rate-limited per user, purpose and destination.
- Twilio Verify remains the recommended provider mode because it adds provider-side verification controls.
- SMS delivery metadata is recorded without storing an unmasked destination in the delivery log.
- Account recovery restores account and subscription access only.
- The master password cannot be recovered, reset, revealed or used by the server to decrypt a vault.

## Database migration

Run this migration in Supabase before deploying:

`db/migrations/2026-08-05_sms_integration_ver_0_047.sql`

The migration adds `public.sms_delivery_log` for future delivery diagnostics and Admin Customer Operations. It does not alter or delete encrypted vault data.

## Recommended Twilio Verify environment variables

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`

Optional:

- `TWILIO_VERIFY_LOCALE` — defaults to `en`
- `SMS_TEST_MODE=true` — forces local test codes and prevents live SMS delivery during deliberate local testing

## Twilio Messaging fallback environment variables

Use the account SID and auth token above, plus one of:

- `TWILIO_MESSAGING_SERVICE_SID`
- `TWILIO_FROM_NUMBER`

Twilio Verify is preferred. The Messaging fallback exists for accounts that already have a sender configured but have not yet created a Verify Service.

## Deployment order

1. Run the Ver-0.047 Supabase migration.
2. Create or select a Twilio Verify Service.
3. Add the three recommended Twilio environment variables in Netlify with Functions scope.
4. Leave `SMS_TEST_MODE` unset in production.
5. Deploy Ver-0.047.
6. Test signup, device verification, mobile-number change and account recovery with a real phone number.
7. Confirm `/.netlify/functions/health` reports `sms.configured: true` and `providerMode: twilio_verify`.
