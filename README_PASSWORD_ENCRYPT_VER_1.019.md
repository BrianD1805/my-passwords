# Password-Encrypt Ver-1.019 — Settings Cleanup UX

## Build summary

Ver-1.019 cleans up Vault Safety / Recovery Tools and standardises visible progress feedback for manual vault checks.

### Vault Safety / Recovery Tools

- Corrected spacing and internal padding in Recovery Tools on desktop and mobile.
- Recovery history no longer presents the raw total as “X backups found”.
- The useful status now reports the newest encrypted backup only, for example: `Your latest secured cloud backup contains 63 item(s) from 22/Aug/2026, 11:52.`
- Recovery-point retention is capped at the newest 30 encrypted vault snapshots per account.
- Existing accounts with more than 30 recovery points are trimmed when Recovery Points is checked; future successful backups also run the same retention cleanup.
- A failed retention cleanup never converts an otherwise successful encrypted vault backup into a failed backup.

### Action progress UX

Manual check actions now use one consistent Password-Encrypt popup with an animated working icon, a completion/error state and an OK button:

- Check recovery points
- Check and back up now
- Check for changes from another device
- Vault Status → Check now

These actions suppress duplicate intermediate notifications and emit only one completion toast for the action.

### Database

No Supabase SQL migration is required for Ver-1.019. The existing `service_role` permissions for `vault_sync_snapshots` already include delete access, which the server-side retention cleanup uses.

### Version alignment

- Customer app: Password-Encrypt Ver-1.019
- Admin fallback: Ver-1.019
- Netlify/server version: Password-Encrypt Ver-1.019
- Service worker cache: my-passwords-v1.019
- npm package version: 1.19.0
