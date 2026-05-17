# My Passwords Ver-0.002G — Bootstrap Admin Fix

This patch fixes the admin bootstrap function returning HTTP 500 after the database connection was confirmed.

## Fixes

- Awaits the shared database connection helper in `bootstrap-admin.js`.
- Awaits the shared database connection helper in `sync-vault.js`.
- Improves the app message after clicking **Bootstrap admin** so errors are shown on screen instead of failing silently.
- Bumps visible version labels to **My Passwords Ver-0.002G**.
- Keeps the applied migration file unchanged.

## Local test

```bat
npm install
npm run build
```

## Deploy

```bat
git status
git add .
git commit -m "My Passwords Ver-0.002G fix admin bootstrap database call"
git push origin main
```

After Netlify publishes, test:

```text
https://brians-password-vault.netlify.app/.netlify/functions/health
https://brians-password-vault.netlify.app/.netlify/functions/db-health
```

Then open the live app, enter the admin email, and click **Bootstrap admin**.
