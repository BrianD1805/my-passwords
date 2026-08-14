# Password-Encrypt Ver-1.004 — Maintained Emergency Package Release

## Purpose
Ver-1.004 prevents a Trusted Person Emergency Package from becoming stale months after it was first prepared.

## Behaviour
- The prepared Emergency Package is automatically refreshed from the owner's unlocked vault while the Trusted Person arrangement is active.
- Refresh is scheduled after vault changes, when the vault is opened online, when connectivity returns, and when newer cloud vault data is restored.
- New, edited and deleted included items are reflected in the prepared package.
- Full-vault document copies are refreshed only when the source document changed; unchanged documents are not unnecessarily re-encrypted and re-uploaded.
- The server still never receives the vault master password or plaintext vault contents for background package generation.
- If the owner is offline, the app marks package refresh as pending and retries when the vault is online and unlocked.
- When the Emergency Access waiting period completes, the current prepared package is frozen as the release snapshot. Later vault changes are not silently shared with the Trusted Person.
- Server-side guards block changes to the package envelope and prepared document copies after release.

## Owner UI
Trusted Person Planning → Step 2 now shows package freshness status:
- Prepared package stays up to date automatically
- Updating prepared package
- Package refresh pending
- Released package snapshot is fixed

## Database / environment
No new Supabase SQL is required.
No new Netlify environment variables are required.
Existing VAPID keys remain unchanged.

## Version alignment
- App: Password-Encrypt Ver-1.004
- npm: 1.4.0
- Service worker cache: my-passwords-v1.004
- Server APP_VERSION: Password-Encrypt Ver-1.004
