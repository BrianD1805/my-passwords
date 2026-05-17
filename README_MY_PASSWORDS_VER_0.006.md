# My Passwords Ver-0.006 — safer PWA unlock and repeat-safe Bootstrap Admin

## Purpose

This patch fixes two issues found during live/PWA testing:

1. **Bootstrap Admin repeat-click/PWA error**
   - Previous bootstrap logic could try to upsert an existing tenant with a new generated ID.
   - Supabase correctly blocked that because existing `users` rows already referenced the old tenant ID.
   - Ver-0.006 makes Bootstrap Admin repeat-safe: it now reuses the existing tenant/user IDs and refreshes the local browser profile instead of trying to replace the tenant ID.

2. **Wrong password on mobile/PWA creating a bad local vault**
   - Previous logic automatically created a new local encrypted vault when no local vault existed on that browser/device.
   - On a new PWA install, typing the wrong intended password could create a new local vault with that wrong password.
   - Ver-0.006 now requires confirmed password entry before creating a new local vault.
   - Wrong unlock attempts no longer create a new vault.
   - A clear local vault button is available on the lock screen for device-only reset.

## Important security note

The master password is still not sent to Netlify or Supabase. It is used only in the browser to encrypt/decrypt the local vault.

## Local test

```bat
npm install
npm run build
npm run dev
```

## Deploy

```bat
git status
git add .
git commit -m "My Passwords Ver-0.006 safer PWA unlock and repeat-safe bootstrap"
git push origin main
```

## Live tests after Netlify publishes

1. Open:

```text
https://brians-password-vault.netlify.app/.netlify/functions/health
```

Expected version:

```text
My Passwords Ver-0.006
```

2. Open the PWA or browser app.
3. On a fresh device/browser, confirm that creating a local vault requires two matching password entries.
4. Click Bootstrap Admin again. It should reuse the existing Supabase tenant/user and save IDs locally without foreign key errors.
5. Sync encrypted vault and confirm the sync status still verifies successfully.
