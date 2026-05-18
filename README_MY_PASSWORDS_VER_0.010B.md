# My Passwords Ver-0.010B — Netlify/npm deploy speed housekeeping

This patch makes no app feature changes. It keeps the Ver-0.010 edit flow and Ver-0.010A app-style in-field controls intact.

## What changed

- Added `.npmrc` to reduce unnecessary npm work during Netlify installs:
  - `audit=false`
  - `fund=false`
  - `progress=false`
  - `prefer-offline=true`
- Added matching Netlify `NPM_FLAGS` in `netlify.toml`.
- Pinned previously `latest` dependencies to the versions already present in `package-lock.json`:
  - `react` 19.2.6
  - `react-dom` 19.2.6
  - `lucide-react` 1.16.0
- Left the build command as `npm run build`, because the actual Vite build is already fast.
- Confirmed there are no active old Netlify Database runtime packages in `package.json`.
- Bumped visible app/function version to `My Passwords Ver-0.010B`.
- Bumped service worker cache to `my-passwords-v0.010B`.

## Why this patch exists

The latest Netlify log showed the real app build completed in under two seconds, while npm package installation took several minutes. This patch aims to make dependency installs more cache-friendly and more stable without touching vault behaviour or the encrypted sync engine.

## Local test

```bash
npm install
npm run build
npm run dev
```

## Deploy

```bash
git status
git add .
git commit -m "My Passwords Ver-0.010B Netlify npm deploy speed housekeeping"
git push origin main
```

## SQL

No Supabase SQL changes are required.
