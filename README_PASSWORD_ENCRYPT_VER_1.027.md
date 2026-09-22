# Password-Encrypt Ver-1.027

## Controlled cloud-backup retries

- Replaces the indefinite 2.6-second retry loop with three automatic retries spaced at 30 seconds, 2 minutes and 10 minutes.
- Stops after the third automatic retry and leaves the vault clearly marked as needing attention.
- Keeps **Back up changes now** available for an immediate manual attempt.
- Starts a fresh bounded retry sequence immediately after a genuine offline-to-online transition.
- Prevents changes to transient syncing state or the in-memory item list from re-arming the retry timer.

## Failure reporting and server protection

- Sends the client-side `backup_failed` diagnostic only once for each failed backup state, rather than once per retry.
- Adds separate authenticated server limits for vault backup writes, sync diagnostics and recovery-history maintenance.
- Adds a defensive authenticated server limit to `client-error-report`.
- These server controls protect Supabase work after a function starts; the bounded client policy is the primary invocation-count fix.

## Regression coverage

- Adds a deterministic retry-policy test that simulates 10,000 continuous failures and proves only three automatic retry requests are scheduled.
- Checks reconnect behaviour, retry eligibility, diagnostic deduplication, timer dependencies, manual recovery and both server throttles.
- Existing security, reliability, legal, mobile, onboarding, push, Emergency Access and feature checks remain available.

## Deployment notes

- No Supabase SQL migration is required. Ver-1.027 reuses the existing `consume_security_rate_limit` RPC.
- Onboarding flow logic is unchanged.

## Version alignment

- App: Password-Encrypt Ver-1.027
- package.json/package-lock.json: 1.27.0
- Service worker cache: my-passwords-v1.027
- Server APP_VERSION: Password-Encrypt Ver-1.027
