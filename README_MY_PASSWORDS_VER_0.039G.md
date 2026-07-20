# My Passwords Ver-0.039H

## Verified-session master-password handoff fix

- Fixes the green verification-success action when OTP is completed while the vault is already open.
- The action now safely locks the open vault, returns to the master-password screen, activates the protected input and focuses it.
- Entering the master password then runs the Ver-0.039F freshness check and loads a newer encrypted cloud snapshot when available.
- Adds a retrying focus handoff for slower mobile/PWA rendering.
- Updates the success wording so the user knows the password step performs the newer-cloud-change check.
- Preserves all encrypted local and cloud vault data.
- Preserves Ver-0.039F newest-copy protection and explicit device-only backup warnings.

Expected package build version: `my-passwords@0.0.39-h`.

No Supabase SQL changes are required for Ver-0.039G.
