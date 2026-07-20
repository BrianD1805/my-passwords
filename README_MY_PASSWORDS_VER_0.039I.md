# My Passwords Ver-0.039I

## Verification Loop, False Conflict & Popup Spacing Fix

Ver-0.039I corrects the issues found during Ver-0.039H Vault Safety testing.

### Completed

- **Fix now** starts email OTP verification directly instead of returning to the same warning.
- The verification popup **Verify this device** button starts the OTP flow directly.
- Successful OTP verification automatically retries any pending vault backup.
- A successful verification-and-backup flow confirms that the latest changes are protected.
- Only one backup request can run from the app at a time, preventing automatic retry from racing the original save.
- Identical encrypted retry requests reuse the existing secure snapshot rather than producing a false two-device conflict.
- A genuine different encrypted vault copy still opens the conflict-protection flow and is never replaced automatically.
- Conflict and verification popup footers now have comfortable button spacing and outer padding.
- Buttons stack with clear spacing on narrow mobile screens.
- The persistent Vault Safety banner and **Fix now** button have increased internal and outer spacing.

### Database

Run:

`db/migrations/2026-07-20_false_conflict_idempotent_save_ver_0_039I.sql`

This safely updates the existing atomic snapshot-save function so a duplicate request containing the exact same encrypted envelope is treated as the same backup rather than a conflict. It does not alter or delete existing encrypted snapshots.

### Version alignment

- App: My Passwords Ver-0.039I
- npm: 0.0.39-i
- service-worker cache: my-passwords-v0.039I
- folder: my-passwords-ver-0.039I
