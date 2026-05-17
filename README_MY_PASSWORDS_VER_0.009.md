# My Passwords Ver-0.009 — Auto-pull on unlock and clearer desktop/mobile sync state

This patch builds on the working Supabase encrypted cloud sync from Ver-0.008.

## What changed

- Visible version bumped to **My Passwords Ver-0.009**.
- Service worker cache bumped to `my-passwords-v0.009`.
- Health function mode updated to `auto-pull-on-unlock-with-device-sync-state`.
- Unlock now makes the cloud-check behaviour clearer.
- If this device has tenant/user IDs, unlock checks the latest Supabase encrypted snapshot automatically.
- If the master password decrypts the latest snapshot, the latest cloud vault is restored on this device.
- If the password does not decrypt the cloud snapshot, nothing is overwritten.
- After Bootstrap Admin on a fresh device/PWA, the app now attempts to pull the latest cloud vault using the current master password.
- Added a visible **This device** status card showing whether the device used cloud restore, local fallback, or no cloud snapshot.
- Auto-sync after item changes now shows clearer toast/status feedback.

## Test checklist

1. Run `npm install`.
2. Run `npm run build`.
3. Commit and push:

```bat
git status
git add .
git commit -m "My Passwords Ver-0.009 auto-pull on unlock and device sync state"
git push origin main
```

4. After Netlify publishes, check:

```text
https://brians-password-vault.netlify.app/.netlify/functions/health
```

Expected version: `My Passwords Ver-0.009`.

5. Desktop test: add an item and confirm auto-sync toast/status.
6. Mobile/PWA test: unlock with the same master password and confirm latest cloud vault is pulled or use **Pull latest cloud vault** if needed.

## Notes

Supabase remains the only active database layer. Keep these Netlify environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Do not re-add Netlify Database settings.
