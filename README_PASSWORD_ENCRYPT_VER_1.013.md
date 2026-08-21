# Password-Encrypt Ver-1.013 — Onboarding Flow & Admin UX Fixes

## Summary

Ver-1.013 fixes the standard Start Free Trial onboarding path and redesigns the Admin header menu.

### Onboarding / Plan 1

- Generic **Start Free Trial** no longer assumes a hard-coded `personal` database plan code.
- The server now resolves **Plan 1** from the first active, public Personal-plan record in Admin display order.
- A plan deliberately selected from a landing-page plan card is still preserved.
- The obsolete message stating that a plan is unavailable and Personal is the launch plan has been removed from the live flow.
- Plan availability is resolved before signup attempt limits are consumed.
- Ver-1.013 uses a fresh signup-rate-limit namespace so attempts consumed by the broken pre-1.013 CTA path do not keep a tester locked out.
- Old saved onboarding state containing the obsolete plan error is cleaned automatically on resume.

### SMS verification

The screenshots in this build request showed the signup plan validation failing before the SMS function was called. Therefore the failed attempt shown was not a Twilio delivery failure.

Additional hardening:

- Once the pending account is prepared, pressing Send/Resend SMS no longer runs account bootstrap again.
- SMS delivery/rate-limit failures now give clearer messages.
- OTP challenge rate limiting remains enabled; it now reports a retry interval instead of looking like a silent SMS failure.
- Twilio SMS cost controls remain unchanged.

### Admin header

- Header action order is now **Refresh → Logout → Admin menu**.
- Admin menu is aligned to the right.
- Menu opens as an overlay/mega menu and does not increase the header height.
- Mega menu contains only Admin section buttons.
- Menu closes after choosing a section, pressing Escape, or clicking outside the Admin header.
- Header subtitle now reads **Single-site SaaS administration · Ver-1.013**.

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
- Onboarding: 61/61 PASS
- Push notifications: 32/32 PASS
- Ver-1.013 feature checks: 21/21 PASS
- Modified Netlify function syntax: PASS

The packaged source intentionally excludes `node_modules` and generated build/cache folders. Run `npm run build` locally after overwriting the current project files.
