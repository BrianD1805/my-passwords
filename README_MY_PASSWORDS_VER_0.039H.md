# My Passwords Ver-0.039H

## Vault Sync Safety and Backup UX

Ver-0.039H replaces the previous technical backup, restore, Tools and Stats experience with a client-facing Vault Safety flow.

### User-facing changes

- Adds a persistent Vault Safety status control in the vault header.
- Adds a persistent warning banner whenever changes exist only on the current device.
- Shows a full readable popup when a local save succeeds but secure backup fails.
- Gives the user clear actions to retry backup or verify the device.
- Automatically retries a pending backup after connectivity or device verification returns.
- Adds a dedicated Settings > Vault Safety section.
- Removes the separate Tools and Stats sections from the normal user navigation.
- Moves recovery controls into a collapsed Advanced recovery tools area.
- Rewrites account verification wording without technical tenant/session language.
- Warns before ending device verification, clearing the local vault, checking another copy or manually locking while backup is pending.

### Conflict protection

Vault comparison now uses the cloud snapshot lineage stored in the encrypted local envelope instead of relying only on timestamps.

- A clean local copy may safely update from a newer cloud snapshot.
- Local changes based on the latest cloud snapshot are backed up rather than overwritten.
- If both the device and cloud changed from different snapshots, the app stops and shows a conflict popup.
- The user must explicitly choose Keep this device or Use secure backup.
- Nothing is replaced automatically during a true conflict.

### Single-site Admin

The existing `/admin` route now includes Sync Health. It shows encrypted operational metadata only:

- latest successful backup date
- encrypted item count
- latest sync event status
- backup failures and conflict events

Admin cannot read vault contents or master passwords.

## Required Supabase migration

Run:

`db/migrations/2026-07-20_vault_sync_safety_events_ver_0_039H.sql`

This creates `public.vault_sync_events` for Admin operational diagnostics. It is additive and does not alter encrypted vault data.

## Version alignment

- App: My Passwords Ver-0.039H
- npm: 0.0.39-h
- service-worker cache: my-passwords-v0.039H
- folder: my-passwords-ver-0.039H

### Database-level stale-device guard

Ver-0.039H also adds an atomic Supabase save function. Every normal backup must be based on the current latest snapshot. If another device has already saved a newer copy, the stale upload is rejected and the app opens the conflict flow instead of silently making the older device copy the newest backup. An explicit Keep this device choice is required to override that protection.
