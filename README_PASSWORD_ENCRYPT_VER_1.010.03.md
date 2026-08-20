# Password-Encrypt Ver-1.010.03 — Onboarding SMS Verification Guard

Fixes onboarding SMS verification so the flow cannot silently progress into email verification before the mobile OTP has been explicitly approved.

- WebOTP/browser OTP support may fill the SMS code, but does not auto-submit it.
- The customer must tap **Verify mobile number** on the SMS code card.
- Email OTP request is blocked server-side for a pending new signup until `phone_verified` is true.
- Final email verification is also blocked server-side unless the mobile was verified first.
- Restored onboarding checkpoints cannot skip an unverified SMS stage.
- Primary onboarding SMS requests are bound to the matching signup email + mobile number.
- No database migration or new environment variables are required.
