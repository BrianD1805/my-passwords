# My Passwords Ver-0.044

## Plan Features and Entitlement Enforcement

This build turns the subscription plan catalogue into server-enforced entitlements.

- Purchased and trial plan limits are captured in an entitlement snapshot so later catalogue edits do not silently remove existing customer features.
- Netlify Functions enforce document availability, document count, actual encrypted document payload storage, Emergency Access and cloud backup/sync.
- Deleting an encrypted document frees its server-side document and storage allowance. Cleanup is queued safely while offline or until a newer vault copy is protected.
- Secure device unlock is enforced in the Vault interface and keeps the master password as the local fallback.
- Maximum users are enforced at the account-creation boundary. Every future member-creation endpoint must use the shared server entitlement capacity check.
- Admin can inspect usage and apply controlled per-customer overrides.
- Personal is the only launch-ready public plan. Family and Business are forced hidden until member accounts and sharing are built.
- Multi-user and sharing flags remain disabled on the server and in Admin.

## Required Supabase migration

Run `db/migrations/2026-08-04_plan_entitlements_enforcement_ver_0_044.sql` before publishing. The migration is additive and does not delete or rewrite encrypted vault data.

## Version alignment

- Visible application: My Passwords Ver-0.044
- npm: 0.0.44
- service worker cache: my-passwords-v0.044
- Netlify Functions: My Passwords Ver-0.044
