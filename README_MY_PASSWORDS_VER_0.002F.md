# My Passwords Ver-0.002G — Netlify Vite executable fallback

This patch fixes the repeated Netlify build error:

```text
sh: 1: vite: not found
```

Netlify was installing dependencies and detecting Vite, but the shell could not find the `vite` executable when running `npm run build`.

## What changed

- Visible version bumped to `My Passwords Ver-0.002G`.
- Package version bumped to `0.2.6`.
- Service worker cache bumped to `my-passwords-v0.002G`.
- Build script changed from:

```json
"build": "vite build"
```

to:

```json
"build": "node ./node_modules/vite/bin/vite.js build"
```

This avoids relying on Netlify's `.bin` executable path and calls Vite directly through Node.

## Local test

```bat
npm install
npm run build
```

## Git deploy

```bat
git status
git add .
git commit -m "My Passwords Ver-0.002G fix Netlify Vite build executable"
git push origin main
```

## After deploy

Test:

```text
https://brians-password-vault.netlify.app/.netlify/functions/health
https://brians-password-vault.netlify.app/.netlify/functions/db-health
```
