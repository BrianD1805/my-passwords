# Password-Encrypt Ver-1.006 — Vault Status Checks

## Purpose
Make Vault Status the single, clear repair entry point for backup, sync and verified-device problems, while reducing false device-verification prompts caused by overlapping session checks.

## Changes
- Vault Status now includes live device verification state and cannot show Up to date while device verification is required.
- Clicking Vault Status opens the appropriate repair popup directly for verification, backup pending, conflict, not checked, check failed, offline and other non-safe states.
- When the vault is genuinely Up to date, Vault Status continues to open Vault Safety information.
- Removed the large sync warning banner.
- Removed the delayed automatic routine sync warning popup; the Vault Status control is now the primary repair entry point.
- Conflict popup now uses two fully clickable copy panels.
- The newer recorded change time is marked Recommended, but Password-Encrypt does not silently choose a copy because timestamps alone cannot prove which branch contains all intended work.
- Device session checks are single-flight/debounced so initial load, focus and visibility events cannot race a session rotation.
- Temporary session-status failures preserve the last known session state and show Check needed rather than falsely forcing verification.
- Server session validation can recover a freshly rotated successor session for a short grace period, preventing an old concurrent request from clearing the renewed cookie.
- Session lifecycle operational metadata now records app version 1.006.

## Database / environment
No Supabase SQL or new environment variables are required.

## Version alignment
- App: Password-Encrypt Ver-1.006
- npm: 1.6.0
- Service worker cache: my-passwords-v1.006
- Server APP_VERSION: Password-Encrypt Ver-1.006
