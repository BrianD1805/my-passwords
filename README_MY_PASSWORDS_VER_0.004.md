# My Passwords Ver-0.004 — Encrypted Vault Sync Test and Supabase Cleanup

## What changed

- Bumped visible app/function version to `My Passwords Ver-0.004`.
- Added clearer encrypted sync status inside the app.
- The sync panel now shows syncing, success, warning and error states.
- After uploading an encrypted vault snapshot, the app immediately checks Supabase for the latest snapshot and reports the snapshot ID and item count.
- The database health response is now Supabase-only and no longer reports the old Netlify Database environment variable.
- Added `CLEANUP_NETLIFY_DATABASE_VER_0.004.bat` to remove the old `netlify/database` migration folder from the local project if it still exists.

## Important

The old Netlify Database variable `NETLIFY_DATABASE_URL` may still exist in Netlify Environment Variables. It is no longer used by the app after Ver-0.004.

After this patch is stable, remove `NETLIFY_DATABASE_URL` from Netlify to avoid confusion. Keep these two variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Local test

```bat
CLEANUP_NETLIFY_DATABASE_VER_0.004.bat
npm install
npm run build
```

The Lucide `use client` messages are warnings only.

## Git deploy

```bat
git status
git add .
git commit -m "My Passwords Ver-0.004 encrypted Supabase sync status and cleanup"
git push origin main
```

## Live tests after Netlify publishes

Health:

```text
https://brians-password-vault.netlify.app/.netlify/functions/health
```

Database health:

```text
https://brians-password-vault.netlify.app/.netlify/functions/db-health
```

Expected:

```json
{
  "ok": true,
  "connected": true,
  "schema_ready": true,
  "version": "My Passwords Ver-0.004"
}
```

Then open the app, unlock the vault and click:

```text
Sync encrypted vault
```

Expected visible status:

```text
Encrypted vault synced and verified in Supabase.
```
