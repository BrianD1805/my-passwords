# SMS Provider Setup — My Passwords Ver-0.047

## Recommended setup: Twilio Verify

1. Sign in to Twilio Console.
2. Open Verify and create a Verify Service named `My Passwords`.
3. Keep the code length at six digits and the expiry at the provider default used by the application flow.
4. Copy the Verify Service SID beginning with `VA`.
5. In Netlify, open the My Passwords project environment variables.
6. Add these values with Functions scope:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_VERIFY_SERVICE_SID`
7. Leave `SMS_TEST_MODE` unset in production.
8. Redeploy the site after saving the variables.

## Optional direct Messaging fallback

When a Verify Service is not configured, the app can use Twilio Programmable Messaging when one of these is present:

- `TWILIO_MESSAGING_SERVICE_SID`, or
- `TWILIO_FROM_NUMBER`

The Verify Service takes priority whenever `TWILIO_VERIFY_SERVICE_SID` is present.

## Local testing choices

### Test real SMS locally

Run Netlify Dev with the Twilio environment variables available. Do not set `SMS_TEST_MODE`.

### Prevent real SMS locally

Set:

`SMS_TEST_MODE=true`

The app will show a local test code and will not call Twilio for SMS delivery.

## Production checks

- Open `/.netlify/functions/health` and confirm SMS is configured.
- Verify a new signup by SMS.
- Verify a second browser/device by SMS.
- Change the mobile number and verify the new number.
- Sign out, use account recovery, choose Mobile and restore the account session.
- Confirm the encrypted vault still requires the correct master password.
- Check `public.sms_delivery_log` for masked delivery records.
