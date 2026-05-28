# My Passwords Ver-0.014E

Urgent Netlify dependency install fix after Ver-0.014D.

## What changed
- Cleaned `package-lock.json` so package tarball URLs point to the public npm registry.
- Added `registry=https://registry.npmjs.org/` to `.npmrc`.
- Bumped visible app/function/service-worker versions to Ver-0.014E.

## What did not change
- No app feature changes.
- No encryption changes.
- No sync changes.
- No Supabase SQL changes.
- No vault snapshot changes.

## Reason
Netlify failed during `npm install` because the lockfile contained sandbox/internal package proxy URLs. Those URLs are not valid for Netlify production builds.
