# My Passwords Ver-0.051 — Monitoring Setup

## Required

1. Apply `db/migrations/2026-08-07_reliability_monitoring_recovery_ver_0_051.sql` in Supabase SQL Editor.
2. Deploy Ver-0.051 so the new scheduled functions in `netlify.toml` are active.
3. Open Admin > Health and run the health checks once.

## Recommended environment variables

### SUPABASE_ACCESS_TOKEN

Server-only Supabase Management API token used by `database-backup-verify` to list managed database backups. Never expose this value in browser code or diagnostics.

### SUPABASE_PROJECT_REF

Optional explicit project reference. If absent, My Passwords derives it from `SUPABASE_URL` when that URL uses the normal `<project-ref>.supabase.co` hostname.

### OPS_ALERT_EMAIL

Optional operational notification recipient. When configured together with the existing Resend settings, unresolved Stripe webhook failures can send a throttled alert containing only operational metadata. The recipient address is not written into `operational_events`.

## Verification

Run locally:

```bat
npm run security:check && npm run reliability:check && npm run build && netlify dev --no-open
```

After deployment, verify Admin > Health shows recent scheduled check runs. Database backup verification may show **Not Configured** until the Supabase Management API token is supplied; that state is intentionally distinguishable from a failed backup check.
