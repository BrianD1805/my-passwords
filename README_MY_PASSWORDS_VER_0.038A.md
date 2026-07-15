# My Passwords Ver-0.038A — Fingerprint quick unlock UX refinements

Focused UX/security refinement for the PWA quick unlock work.

## Changes
- Polished the fingerprint settings panel padding and rounded border.
- Added a compact fingerprint icon beside the password input on the login screen.
- Changed password placeholder to `Enter password`.
- Removed the large settings enable button; setup is now driven from the login fingerprint icon after entering the password once.
- Added clearer security wording: browser PWAs cannot guarantee fingerprint-only on every platform. If the browser offers only a basic PIN or screen lock, cancel and use the password instead.
- Kept master password as the fallback and source of truth.

## SQL
No database changes.
