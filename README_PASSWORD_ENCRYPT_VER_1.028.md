# Password-Encrypt Ver-1.028

## Secure-device refresh fix

- Fixes the Vault Status control remaining on **Saving...** after a new laptop or browser is successfully verified as a secure device.
- The spinning status now reflects only a backup request that is actively running in the current page.
- Transient `backing-up` state is no longer saved as a durable browser status.
- Any old saved `backing-up` state is recovered as **Backup pending**, keeping Vault Status usable without requiring a hard refresh.

## Bounded request recovery

- Adds a 30-second hard timeout to the encrypted vault backup request.
- Adds a 15-second hard timeout to backup-history refresh requests.
- A slow or interrupted response now clears the spinner and leaves a truthful attention state so the customer can safely check again.
- Existing matching-backup reuse makes a retry safe if the server completed after the browser stopped waiting.

## Regression coverage

- Tests stale-state recovery, live-only spinner behaviour, absence of newly persisted transient states, backup/history timeouts, and balanced syncing cleanup.
- Ver-1.027 bounded automatic retries, diagnostic deduplication and server throttling remain unchanged.

## Deployment notes

- No Supabase SQL migration is required.
- Onboarding and secure-device registration behaviour are unchanged; this release corrects the status shown after completion.

## Version alignment

- App: Password-Encrypt Ver-1.028
- package.json/package-lock.json: 1.28.0
- Service worker cache: my-passwords-v1.028
- Server APP_VERSION: Password-Encrypt Ver-1.028
