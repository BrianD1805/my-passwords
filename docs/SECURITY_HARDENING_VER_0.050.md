# My Passwords Ver-0.050 — Security Hardening Review

## Security boundaries

- Customer identity is derived from the signed, server-validated, revocable account session. Browser-supplied `tenant_id` and `user_id` are not used as authority for customer vault, document, profile, billing or Emergency Access owner operations.
- Plan and account status are reloaded from Supabase on the server before entitlements or lifecycle access are granted.
- The master vault password and readable vault contents remain client-side. Admin and server operations do not decrypt vault records.
- Production cookies use `__Host-` names, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, no Domain attribute and bounded expiry. Production session signing requires the dedicated `CUSTOMER_SESSION_SECRET` / `ADMIN_SESSION_SECRET`; the Supabase service-role credential is not accepted as a production signing fallback.

## Authentication and abuse controls

- OTP requests are limited by source IP and destination.
- OTP verification is limited by source IP and challenge, in addition to the existing five-wrong-code challenge lock.
- Account recovery has separate request and verification limits.
- Admin login is limited to five attempts per 15-minute window, followed by a 30-minute block.
- Admin access-key comparison is constant-time.
- Customer account sessions are server-side, revocable, generation checked and rotated after 24 hours.
- Admin sessions are server-side, revocable, expire after 8 hours and rotate after 2 hours.

## CSRF and origin protection

- Sensitive browser mutations require an approved production Origin, `x-mp-request: 1` and a CSRF token tied to the current server-side session.
- Account logout, security changes, vault sync writes, document upload/delete, Emergency Access owner mutations, Stripe checkout/subscription/portal actions and Admin mutations use this guard.
- Public token/OTP endpoints require an approved Origin and custom request marker, plus dedicated brute-force/rate limits.
- Stripe webhook traffic is not subject to browser CSRF; it is authenticated using Stripe's signature and timestamp verification.

## Stripe replay and idempotency

- Stripe signatures retain the existing five-minute timestamp tolerance.
- The server-only `claim_stripe_webhook_event` RPC takes a transaction advisory lock per Stripe Event ID and atomically claims `stripe_webhook_events` before processing, recording processing/success/failure state.
- Duplicate or concurrently replayed Event IDs are acknowledged without repeating lifecycle processing.
- Customer checkout/subscription mutation request IDs are claimed in `security_idempotency_keys` before the Stripe operation.
- Existing Stripe provider customer/subscription IDs take precedence over tenant metadata when reconciling an existing subscription, and mismatched mappings are rejected.

## HTTP/browser hardening

Production responses now include a restrictive Content Security Policy, HSTS, frame denial, MIME sniffing protection, referrer restrictions, browser feature restrictions and cross-origin isolation headers appropriate to this single-origin PWA.

Inline executable JavaScript was removed from `index.html` so CSP can use `script-src 'self'`. Inline CSS remains temporarily permitted because existing React components use style attributes.

## Supabase access review

The Ver-0.050 migration:

- enables RLS on the sensitive application tables;
- revokes table access from `PUBLIC`, `anon` and `authenticated` browser roles;
- retains server-only access for `service_role`;
- revokes browser/public execution of the vault-save, rate-limit and Stripe replay-claim RPCs;
- makes the atomic vault-save RPC service-role only;
- keeps the new rate-limit, idempotency, Admin-session and webhook-replay tables server-only.

The service role bypasses RLS by design and must never be sent to the browser.

## Tenant isolation verification

`npm run security:check` statically checks the server identity boundary and sensitive endpoint scoping.

The protected `/.netlify/functions/security-self-test` endpoint performs a non-decrypting two-tenant database isolation probe for:

- vault snapshots and vault item IDs;
- encrypted document record IDs;
- Emergency Access invitation/request IDs;
- subscription and billing event IDs;
- account profile/user IDs.

It returns only pass/fail state and never returns encrypted payloads, document contents or customer secrets.

## Dependency review — 7 August 2026

The package lock was reviewed and the project remains pinned to React 19.2.6 / React DOM 19.2.6, Lucide React 1.16.0 and Vite 5.4.21.

- The 2026 React Server Components advisories affecting earlier 19.2.x server-component packages were patched by 19.2.6. My Passwords is also a client-rendered Vite application and does not use React Server Components.
- Vite 5.4.21 fixed earlier 5.x Windows dev-server file-deny issues, but a later 2026 Vite dev-server advisory includes older Vite branches under specific network-exposure conditions. My Passwords does not expose Vite with `--host`; Ver-0.050 adds an explicit `127.0.0.1` Vite/preview bind to keep local development off the LAN.
- The sandbox npm registry proxy does not implement npm's audit endpoint, so `npm audit --package-lock-only` could not complete in the patch environment. Run it locally against the normal npm registry as part of deployment verification.

This dependency review does not replace continuing automated vulnerability monitoring.
