# My Passwords Ver-0.012 — Safe Cloud Restore and Account Recovery Wording

This patch is intentionally cautious because the app is now being used with live real passwords.

## What changed

- Added clearer safe-restore wording when no local vault exists on a device.
- Added a Vault Security and Recovery information card inside the unlocked app.
- Clarified the difference between:
  - Local encrypted vault on this device
  - Encrypted Supabase cloud snapshot
  - Phone/email account identity
  - Master vault password
- Renamed the manual cloud action to Safe restore from cloud.
- Added a confirmation before manually pulling/restoring a cloud snapshot.
- Improved warning messages so the user knows when nothing was overwritten or created.
- Masked phone/email display in the account status card.
- Bumped version to My Passwords Ver-0.012.
- Bumped service worker cache to my-passwords-v0.012.

## What did not change

- No Supabase SQL changes.
- No encryption changes.
- No sync engine rewrite.
- No destructive local/cloud data change.
- No OTP provider yet.

## Important safety note

A cloud snapshot should only replace the local vault after it decrypts successfully with the current master password. If decryption fails, the local vault is left untouched.
