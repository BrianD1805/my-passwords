# Password-Encrypt Ver-1.010.01 — Onboarding Build Warning Fix

Ver-1.010.01 is a focused fix to the Ver-1.010 onboarding card flow.

## Fix

The initial `landingOtp` state object in `src/main.jsx` contained duplicate `input` and `testCode` keys. Vite/esbuild allowed the production build to complete but correctly emitted duplicate-key warnings.

The initializer now applies any safe restored onboarding OTP state first, then explicitly resets `input` and `testCode` once. This preserves resumable onboarding while ensuring a previously entered OTP or test code is never restored.

## Version alignment

- App: Password-Encrypt Ver-1.010.01
- npm: 1.10.1
- Service-worker cache: my-passwords-v1.010.01
- Server APP_VERSION: Password-Encrypt Ver-1.010.01
- Offline page: Password-Encrypt Ver-1.010.01

## Database / environment

No Supabase SQL migration is required.
No Netlify environment-variable changes are required.
