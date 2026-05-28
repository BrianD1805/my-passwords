# My Passwords Ver-0.014 — Email OTP Test Delivery

Safe email OTP delivery foundation for the future new-device restore flow.

## What changed
- Added `request-email-otp-test` Netlify Function.
- Added Email OTP action in the locked/new-device panel and unlocked security panel.
- Email OTP uses the stored backup email account identity.
- OTP is still not enforced, so there is no lockout risk.
- If Resend is configured, the OTP is emailed.
- If Resend is not configured, the app safely falls back to showing the OTP on screen.
- Existing screen test OTP remains available as a fallback/dev safety tool.

## Optional Netlify environment variables for real email test delivery
- `RESEND_API_KEY`
- `OTP_EMAIL_FROM`

If either is missing, Ver-0.014 still works in fallback mode and shows the test OTP on screen.

## Safety
- No encryption changes.
- No sync engine changes.
- No Supabase vault snapshot changes.
- No destructive local/cloud changes.
- No OTP enforcement yet.

## SQL
No new SQL is required if Ver-0.013A SQL has already been run.
