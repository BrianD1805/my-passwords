# My Passwords Ver-0.039F

## Cross-device vault sync reliability fix

This patch fixes the case where a password saved on one device remained visible only on that device.

### What changed

- Secure device unlock now checks for newer encrypted cloud changes before opening the local vault.
- Standard master-password unlock and secure device unlock now use the same cloud freshness check.
- The app compares the local encrypted vault timestamp with the latest cloud snapshot before restoring.
- A newer cloud snapshot is restored automatically on unlock.
- A newer local encrypted copy is protected from being overwritten by an older cloud snapshot.
- When a local copy is newer, the app attempts to back it up automatically after unlock.
- Successful automatic backups now mark the local envelope with the matching cloud snapshot ID.
- Saving or editing an item now confirms **saved and backed up securely** only after the cloud request succeeds.
- If backup fails or the secure session needs verification, the app clearly states that the change was saved only on that device.
- Delete, favourite and other silent item changes now surface a warning when cloud backup does not complete.
- Existing encrypted vault data, snapshots, documents, tenant IDs and account records are preserved.

## Build

Expected package build version: `my-passwords@0.0.39-f`.

## SQL

No Supabase SQL changes are required for Ver-0.039F.
