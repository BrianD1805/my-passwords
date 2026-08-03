# My Passwords Ver-0.042L

## Offline Save Without Device Verification

Ver-0.042L corrects the offline save flow so a vault change is encrypted and saved locally before any cloud-session check is considered.

### Changes

- Saving a password or other vault change while offline no longer opens the Verify this device popup.
- The encrypted local vault is written immediately and Vault Safety is marked as backup pending.
- The first offline save in the current app session opens a clear `Saved offline` confirmation.
- Further offline saves use a compact `Saved offline. Backup pending.` toast instead of repeatedly interrupting the user.
- When connectivity returns, the existing safe automatic retry flow checks the verified session and attempts the pending encrypted backup.
- Device verification is requested only when the device is online and the secure backup genuinely cannot continue because the session has expired.
- Conflict protection remains unchanged: different local and cloud changes still require an explicit choice.

### Database

No Supabase SQL is required.
