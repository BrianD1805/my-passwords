# My Passwords Ver-0.051 — Reliability, Monitoring and Recovery

Ver-0.051 adds operational visibility and controlled recovery tooling on top of the completed Ver-0.050 security hardening. The vault privacy boundary is unchanged: operational monitoring and support diagnostics contain metadata only and never read or return passwords, decrypted vault values, encrypted vault payloads, document contents, master passwords, OTPs, recovery codes, cookies, session tokens or provider secrets.

## Added in this build

- Metadata-only operational event ledger with severity, resolution and retention.
- Broad server-function 5xx monitoring plus explicit scheduled/critical processor failure recording.
- Stripe webhook failure alerts in Admin Health, with optional Resend alert email via `OPS_ALERT_EMAIL`.
- Resend delivery failure tracking for automated customer emails and Emergency Access release-ready emails.
- Vault cloud-backup failure and blocked sync-conflict monitoring.
- Scheduled account/trial state checks every 30 minutes.
- Scheduled Emergency Access monitoring integrated with check-run history; the existing 5-minute release processor remains in place.
- Scheduled operations-health check every 15 minutes.
- Daily Supabase database-backup verification, when the Management API token is configured.
- Daily retention cleanup for operational history only.
- Admin > Health dashboard with service status, recent alerts, scheduled checks and recovery controls.
- Safe Stripe reconciliation: preview first; a 10-minute server-side preview must still match the same linked subscription before apply. Apply only refreshes My Passwords billing metadata from Stripe.
- Safe customer support diagnostics from Admin > Customers > customer detail. Reports contain metadata only and mask customer contact details.
- Sanitised authenticated-browser error reporting without exception messages or stack traces.
- Recovery operating procedure under `docs/RECOVERY_PROCEDURES_VER_0.051.md`.
- Reliability static test: `npm run reliability:check`.

## Required Supabase migration

Apply this migration before testing Ver-0.051:

`db/migrations/2026-08-07_reliability_monitoring_recovery_ver_0_051.sql`

It creates three server-only tables:

- `operational_events`
- `scheduled_check_runs`
- `stripe_reconciliation_runs`

All three have RLS enabled, browser roles revoked and explicit `service_role` CRUD grants.

## Netlify environment variables

Existing Ver-0.050 variables remain required.

Recommended for Ver-0.051:

- `SUPABASE_ACCESS_TOKEN` — server-only Supabase Management API access token used only to verify managed database backups.
- `SUPABASE_PROJECT_REF` — optional; if omitted, the app derives the project reference from `SUPABASE_URL`.
- `OPS_ALERT_EMAIL` — optional operations recipient for Stripe webhook failure alert emails. The address is used for delivery and is not written into operational-event metadata.

`SUPABASE_ACCESS_TOKEN` must never be exposed to the browser. Give the token only the Supabase Management API access needed for database backup visibility.

## Schedules

- Emergency Access release: every 5 minutes (existing)
- Customer lifecycle email processor: hourly (existing)
- Account/trial health check: every 30 minutes
- Operations health: every 15 minutes
- Account deletion processor: daily (existing)
- Operational history retention cleanup: daily at 04:10 UTC
- Database backup verification: daily at 05:30 UTC

Netlify scheduled functions run according to UTC cron schedules.

## Retention rules

Operational events are assigned retention at creation:

- Info: 30 days
- Warning: 90 days
- Error: 180 days
- Critical: 365 days
- Scheduled check history: 180 days
- Stripe reconciliation records: 365 days

The cleanup function does not delete vault snapshots, vault items, encrypted documents, account data, subscriptions or normal billing history.

## Local validation

From the existing project directory:

```bat
npm run security:check && npm run reliability:check && npm run build && netlify dev --no-open
```

Open `http://localhost:8888` manually after Netlify Dev is ready.

## Production validation

After deployment, sign into Admin and open **Health**. Run **Run health checks now** once. Confirm the scheduled check history appears, then verify Database Backup status. If the backup status is `Not Configured`, add the Supabase Management API token before relying on automated backup verification.

See `docs/RECOVERY_PROCEDURES_VER_0.051.md` for recovery decisions and safe Stripe/support procedures.
