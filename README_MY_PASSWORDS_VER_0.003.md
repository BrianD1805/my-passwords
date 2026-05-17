# My Passwords Ver-0.004 — Supabase Database Layer

## Purpose

This patch switches the cloud database layer from Netlify Database to Supabase while keeping:

- Netlify hosting
- GitHub deploys
- Netlify Functions
- React/Vite PWA shell
- Browser-side encryption
- Encrypted cloud snapshot sync

## Why this patch exists

Netlify Database connected successfully but exposed a read-only database user to the app environment, causing Bootstrap admin to fail with:

```text
permission denied for table tenants
```

Supabase gives us a clearer service-role server write path for this password vault and later SaaS direction.

## What changed

- Version bumped to `My Passwords Ver-0.004`
- Service worker cache bumped to `my-passwords-v0.004`
- Removed Netlify Database/Neon runtime code from app functions
- Added Supabase REST server-side database layer using Netlify Functions
- Added Supabase health check
- Added Supabase admin bootstrap
- Added Supabase encrypted snapshot sync
- Added `db/schema.sql` for Supabase SQL Editor
- Added `docs/SUPABASE_SETUP_VER_0.004.md`
- Moved app messages into the sync panel so errors are visible immediately

## Netlify environment variables needed

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

The service role key must stay server-side only.

## Local testing

```bat
npm install
npm run build
```

## Git deploy

```bat
git status
git add .
git commit -m "My Passwords Ver-0.004 switch database layer to Supabase"
git push origin main
```

## Important cleanup command

Because this project previously used Netlify Database migrations, delete the old migration folder locally before committing:

```bat
rmdir /s /q netlify\database
```

Then commit the deletion.

## Live test URLs

```text
https://brians-password-vault.netlify.app/.netlify/functions/health
https://brians-password-vault.netlify.app/.netlify/functions/db-health
```
