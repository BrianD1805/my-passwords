# My Passwords Ver-0.050 — Secret Rotation Procedure

This procedure is for a planned rotation or a suspected credential exposure. Never paste production secrets into tickets, source control, screenshots, chat logs, or browser code.

## General order

1. Create the replacement secret at the provider where possible.
2. Update the matching Netlify environment variable for the My Passwords production project.
3. Redeploy production.
4. Test the relevant health/function path without printing the secret.
5. Revoke the old secret at the provider.
6. Record the rotation date, reason, operator and verification result in the private operational log.

For suspected compromise, revoke first when the risk of continued access is greater than a short outage.

## Customer session secret — `CUSTOMER_SESSION_SECRET`

- Generate a new cryptographically random value of at least 32 bytes.
- Update Netlify and redeploy.
- Rotating this value invalidates all signed customer cookies and any still-pending short-lived OTP hashes derived from the customer security secret.
- If compromise is suspected, also revoke all active rows in `account_sessions` and increment each affected user's `session_generation` so server-side sessions cannot be reused.
- Customers will need to verify their devices again.
- Before a planned rotation, check for completed account-deletion records still waiting to send their final confirmation email; their temporarily sealed retry recipient is also protected using the customer session secret and cannot be reopened after rotation.

## Admin session secret — `ADMIN_SESSION_SECRET`

- Generate a new cryptographically random value of at least 32 bytes.
- Update Netlify and redeploy.
- Mark every active row in `admin_sessions` as revoked.
- Confirm Admin requires a new login and creates a new server-side session.

## Admin access key — `ADMIN_ACCESS_KEY`

- Replace with a long randomly generated value unrelated to any customer password.
- Update Netlify and redeploy.
- Revoke all active `admin_sessions` after rotation.
- Confirm the old access key is rejected and the new key works.

## Supabase service role — `SUPABASE_SERVICE_ROLE_KEY`

- Rotate the service-role credential from Supabase using the provider's current key-management procedure.
- Update Netlify immediately and redeploy.
- Verify `db-health`, public plans, customer session status, Admin and encrypted backup metadata operations.
- Never place the service role key in Vite/browser environment variables.

## Stripe

### `STRIPE_SECRET_KEY`
- Roll the Stripe secret key in Stripe Dashboard.
- Update Netlify and redeploy before revoking the old key when Stripe supports an overlap window.
- Test a read-only subscription refresh and a controlled test checkout.

### `STRIPE_WEBHOOK_SECRET`
- Rotate the signing secret on the production webhook endpoint.
- Update `STRIPE_WEBHOOK_SECRET` in Netlify and redeploy.
- Confirm a new signed event is accepted and an invalid signature is rejected.
- Do not disable the Ver-0.050 webhook replay ledger during rotation.

## Resend — `RESEND_API_KEY`

- Create a replacement API key with only the permissions required by My Passwords.
- Update Netlify, redeploy and send a safe Admin test email.
- Revoke the old key after successful verification.

## Twilio

### `TWILIO_AUTH_TOKEN`
- Rotate through Twilio's supported credential process.
- Update Netlify and redeploy.
- Verify SMS health and a controlled OTP send to an approved test number.

### Other Twilio identifiers
`TWILIO_ACCOUNT_SID` and `TWILIO_VERIFY_SERVICE_SID` are identifiers rather than authentication secrets, but changes must still be controlled and tested because they determine which account/service receives traffic.

## After any security incident

- Revoke affected sessions.
- Review `audit_log`, `admin_sessions`, `account_sessions`, `stripe_webhook_events`, security rate-limit activity and provider logs.
- Rotate all secrets that may have been exposed, not only the first credential discovered.
- Confirm the Supabase service role and all provider secrets exist only in Netlify/server-side runtime configuration.
