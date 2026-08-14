# Password-Encrypt Ver-1.005.02 — Emergency Package Import Code

## Purpose

Replaces the Ver-1.005 public release-page handoff with a secure Import Code flow that starts from inside the nominee's own Password-Encrypt vault.

## User flow

1. A released Emergency Package continues to open normally from the secure Emergency Access link.
2. If the package was prepared by Ver-1.005.02 or later, the release page displays a 20-character Emergency Package Import Code.
3. A Password-Encrypt nominee opens their own vault and selects Emergency Info → Emergency Access → Import Emergency Package.
4. They enter the code.
5. The server requires an active verified Password-Encrypt session and confirms the signed-in account's verified email matches the nominated trusted-person email.
6. The released package is decrypted locally with the Import Code and imported as a separate Emergency Package — [owner] folder.
7. Released documents are decrypted locally and re-encrypted into the nominee's own Password-Encrypt document storage.

## Security design

- The readable Import Code is never stored in Supabase; only its SHA-256 hash is stored.
- Import-code lookup is rate limited.
- A code cannot be redeemed before release or after the 30-day release window expires.
- The verified Password-Encrypt account email must match the trusted-person nomination email.
- The old public-page → vault route handoff and sessionStorage release-token handoff have been removed.
- New package and released-document encryption uses the Import Code-derived release credential so the server does not need to persist the original secure invite token.
- Older already-frozen release packages remain downloadable but cannot be imported by code unless they were refreshed into the new format before release.

## Database

Run `db/migrations/2026-08-14_emergency_import_code_ver_1_005_02.sql` before deploying this build.

## Version alignment

- App/server: Password-Encrypt Ver-1.005.02
- npm: 1.5.2
- Service worker cache: my-passwords-v1.005.02
