# Password-Encrypt Ver-1.007 — SMS Integration: Mobile Number Verification

First staged activation of the existing Twilio Verify integration after Twilio account approval.

- Enables real SMS verification for My Account → Contact details & recovery → Mobile number.
- Shows Verification required / Verified mobile number.
- Keeps SMS signup, device verification and account recovery UI disabled until the mobile-number path is proven live.
- Verifying the existing saved number no longer revokes other sessions or disables push subscriptions.
- A genuine number change still ends other sessions for safety.
- Uses existing Twilio Verify V2 integration and sms_delivery_log.

No new Supabase SQL is required.
No new Netlify variables are required if TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID are already configured.
SMS_TEST_MODE must remain unset in production.

Expected `/.netlify/functions/health` result: `sms.configured: true`, `sms.providerMode: twilio_verify`.

Version alignment: app Ver-1.007; npm 1.7.0; service worker my-passwords-v1.007; server Ver-1.007.
