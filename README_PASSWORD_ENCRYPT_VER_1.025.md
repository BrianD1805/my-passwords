# Password-Encrypt Ver-1.025

## Secure Device Unlock reliability

- Adds a 20-second hard timeout to Secure Device Unlock instead of allowing an indefinite browser/device wait.
- Adds `Cancel and use password` while the device security prompt is active.
- Cancelling aborts the active Credentials API request and returns the customer to normal master-password access.
- Checks the protected local Secure Device key before invoking the device prompt; if the key is missing, the customer is told to use the master password and set Secure Device Unlock up again.
- Adds a 4-second timeout to the protected local key-store check.
- After successful device verification, the status changes to `Opening your vault` so a later cloud check is not presented as an ongoing fingerprint/PIN/passkey check.
- Adds an 8-second maximum to the secure cloud freshness check. Offline, timed-out, or temporarily unavailable cloud checks no longer prevent a valid encrypted local vault from opening.
- Bounds non-essential sync telemetry to 3 seconds so diagnostics cannot hold vault access open.
- Applies the same cancellation/timeout protection to Secure Device Unlock setup.

## Operational health email reliability

- The scheduled operational health monitor now retries once before sending the owner a failure email.
- A one-off transient monitoring failure no longer sends the `operational health check failed` alert.
- If the retry also fails, the email states that the check failed twice and includes only a sanitised diagnostic code plus the existing Admin > Health guidance.
- No vault contents, passwords, recovery data, tokens, customer email addresses, or decrypted data are included in the alert.

## Scope protection

- Ver-1.024.02 onboarding flow/state logic is unchanged.
- No Supabase SQL migration is required.

## Version alignment

- App: Password-Encrypt Ver-1.025
- package.json/package-lock.json: 1.25.0
- Service worker cache: my-passwords-v1.025
- Server APP_VERSION: Password-Encrypt Ver-1.025
