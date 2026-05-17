# My Passwords Ver-0.002G — Version labels and database runtime diagnostics

This patch is an overwrite patch for the existing My Passwords project.

## What changed

- Bumped visible app/function version labels to `My Passwords Ver-0.002G`.
- Bumped service worker cache to `my-passwords-v0.002G`.
- Pinned Vite and React plugin dependencies for stable Netlify builds.
- Reworked `/.netlify/functions/db-health` so it gives detailed runtime diagnostics:
  - whether `@netlify/database` imports successfully
  - whether `getDatabase()` is available
  - whether `getConnectionString()` is available
  - whether a database client was created
  - whether a `sql` method is available
  - whether manual database environment variables are present
- Kept the manual connection-string fallback for older/alternate Netlify setups.

## Local test

```bat
npm install
npm run build
```

## Git commands

```bat
git status
git add .
git commit -m "My Passwords Ver-0.002G fix version labels and database runtime diagnostics"
git push origin main
```

## Netlify deploy

After pushing, let Netlify publish the deploy. If required, use:

```bat
netlify deploy --prod --build --skip-functions-cache
```

## Test URLs

```text
https://brians-password-vault.netlify.app/.netlify/functions/health
https://brians-password-vault.netlify.app/.netlify/functions/db-health
```

## Important

The `db-health` endpoint still does not expose secrets or full database URLs. It only reports whether connection mechanisms are present and whether the query works.
