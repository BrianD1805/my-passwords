# My Passwords Ver-0.014F

Urgent Netlify deployment fix after failed dependency installs.

## What changed
- Removed unused `@vitejs/plugin-react` dependency. The app has no Vite React plugin config and builds correctly without it.
- Regenerated/pruned `package-lock.json` so it no longer references `react-refresh`.
- Removed all internal sandbox package registry URLs from `package-lock.json`.
- Kept `.npmrc` pinned to the public npm registry.

## Safety
- No app feature changes.
- No encryption changes.
- No sync changes.
- No Supabase SQL changes.
- No vault data changes.

## Build
`npm run build` passed locally.
