# My Passwords Ver-0.007 — cloud-first encrypted vault sync

This patch moves the app from manual snapshot testing toward the expected cloud-first behaviour.

## What changed

- Visible version bumped to `My Passwords Ver-0.007`.
- Health function mode changed to `cloud-first-encrypted-vault-sync`.
- On unlock, the app now checks for the latest encrypted Supabase snapshot when tenant/user IDs exist on the device.
- If the supplied master password decrypts the cloud snapshot, the latest cloud vault is restored to the device.
- If the supplied master password does not decrypt the cloud snapshot, the device vault is not overwritten.
- Add item now saves locally, encrypts, and requests automatic Supabase sync.
- Delete item now saves locally, encrypts, and requests automatic Supabase sync.
- Favourite toggle now saves locally, encrypts, and requests automatic Supabase sync.
- Added a visible `Pull latest cloud vault` button for manual restore/checks.
- Renamed the manual cloud button to `Push encrypted vault` so upload and restore are clearer.

## Important behaviour

The database still never receives readable passwords. The browser encrypts the vault first, then Supabase stores encrypted snapshots.

For a new device/PWA:

1. Bootstrap admin so the device has the tenant/user IDs.
2. Unlock using the same master password.
3. The app checks the latest Supabase snapshot and restores it if the password decrypts it.

If the wrong password is entered, the cloud snapshot cannot decrypt and nothing is saved locally.

## Local test

```bat
npm install
npm run build
npm run dev
```

## Git deploy

```bat
git status
git add .
git commit -m "My Passwords Ver-0.007 cloud-first encrypted vault sync"
git push origin main
```

## Live tests after Netlify publishes

```text
https://brians-password-vault.netlify.app/.netlify/functions/health
```

Expected version:

```text
My Passwords Ver-0.007
```

Then test:

1. Add a vault item on desktop.
2. Confirm the sync card reports auto-sync success.
3. Open the PWA/mobile.
4. Bootstrap admin if that device does not yet have tenant/user IDs.
5. Unlock with the same master password.
6. Confirm the latest cloud vault restores to that device.
