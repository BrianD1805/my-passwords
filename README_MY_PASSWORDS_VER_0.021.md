# My Passwords Ver-0.021 — SaaS landing page and first-time account onboarding foundation

This patch starts the SaaS setup without disturbing the existing live vault.

## Added

- Public SaaS-style landing panel on the locked screen.
- Clear first-time setup guide: account details, email OTP, master password, first encrypted vault.
- Founder/private tenant plan foundation in local account metadata.
- Settings/Vault Info SaaS account card showing account, plan, status and role.
- Additive Supabase migration for tenant/account plan fields.

## Safety notes

- Existing encrypted local vault data is not cleared or migrated.
- Existing cloud snapshots and document blobs are not changed.
- The master password remains browser-only and is not stored.
- Supabase is still accessed only through Netlify Functions with the service role key.

## SQL

Run `db/migrations/2026-06-01_saas_account_foundation_ver_0_021.sql` in Supabase SQL Editor before or alongside deployment.
