# Password-Encrypt Ver-1.013.01 — Firefox Onboarding Resume Fix

## Summary

Ver-1.013.01 fixes onboarding recovery when a mobile browser reloads or recreates the Password-Encrypt tab while the customer leaves the browser to retrieve an OTP.

### Continue setup

- The **Previous setup found** popup now shows **Continue setup** whenever an unfinished onboarding account can be recovered.
- If the normal saved card checkpoint is still available, Continue setup returns to that exact saved verification stage.
- If the browser has lost the tab/session checkpoint but the pending Password-Encrypt account identity is still available, Continue setup reconstructs the safe verification stage rather than forcing the customer to start again.
- A customer whose mobile number was already verified resumes at **Email verification** and can request a fresh email code.
- A customer whose mobile is not yet verified resumes at the **SMS verification** stage.

### Firefox / Android resilience

Password-Encrypt previously relied on `sessionStorage` for the non-secret onboarding checkpoint. That normally survives a regular reload, but Android/Firefox can unload or recreate a background tab when the customer switches to Messages or email.

Ver-1.013.01 now mirrors the non-secret onboarding checkpoint into both:

- `sessionStorage`
- short-lived `localStorage` recovery storage

The recovery copy expires after two hours and is removed when onboarding is completed, cancelled or deliberately cleared.

The stored checkpoint still excludes:

- SMS or email OTP values entered by the customer
- local/test OTP codes
- master password
- master-password confirmation

The OTP challenge identifier and verification-stage metadata may be restored so the customer can continue the same verification screen safely. If only the account identity survives, Password-Encrypt requests a fresh OTP challenge rather than attempting to reuse an unknown code.

### Existing affected customers

A customer already stuck on the old **Previous setup found** screen can install this version and press **Continue setup**. If the mobile number was already verified, Password-Encrypt returns them to the email-verification stage rather than requiring a new account.

## Database / environment

No Supabase SQL is required.

No new Netlify environment variables are required.

## Verification

- Security: 13/13 PASS
- Reliability: 20/20 PASS
- Legal/commercial readiness: 35/35 PASS
- Landing/plan UX: 36/36 PASS
- Mobile regression: 6/6 PASS
- Emergency Access: 75/75 PASS
- Onboarding: 63/63 PASS
- Push notifications: 32/32 PASS
- Ver-1.013.01 Firefox onboarding recovery: 14/14 PASS
- Netlify function JavaScript syntax: PASS

The packaged source excludes `node_modules` and generated build/cache folders. Run `npm run build` locally after overwriting the current project files.
