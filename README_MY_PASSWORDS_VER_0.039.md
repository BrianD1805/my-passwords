# My Passwords Ver-0.039 — SaaS Authentication, Tenant Isolation & Admin Foundation

## Delivered

- Added signed HttpOnly customer sessions after successful OTP verification.
- Cloud vault snapshots and encrypted document files now derive tenant and user identity from the secure session instead of browser-submitted IDs.
- Owner-side Emergency Access actions now require the authenticated customer session.
- Existing tenant IDs, user IDs, encrypted vault snapshots, document blobs and Emergency Access records are preserved.
- New account records remain pending until OTP verification activates the account and trial foundation.
- Customers can no longer edit their own plan or subscription status in Settings.
- Added a protected `/admin` route inside the same React app and same Netlify site.
- Added editable subscription plan management for Personal, Family and Business plans.
- Published active plans now feed the public landing-page plan cards and Create Account plan selection.
- Added masked customer overview and activate/suspend account controls.
- Added subscription plan, tenant subscription and billing event database foundations.
- Added OTP request throttling and stopped exposing live production OTP codes.

## Required Netlify environment variables

Existing variables remain required. Add or verify:

- `ADMIN_ACCESS_KEY`
- `ADMIN_SESSION_SECRET`
- `CUSTOMER_SESSION_SECRET`

`ADMIN_SESSION_SECRET` and `CUSTOMER_SESSION_SECRET` should be long random secret values. The app can fall back to the Supabase service-role key for signing, but dedicated secrets are recommended.

## Required Supabase migration

Run:

`db/migrations/2026-07-18_saas_auth_admin_subscription_foundation_ver_0_039.sql`

This migration is additive and does not delete encrypted vault or account data.

## Important first login after deployment

Each existing device must verify the account by email OTP once to establish the new secure session. The local encrypted vault can still be opened with the master password, but cloud backup, cloud restore, encrypted document storage and owner Emergency Access controls require the secure session.
