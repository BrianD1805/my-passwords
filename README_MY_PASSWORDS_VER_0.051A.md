# My Passwords Ver-0.051A — Monitoring & Stripe Reconciliation Fixes

Ver-0.051A is a targeted follow-up to the live-tested Ver-0.051 reliability build. It changes only the two issues found during production testing.

## Fix 1 — Supabase Free-plan backup monitoring

- A successful Supabase Management API response with no managed backup capability is now reported as `Not Available`, not `Failed`.
- This state records zero operational issues and does not make overall Operations Health show a warning/error.
- The previous database-backup failure event is automatically resolved on the next successful check when the project is in this unavailable state.
- The verifier also recognises Supabase physical-backup metadata via `latest_physical_backup_date_unix`, so paid projects using physical backups can still verify freshness.
- Genuine API errors, unreachable data access, stale backups, and returned backup rows without a completed backup continue to surface as failures/warnings.

Supabase currently documents automatic managed backups for Pro, Team and Enterprise plans; Free projects should maintain a separate manual/off-site database backup until the project is upgraded.

## Fix 2 — Stripe reconciliation timestamp comparison

- `CurrentPeriodEnd` is now compared as a parsed timestamp instant rather than a raw string.
- Equivalent values such as `2026-09-03T08:31:00+00:00` and `2026-09-03T08:31:00.000Z` no longer appear as a false difference.
- The existing preview-first safety, 10-minute expiry and same-linked-subscription protections are unchanged.
- Apply still only refreshes local My Passwords billing metadata from the existing linked Stripe subscription; it cannot create, cancel, upgrade, downgrade or charge a subscription.

## Database changes

None. **Do not run new SQL for Ver-0.051A.** The Ver-0.051 reliability migration already installed remains the required schema.

## Version alignment

- App/UI/server version: `My Passwords Ver-0.051A`
- npm package version: `0.0.51-a`
- Service-worker cache: `my-passwords-v0.051A`
- Patch folder: `my-passwords-ver-0.051A`

## Local validation

From the existing project directory:

```bat
npm run security:check && npm run reliability:check && npm run build && netlify dev --no-open
```

## Live retest

1. Admin > Health > **Run health checks now**.
2. Confirm Database Backup Verification shows **Not Available** and does not add an operational issue on the Supabase Free plan.
3. Confirm overall Operations Health returns to **Healthy** if there are no other alerts.
4. Admin > Health > Stripe reconciliation > choose the existing Stripe customer > **Preview reconciliation**.
5. Confirm the previously identical CurrentPeriodEnd values no longer produce a difference.
6. If the preview reports `0 differences`, do not use Apply; no reconciliation is needed.
