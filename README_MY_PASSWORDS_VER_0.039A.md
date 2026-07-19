# My Passwords Ver-0.039A — Founder Plan & GBP Currency Correction

## Changes

- Restores `Brian Private Vault` to the permanent Founder Plan.
- Sets founder status to `Founder Active` and founder role to `Founder`.
- Removes trial dates and payment requirements from the founder account.
- Changes the global subscription currency from ZAR to GBP.
- Locks the Admin Plan Manager currency to GBP (£).
- Uses friendly plan/status labels in My Account and Admin Customers instead of raw database codes.
- Keeps the Admin route inside the same My Passwords Netlify site.

## Data safety

This patch does not delete or recreate tenants, users, encrypted vault snapshots, encrypted documents or Emergency Access records.

## Required SQL

Run `db/migrations/2026-07-19_founder_gbp_currency_fix_ver_0_039A.sql` in Supabase SQL Editor before publishing.

## Build

```bat
npm install
npm run build
npm run netlify:dev
```
