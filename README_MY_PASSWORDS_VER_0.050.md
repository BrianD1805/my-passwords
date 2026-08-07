# My Passwords Ver-0.050 — Security Hardening

Ver-0.050 is the formal pre-public-launch security hardening pass for the My Passwords single-site SaaS and encrypted vault PWA.

## Security controls added or strengthened

- Atomic server-side OTP, signup and Admin rate limiting with temporary blocking after repeated failures.
- OTP brute-force protection and challenge attempt limits.
- Persistent Admin sessions with server-side revocation and rotation.
- Customer session rotation, per-session revocation, device revocation and account-wide session generation revocation.
- Same-origin request validation, custom request marker and session-bound CSRF tokens for sensitive browser actions.
- Production `__Host-` cookies with `HttpOnly`, `Secure`, `SameSite=Strict`, root path and no Domain attribute.
- Dedicated production session secrets are required; the Supabase service-role key is not accepted as a production session-signing fallback.
- Content Security Policy and supporting HTTP security headers.
- Stripe webhook signature timestamp tolerance plus a dedicated replay ledger.
- Database-backed idempotency for sensitive Stripe customer actions.
- Expanded Admin action failure auditing and persistent Admin session auditing.
- Server-derived tenant/user identity on vault, document, profile, billing and Emergency Access operations.
- Server validation of requested plans; browser-supplied plan/account status is never authoritative.
- Supabase RLS enabled and `anon`/`authenticated` access revoked from server-only customer/security tables and sensitive RPCs.
- Protected tenant-isolation self-test and a local static security boundary check.
- Secret-rotation and security-hardening operating procedures under `docs/`.

## Vault privacy boundary

The Admin and security tooling do not read or decrypt vault contents. Master passwords, decrypted vault fields, encrypted document contents and customer encryption material remain outside Admin access. Server endpoints scope customer data by the validated server session rather than browser-supplied tenant or user identifiers.

## Required database migration

Apply:

`db/migrations/2026-08-07_security_hardening_ver_0_050.sql`

before exercising Ver-0.050 protected actions. The migration is additive and also tightens grants/RLS on existing server-only tables and RPCs.

## Local validation

From the project directory:

```bat
npm run security:check
npm run build
netlify dev --no-open
```

Open `http://localhost:8888` manually after Netlify Dev is ready.

## Dependency review note

The codebase was reviewed against current public security advisories on 7 August 2026. The production app is a static Vite build; the Vite development server is now explicitly bound to `127.0.0.1` to prevent LAN exposure. A normal-registry `npm audit --package-lock-only` should also be run locally because the patch environment cannot reach npm's audit endpoint.
