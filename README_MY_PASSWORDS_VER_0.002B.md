# My Passwords Ver-0.002D — Netlify Database Helper & Migration Fix

This patch fixes the Netlify Database connection method after Netlify CLI reported:

```text
Netlify Database is enabled for this project
The @netlify/database package is not installed
Migrations directory: netlify/database/migrations
```

## What changed

- Added `@netlify/database` to dependencies.
- Updated Netlify Functions to use Netlify's official database helper.
- Kept the older manual connection-string fallback for safety.
- Added the first migration at `netlify/database/migrations/0001_initial_schema/migration.sql`.
- Bumped visible app/function version to `My Passwords Ver-0.002D`.
- Bumped service worker cache to `my-passwords-v0.002D`.
- Kept the existing local vault storage keys so your local Ver-0.002 vault data is not thrown away.

## Overwrite instructions

Copy the contents of this patch into:

```text
C:\01 My Work 2026\My Passwords\My Passwords Program Files
```

Choose replace/overwrite when asked.

## Local test commands

```bat
npm install
npm run build
```

Optional function test:

```bat
netlify dev
```

Then open:

```text
http://localhost:8888/.netlify/functions/health
http://localhost:8888/.netlify/functions/db-health
```

## Git commands

```bat
git status
git add .
git commit -m "My Passwords Ver-0.002D use Netlify Database helper and migration"
git push origin main
```

## After Netlify publishes

Test:

```text
https://brians-password-vault.netlify.app/.netlify/functions/health
https://brians-password-vault.netlify.app/.netlify/functions/db-health
```

Expected DB health result after migration/deploy:

```json
{
  "ok": true,
  "connected": true,
  "app": "My Passwords",
  "version": "My Passwords Ver-0.002D",
  "database_driver": "@netlify/database"
}
```

## Why this patch exists

Netlify Database is enabled on the project, but the previous Ver-0.002 function looked for a visible `NETLIFY_DATABASE_URL` or `DATABASE_URL`. The current Netlify Database workflow prefers `@netlify/database`, which automatically resolves the correct production or deploy-preview database branch.
