# Password-Encrypt Ver-0.055D — Onboarding Account/Vault Isolation & Install Fix

## Purpose
Ver-0.055D is an urgent onboarding/security correction following live multi-account testing.

The reported symptom was that a master password created for a newly tested account appeared to open a previously used Founder account in the same browser. The local ciphertext was not being cryptographically decrypted as a different account; rather, a local encrypted vault could be presented while a stale verified customer session/account context from another tenant was still active. This build treats that context mixing as a security boundary failure and blocks it.

## Changes

### 1. Open Existing Vault cleanup
- Removes the redundant single `Email` delivery selector from the existing-vault verification popup.
- Keeps the actual email address input and Send email OTP action, which are still required to identify and verify an existing account.
- SMS implementation remains in the codebase but SMS UI stays hidden.

### 2. Account/vault isolation hardening
- New locally encrypted vault envelopes are bound to the validated `tenantId` + `userId` that created/restored them.
- A bound local vault is refused before unlock if the browser's currently validated customer session belongs to another account.
- Switching the verified browser session to a different account force-locks an already-open bound vault and clears decrypted item state.
- Cloud backup is blocked before upload if the local vault owner binding and validated session identity differ.
- Generic account/cloud actions reject a bootstrap identity that disagrees with the validated customer session.
- Legacy/unbound local-vault fallback is blocked when a different authenticated cloud account rejects the supplied master password; this prevents old local data from being presented under the wrong account context.

### 3. New-account onboarding session isolation
- Starting new-account onboarding deliberately ends any previously verified customer session in that browser before the new tenant is created.
- The newly created account's tenant/user identity is retained only as onboarding metadata in sessionStorage across Step 1 → Step 2.
- Before Step 2 creates a vault, the live signed customer session is checked again and must exactly match the account created in Step 1.
- If it does not match, vault creation is blocked and the user sees a clear `Different account session detected` warning.
- Background session refresh is paused during the Step 1 → Step 2 handoff so an earlier account cannot overwrite the new onboarding account context.

### 4. PWA install button reliability
- Captures Chromium's `beforeinstallprompt` event in `index.html` before the React bundle loads, preventing the one-shot install opportunity from being missed during a long onboarding flow.
- The React app reuses that captured event and also waits briefly for a late install prompt after the service worker becomes ready.
- The manifest now declares a stable app `id` of `/vault`, matching its start route.
- If Chrome does not expose the native prompt (for example because the app is already installed or installability/user-engagement criteria are not currently met), the screen explains how to use Chrome's install icon/menu instead of implying that desktop Chrome cannot install the app.

## Database / environment
No Supabase SQL changes.
No new Netlify environment variables.

## Recommended live tests
1. Existing Vault popup: confirm the redundant Email selector row is gone, but email address + Send email OTP remain.
2. Multi-account isolation:
   - Verify/sign in Account A and create/open its vault.
   - End/replace the customer session with Account B.
   - Attempt to open Account A's local vault under Account B.
   - Expected: `Different account detected`; no vault opens and no backup occurs.
3. Fresh onboarding with an old session already present:
   - Leave an older test account verified in the browser.
   - Start a brand-new account from the landing page.
   - Expected: onboarding safely isolates/ends the old session.
   - Step 2 creates a vault only after the new account's live signed session is rechecked.
4. PWA install on desktop Chrome:
   - Use HTTPS/live site.
   - Complete onboarding and reach Step 3.
   - Click Install Password-Encrypt.
   - Expected: Chrome native install prompt if Chrome has made the install event available; otherwise Chrome-specific install-icon/menu guidance.

## Verification performed in patch workspace
- Security static checks: 13/13 PASS
- Reliability static checks: 20/20 PASS
- Legal/commercial static checks: 35/35 PASS
- Landing UX static checks: 36/36 PASS
- Mobile restoration checks: 6/6 PASS
- Trusted Person / Emergency Flow checks: 64/64 PASS
- Onboarding Flow checks: 46/46 PASS
- JS/MJS syntax checks: 72 files PASS
- Netlify Function imports: 60/60 PASS

`npm run build` was not run in the patch workspace because project dependencies are deliberately not installed there.
