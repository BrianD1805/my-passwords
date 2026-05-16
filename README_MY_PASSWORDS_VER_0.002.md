# My Passwords Ver-0.002 — Database Connection, Admin Bootstrap & Encrypted Sync Foundation

## Patch type

Overwrite patch for your master folder:

```text
C:\01 My Work 2026\My Passwords\My Passwords Program Files
```

Do not copy `node_modules` into GitHub. This patch includes `.gitignore`.

## What changed in Ver-0.002

- Version bumped to `My Passwords Ver-0.002`
- Service worker cache bumped to `my-passwords-v0.002`
- Added Netlify Database health check function
- Added admin/tenant bootstrap function
- Added encrypted vault snapshot sync function
- Added SaaS-ready schema updates
- Added `vault_sync_snapshots` table
- Added browser UI panel for:
  - Check DB
  - Bootstrap admin tenant
  - Sync encrypted vault
- Added migration support from Ver-0.001 local encrypted vault
- Master password still stays in the browser
- Database only receives encrypted vault snapshots

## Local testing commands

Run from the project folder:

```bat
npm install
npm run dev
```

Build test:

```bat
npm run build
```

Function testing needs Netlify Dev:

```bat
npm install -g netlify-cli
netlify dev
```

Then test:

```text
http://localhost:8888/.netlify/functions/health
http://localhost:8888/.netlify/functions/db-health
```

Without a local database environment variable, `db-health` should respond but say the database is not connected yet.

## Netlify Database setup

See:

```text
docs/NETLIFY_DATABASE_SETUP_VER_0.002.md
```

Run the schema from:

```text
db/schema.sql
```

## Git commands

```bat
git status
git add .
git commit -m "My Passwords Ver-0.002 Netlify Database bootstrap and encrypted sync foundation"
git push origin main
```

## Netlify deploy settings

```text
Build command: npm run build
Publish directory: dist
```

## Important security note

This is still an early foundation build. It is suitable for building and testing your private app, but before turning it into a SaaS product we still need authentication, proper user isolation, emergency access rules, rate limiting, backups, export controls, and a proper security review.
