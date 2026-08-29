# Password-Encrypt Ver-1.024.01 — Onboarding State Regression Fix

Fixes a Ver-1.024 regression where a newly verified contact channel could cause an unfinished new-account onboarding session to be treated as an existing customer.

- SMS request remains on Step 7 until the SMS code is explicitly verified or SMS is explicitly deferred.
- OTP challenges carry an explicit new-signup vs existing-account onboarding mode.
- Contact verification no longer means onboarding is complete.
- A new signup remains `master_password_setup_required` after contact verification until the encrypted vault is actually created.
- Pause/resume or browser reload cannot convert an unfinished new signup into the existing-vault route.
- Vault creation calls an authenticated onboarding completion endpoint and only then marks server onboarding complete.
- Ver-1.024 verification timeouts, safe retries and non-JSON-response handling are retained.

No Supabase SQL is required; existing user/tenant onboarding columns are used.
