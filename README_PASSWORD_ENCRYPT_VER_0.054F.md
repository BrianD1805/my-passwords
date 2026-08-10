# Password-Encrypt Ver-0.054F — Trusted Person reminder & UX refinement

Ver-0.054F builds on Ver-0.054E with three focused changes only.

## Changes

1. Trusted Person current-stage blue rail now tapers softly at its top and bottom instead of ending abruptly.
2. Accepted Trusted Persons receive a scheduled reminder every three calendar months while the flow is dormant.
   - A daily Netlify scheduled processor checks which accepted nominations are due; it sends only when three months have elapsed since acceptance or the previous reminder.
   - Reminder subject: `Password-Encrypt Trusted Person reminder — Please confirm`.
   - The reminder contains a secure `Yes, I’m still the trusted person` link.
   - The email link opens a Password-Encrypt confirmation page; the nominee must deliberately confirm on that page. This avoids mail-security scanners confirming automatically.
   - Confirmation is recorded in the Trusted Person event history with date/time.
   - Confirmation does not request Emergency Access and does not reveal vault information.
   - Reminders pause while an Emergency Access request/release is active.
   - Confirmation links are HMAC-signed, expire after 30 days, and older quarterly links cannot confirm a newer reminder.
3. The `Password-Encrypt` heading on the vault login/unlock screen is approximately 5px smaller on desktop only. Mobile sizing is unchanged.

## Database / environment

No Supabase SQL is required.
No new environment variables are required. Ver-0.054F uses the existing production `CUSTOMER_SESSION_SECRET`, Resend configuration and Emergency Access tables.

## Netlify schedule

`trusted-person-reminder-process` runs daily at 07:15 UTC and evaluates each accepted Trusted Person nomination individually. This daily due-check is what allows each person's reminder to be sent exactly three calendar months after their own acceptance/previous reminder rather than on fixed calendar quarters.

## Test

Run:

```bat
npm run security:check && npm run reliability:check && npm run legal:check && npm run ux:check && npm run mobile:check && npm run emergency:check && npm run build && netlify dev --no-open
```

For live reminder testing, do not wait three months. The quarterly scheduler should be tested through a controlled test-only due timestamp/database test if needed; do not alter a production customer's Trusted Person dates merely to force an email.
