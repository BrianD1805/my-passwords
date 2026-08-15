# Password-Encrypt Ver-1.007.02 — Admin verification status restore

## Scope

This patch restores customer contact verification information to Admin after the SMS/mobile verification rollout.

## Admin → Customers

Customer cards now show separate status pills for:

- Email verified / Email not verified
- Mobile verified / Mobile not verified
- No mobile when the account has no mobile number

The existing account-status pill remains in the same status column.

## Admin → Customer detail

The Verification summary now reports both email and mobile verification state.

Profile and verification now labels the stored mobile number as Verified or Not verified rather than only On file.

## Data and security

No database migration is required. Admin already receives `email_verified` and `phone_verified` from the existing server-side Admin endpoints. This patch only restores those existing states to the Admin presentation.

## Version alignment

- App/server: Password-Encrypt Ver-1.007.02
- npm: 1.7.2
- service-worker cache: my-passwords-v1.007.02

## Verification

Static regression suites pass, including 33/33 Ver-1.007.02 SMS/Admin verification checks. Netlify function JavaScript syntax checks also pass.
