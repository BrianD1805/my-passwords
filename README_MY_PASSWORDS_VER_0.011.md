# My Passwords Ver-0.011 — Account Login Foundation

## Purpose

This patch adds the first account login foundation while preserving the current local-first encrypted vault behaviour.

The master vault password remains the encryption/decryption key. The account identity is now separated from the master password and is used to identify the correct tenant/user cloud vault.

## What changed

- Added account identity fields for phone/email login foundation.
- Phone number is stored with country code in international SMS-ready format, for example `+254712345678`.
- Added lock-screen account restore panel when no local vault exists on the device.
- Normal returning device remains local-first: enter master password only.
- New/cleared device now collects phone country code, mobile number, backup email and master password before attempting cloud restore.
- Existing Supabase bootstrap function now reuses existing users by `phone_e164` or email where available.
- Added Supabase migration for account login fields.
- OTP sending is not connected yet; this patch prepares the database and UI for the next OTP provider build.

## Security model

- Account identity answers: who is this user and which cloud vault should be fetched?
- Master password answers: can this user decrypt the encrypted vault?
- The master password is not saved.
- Supabase continues to store encrypted snapshots only.
- Phone/email fields are account identity metadata only; vault secrets remain encrypted before upload.

## Supabase SQL required

Before deploying Ver-0.011, run:

`db/migrations/2026-05-19_account_login_foundation_ver_0_011.sql`

in Supabase SQL Editor.

## Local test

```bash
npm install
npm run build
npm run dev
```

## Deploy

```bash
git status
git add .
git commit -m "My Passwords Ver-0.011 account login foundation"
git push origin main
```
