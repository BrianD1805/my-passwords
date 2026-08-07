# My Passwords Ver-0.049 — Automated Customer Emails

Ver-0.049 adds customer-facing lifecycle communication and scheduled Emergency Access release processing to the existing single-site SaaS application.

## Customer lifecycle emails

Automated Resend email delivery is wired to account onboarding, trial lifecycle, Stripe billing, account security, verified devices, Admin account suspension, and account deletion.

Covered messages include:
- Welcome / trial started
- Trial ending soon
- Trial expired
- Subscription activated
- Upcoming renewal
- Payment failed
- Payment action required
- Grace period started
- Subscription cancelled
- Cancellation scheduled
- Subscription reactivated
- Plan changed
- Email changed
- Mobile changed
- New device verified
- Account suspended
- Account deletion requested
- Account deletion completed

Email copy is written for customers. Internal database IDs, webhook terminology and vault-sync implementation details are not included in customer email content.

## Delivery reliability

`customer_email_log` provides an idempotent delivery ledger with masked recipient details, delivery state, attempt count and provider reference. Failed deliveries are retried by the scheduled lifecycle processor. A stale delivery left in `sending` state is also eligible for retry after a safety delay.

The lifecycle processor runs hourly in production. Stripe webhooks and direct account actions still send time-sensitive messages immediately; the schedule provides fallback/retry coverage.

## Emergency Access

`emergency-access-release-process` runs every five minutes in production. When a waiting period ends it marks the request release-ready and sends the trusted person the release-ready email without requiring anyone to open My Passwords. The interactive status endpoint can still mark a due request ready, but scheduled processing owns release-ready email delivery to avoid duplicate sends.

## Account deletion

The deletion-request email is sent when deletion is confirmed. The completion email is sent after server-side deletion finishes. If completion delivery fails, the destination is retained only as a server-sealed value long enough to retry; the delivery ledger stores only a masked recipient.

## Security boundary

Automated email functions do not read, decrypt or send vault contents, document contents, master passwords, encryption keys, encrypted vault payloads or encrypted snapshots. Only account and billing metadata required to create the customer message is used.

## Database

Run `db/migrations/2026-08-07_automated_customer_emails_ver_0_049.sql` in Supabase before publishing Ver-0.049.

## Local testing

Use Node 22 and the project-linked Netlify environment:

```bat
npm run build
netlify dev --no-open
```

Open `http://localhost:8888` manually after Netlify Dev reports that it is ready. Netlify scheduled functions do not run automatically on a local schedule; use Netlify's function invocation tools or the production Functions page when specifically testing scheduled runs.
