# Password-Encrypt Ver-1.010.02 — Startup Runtime Fix

This is a focused fix to Ver-1.010.01.

## Fix
- Moves onboarding route-state declarations before React effects that read `onboardingInstallEntry`.
- Prevents the production runtime `ReferenceError` that caused the global “Password-Encrypt could not start” recovery screen on both landing and vault routes.
- Keeps the Ver-1.010 onboarding card flow and Ver-1.010.01 duplicate-key cleanup unchanged.

## Version alignment
- App: Password-Encrypt Ver-1.010.02
- npm: 1.10.2
- Service-worker cache: my-passwords-v1.010.02
- Server APP_VERSION: Password-Encrypt Ver-1.010.02
- Offline page: Password-Encrypt Ver-1.010.02

No Supabase SQL or environment variable changes are required.
