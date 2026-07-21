# My Passwords Ver-0.041

## Production Onboarding & Trial Lifecycle

Ver-0.041 completes the pre-payment SaaS onboarding and trial lifecycle foundation while preserving the existing one-site Netlify architecture and all encrypted vault data.

### Customer onboarding

- Published Admin plans feed the public Create Account flow.
- Account details and the selected plan are validated server-side.
- Existing email/mobile records are detected before a second account is created.
- Conflicting email and mobile matches are stopped with a clear support message.
- New tenant and owner-user records remain pending until email OTP succeeds.
- The customer deliberately requests the OTP from the onboarding popup.
- Successful verification activates the account, starts the plan-defined trial, issues the secure HttpOnly session and completes onboarding.
- A welcome email is sent after first activation when Resend is configured.
- No payment is taken in this build.

### Trial lifecycle

- Trial start and end dates are stored on the tenant and tenant subscription.
- Trial events are written to the billing event ledger.
- My Account displays trial start, end and remaining days.
- Expired trials retain the local encrypted vault but lose cloud backup, syncing and encrypted document storage until Admin activates or extends the account.
- Founder access remains permanent and exempt from normal trial enforcement.

### Single-site Admin

The existing `/admin` route now shows:

- Pending signups
- Active and expired trial totals
- Trial start and end dates per customer
- Remaining days
- Onboarding completion status
- Start trial
- Extend trial by a chosen number of days
- Activate account using an Admin override
- Cancel trial
- Suspend or remove suspension

The Admin remains inside the same React build, repository and Netlify site.

### Database migration

Run:

`db/migrations/2026-07-21_production_onboarding_trial_lifecycle_ver_0_041.sql`

This is an additive migration. It does not delete tenants, users, encrypted vault snapshots, document blobs or Emergency Access records.

### Build

Expected package build:

`my-passwords@0.0.41`
