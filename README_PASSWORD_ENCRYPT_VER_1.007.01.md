# Password-Encrypt Ver-1.007.01 — SMS onboarding fallback and verified mobile changes

## Scope

This build keeps email OTP as the normal onboarding verification method and uses paid SMS only as a controlled backup.

### Onboarding verification

- The first verification method is email OTP.
- The customer can request a second email OTP.
- After two onboarding email-code requests for the same account within 10 minutes, the UI offers **Use SMS backup**.
- The server independently checks the same two-email-attempt rule before it will create an onboarding SMS OTP.
- Onboarding SMS fallback is limited separately to reduce accidental/abusive Twilio spend.
- Successful SMS fallback verifies the saved mobile number.
- SMS verification does not falsely mark the email address as verified.
- A first-time account can continue after successful SMS backup verification; the email remains awaiting verification until it is verified separately.

### My Account mobile verification/change

The Ver-1.007 **Verify / Change mobile number** feature remains enabled.

- Verifying the existing saved number marks that number verified.
- Entering a replacement number creates only a pending contact-change record first.
- The account's saved mobile number is not changed until the OTP sent to the replacement number is successfully verified.
- A completed actual number change ends other account sessions for safety.
- Simply verifying the existing number does not end other sessions.

## Cost control

Routine device verification, account recovery and the normal authentication flow remain email-first. `SMS_AUTH_VERIFICATION_UI_ENABLED` remains false; SMS is exposed for the onboarding fallback and My Account mobile-number verification/change only.

## Database / configuration

No new Supabase SQL is required.

No new Netlify environment variables are required. Continue using the existing Twilio Verify variables:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`

## Version alignment

- App/server: Password-Encrypt Ver-1.007.01
- npm: 1.7.1
- service-worker cache: my-passwords-v1.007.01
