# Password-Encrypt Ver-1.010 — Onboarding Card Flow

## Scope

Ver-1.010 rebuilds new-customer onboarding as a dedicated full-page card flow. It replaces the old multi-field onboarding popup and keeps each setup action focused on its own screen.

## 13-step onboarding

1. Name
2. Email address
3. Vault name
4. Choose plan
5. Review and accept Terms / Privacy
6. Enter mobile number
7. Request SMS OTP
8. Enter SMS OTP
9. Request email OTP
10. Enter email OTP
11. Create master password
12. Confirm master password
13. Install Password-Encrypt (or deliberately continue in browser)

SMS verification is the first contact check for a new account. It verifies the registered mobile number but deliberately does not activate the account or trial. Email verification is the second contact check and is the point at which the pending account is activated and the configured free trial begins. Master-password creation follows only after both contact checks succeed.

Existing activated customers discovered during signup are routed back to existing-vault verification and never fall through to new-vault creation.

## Card UX

- Dedicated onboarding screen; no landing page visible behind it.
- Compact progress bar at the top.
- Desktop card targets about half the viewport width.
- Mobile card uses most of the available viewport.
- Safe data-entry cards support left-swipe advancement on mobile as well as Next.
- OTP and destructive/security-sensitive stages never auto-advance by swipe.
- A Pause action preserves the non-secret onboarding checkpoint.

## Refresh / app-switch resilience

The public onboarding checkpoint is saved in session storage for up to two hours so a user can leave the browser to read an SMS/email and return without losing the current card. The saved checkpoint contains non-secret account draft and challenge metadata only.

The following are intentionally never persisted in onboarding recovery state:

- entered OTP values
- local test OTP values
- master password
- master-password confirmation

Pending signup records can also be resumed safely server-side rather than being mistaken for an already-active account.

## OTP AutoFill

Both SMS and email OTP fields expose `autocomplete="one-time-code"` so supported operating systems/browsers can suggest verification codes.

For SMS, Password-Encrypt also uses WebOTP where supported. The WebOTP listener is armed before the SMS request is sent to reduce the chance of racing a very fast message. A six-digit code filled by WebOTP/AutoFill is submitted automatically.

The Netlify Permissions-Policy explicitly allows same-origin `otp-credentials`.

The Twilio Verify integration supports the optional environment variable:

`TWILIO_VERIFY_TEMPLATE_SID`

If an approved Twilio Verify template is configured with the domain-bound WebOTP format for `password-encrypt.com`, this SID can be added in Netlify to improve supported-browser SMS WebOTP behaviour. The build does not require this variable to operate normally.

Email OTP cannot be read directly from an arbitrary mailbox by the Password-Encrypt website. Password-Encrypt instead uses the browser/OS one-time-code AutoFill capability where available, and the onboarding card remains safely recoverable if the user has to switch to their email app manually.

## SMS cost control

Production onboarding SMS requests use the existing Twilio Verify integration and have an application-level limit of two onboarding SMS sends per ten minutes, in addition to provider-side protections.

## Install and push notifications

The install experience is the final onboarding card. Where the browser exposes a native PWA install prompt, Password-Encrypt uses it. A clear Continue in browser fallback remains available when native install cannot be invoked.

Push notification activation is deliberately excluded from onboarding. Finishing the install/continue step stores a per-device next-open marker and suppresses the push prompt in the current document. The normal push activation prompt becomes eligible on the next vault opening.

## Database / environment changes

No Supabase migration is required for Ver-1.010.

No new mandatory Netlify environment variable is required.

Optional for domain-bound Twilio Verify WebOTP:

`TWILIO_VERIFY_TEMPLATE_SID`

Existing Twilio variables remain unchanged.

## Version alignment

- App: Password-Encrypt Ver-1.010
- npm: 1.10.0
- Service-worker cache: my-passwords-v1.010
- Server APP_VERSION: Password-Encrypt Ver-1.010
- Offline page: Password-Encrypt Ver-1.010
