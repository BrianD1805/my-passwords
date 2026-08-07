# My Passwords Ver-0.051C — Resolved Sync-Conflict Checkpoint Fix

Ver-0.051C is a targeted follow-up to Ver-0.051B. Live monitoring showed that an admin-resolved Sync Conflicts operational alert could be recreated by the next health sweep because the sweep re-counted the same historical `backup_conflict_blocked` rows from the previous 24 hours.

## Fix

- A resolved aggregate `vault_sync / sync_conflicts` event now acts as an acknowledgement checkpoint.
- Operations Health only considers `backup_conflict_blocked` rows created after the later of the rolling 24-hour boundary or the most recent admin resolution checkpoint.
- Historical sync-conflict rows remain in `vault_sync_events` and resolved operational events for audit/history.
- Re-running health checks after resolving an old conflict no longer reopens the same warning.
- A genuinely new sync conflict occurring after the resolution checkpoint opens a new warning normally.
- Repeated health checks while the same aggregate sync warning is open no longer inflate its operational-event occurrence count merely because the check ran again.
- Existing Ver-0.051A Stripe timestamp reconciliation and Ver-0.051B Supabase Free-plan backup handling are retained unchanged.

## Database

No SQL changes. Continue using the Ver-0.051 reliability monitoring schema.

## Version alignment

- App/UI/server version: `My Passwords Ver-0.051C`
- npm package version: `0.0.51-c`
- Service-worker cache: `my-passwords-v0.051C`
- Patch folder: `my-passwords-ver-0.051C`
