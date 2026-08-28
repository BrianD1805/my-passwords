# Password-Encrypt Ver-1.024 — Onboarding Verification Reliability

## Purpose
Fix SMS and email onboarding verification getting stuck indefinitely, unreliable Pause/Resume recovery, and technical non-JSON errors surfacing to customers.

## Changes
- Added a hard 15-second timeout to SMS/email OTP verification.
- Added Stop checking while a verification request is active.
- Pause now aborts any live onboarding request and saves a clean retry state.
- Reloaded/persisted `verifying` states are restored as retryable rather than stuck.
- Verification retries are idempotent for the same challenge and same successful code.
- Twilio provider requests now timeout after 8 seconds.
- Resend onboarding OTP delivery now times out after 8 seconds.
- Supabase REST requests now return a controlled timeout error instead of waiting indefinitely.
- Technical non-JSON function responses are converted to a customer-friendly retry message.
- Welcome/Admin notification emails were removed from the critical OTP verification response path.
- Added authenticated `post-verification-notifications` follow-up function; notifications remain idempotent but cannot block onboarding.

## Database
No SQL migration required.

## Version
Password-Encrypt Ver-1.024 / npm 1.24.0 / service-worker cache my-passwords-v1.024.
