# My Passwords Ver-0.051B — Supabase Free-Plan Backup Detection Fix

Ver-0.051B is a targeted follow-up to Ver-0.051A. Live testing showed that the Supabase Management API can return backup metadata rows for a Free organization even though managed automatic backups are not included on that plan. Ver-0.051A only treated an empty backup response as unavailable, so the Health dashboard could still show a false failure.

## Fix

- Backup verification now performs a best-effort Management API lookup of the Supabase project and its organization plan.
- When the organization plan is `free`, Database Backup Verification returns `not_available`, `ok: true`, and zero operational issues.
- The previous false `database_backup_verification_failed` operational event is automatically resolved by the next successful health run.
- If project/organization plan metadata cannot be read, verification safely falls back to the backup endpoint response.
- Genuine Management API errors, database reachability failures, stale paid-plan backups and failed backup conditions remain warnings/errors.
- The Ver-0.051A Stripe reconciliation timestamp fix is retained unchanged.

## Database

No SQL changes. Continue using the Ver-0.051 reliability monitoring schema.

## Version alignment

- App/UI/server version: `My Passwords Ver-0.051B`
- npm package version: `0.0.51-b`
- Service-worker cache: `my-passwords-v0.051B`
- Patch folder: `my-passwords-ver-0.051B`
