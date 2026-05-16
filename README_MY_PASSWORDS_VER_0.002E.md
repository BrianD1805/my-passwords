# My Passwords Ver-0.002E — Migration Hash Fix

This patch fixes the Netlify Database deploy failure caused by an already-applied migration file being edited after it had been applied.

## What changed

- Restored `netlify/database/migrations/0001_initial_schema/migration.sql` to the original applied version.
- Bumped visible app/function labels to `My Passwords Ver-0.002E`.
- Bumped package version to `0.2.5`.
- Kept the database runtime diagnostics from Ver-0.002D.

## Important rule

Once a migration has been applied, never edit that migration file again. Any future database change must be added as a new migration folder, for example:

```text
netlify/database/migrations/0002_next_change/migration.sql
```

## Commands

```bat
npm install
npm run build
git status
git add .
git commit -m "My Passwords Ver-0.002E restore applied migration hash"
git push origin main
```
