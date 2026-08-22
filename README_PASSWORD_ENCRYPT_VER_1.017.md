# Password-Encrypt Ver-1.017 — Onboarding Flow Bugs

Build date: 22 August 2026

## Changes

1. The remaining onboarding gates are armed before the newly created vault unlocks, preventing the normal Guided Tour / push startup popup from flashing between master-password confirmation and onboarding Step 12.
2. After the native PWA install prompt is accepted, Step 12 explains that Password-Encrypt will finish downloading/installing in the background and immediately provides Continue so onboarding does not wait for the appinstalled event.
3. The Guided Tour is now modal. The overlay absorbs background interaction and highlighted controls are display-only during the tour, preventing accidental vault actions/popups from disrupting guide positioning.

## Database

No Supabase SQL or migration is required for Ver-1.017.

## Local verification

Run from the current project directory:

- npm install
- npm run build
- netlify dev --no-open

The isolated packaging environment could not complete npm install within its execution window, so the Vite production bundle was not regenerated here. Static/regression checks passed; run the normal local build before publishing.
