# Password-Encrypt Ver-1.005.01 — Startup Fix

Fixes a runtime startup failure introduced in Ver-1.005.

## Cause
The new Emergency Package import startup effect referenced `emergencyImportEntry` before that route constant had been initialised. This is valid syntax and therefore passed the Vite build, but at runtime JavaScript raised a temporal-dead-zone `ReferenceError`, which was caught by the app startup fallback.

## Fix
Resolve the Emergency Package import-entry flag before the startup effects run, while retaining the existing route helper later in the component. No vault data migration is required.

## Version alignment
- App: Password-Encrypt Ver-1.005.01
- npm: 1.5.1
- Service worker cache: my-passwords-v1.005.01
- Server APP_VERSION: Password-Encrypt Ver-1.005.01

No Supabase SQL or new Netlify environment variables are required.
