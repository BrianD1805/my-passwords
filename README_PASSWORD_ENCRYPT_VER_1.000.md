# Password-Encrypt Ver-1.000 — Launch Baseline

## Purpose
Ver-1.000 is the controlled Personal Plan launch baseline after completion of the pre-launch security, monitoring, legal/commercial, Trusted Person and onboarding test cycles.

This build is intentionally narrow: it carries forward the fully tested Ver-0.055D account/vault isolation and PWA-install hardening, then applies the two final launch fixes requested after testing.

## Final launch changes

### 1. Secure Device Unlock key is unlock-only
- The key icon on the vault login screen is shown only after Secure Device Unlock has already been configured on that device.
- Tapping the key explicitly blurs the vault master-password field before invoking the platform security flow, so the vault keyboard is not opened by the key action.
- PIN, fingerprint, face-unlock and passkey input are handled by the phone/computer/browser security UI.
- Secure Device Unlock setup has moved to `Settings → Secure device unlock` after the customer has opened the vault with the master password.
- The login key no longer focuses the master-password field or starts setup.
- The existing 14-day / 10-quick-unlock master-password reminder remains enforced.

### 2. Onboarding legal warning / password-manager cleanup
- Terms of Service and Privacy Policy acceptance remains in Account Setup (Step 1) only.
- The Step 1 → Step 2 handoff clears stale Account Setup warnings/toasts so Vault Setup cannot display an old legal-acceptance warning.
- Account Setup contact fields and Vault Setup contact fields explicitly opt out of password-manager form classification.
- On Chromium/WebKit, the two Vault Setup master-password inputs use masked text fields rather than browser-login password fields, preventing Google Password Manager from treating the vault master password as a website login credential while keeping the value visually concealed.
- Browsers that do not support masked text input fall back to a normal password field with the existing password-manager ignore hints.
- `autocomplete="new-password"` is not used anywhere in Account Setup or Vault Setup.

## Existing launch safety retained
- Personal Plan-only public launch; Family and Business remain hidden/reserved.
- Tenant/user-bound local encrypted vault ownership.
- Cross-account vault/session mismatch blocking.
- Server-side plan validation and checkout validation.
- CSRF-protected sensitive browser actions.
- Operational monitoring, Stripe reconciliation safeguards and metadata-only diagnostics.
- Trusted Person staged flow, waiting period, quarterly reminders, 30-day released-package expiry and owner cancellation protections.
- Three-step onboarding: Account Setup → Vault Setup → Install App.
- SMS implementation retained but customer SMS verification UI remains hidden until service activation.

## Database / environment
No Supabase SQL changes.
No new Netlify environment variables.

## Versioning from this release
- Launch baseline: `Ver-1.000`
- Next new feature: `Ver-1.001`
- First fix to that feature: `Ver-1.001.1`
- Further fix to the same feature: `Ver-1.001.2`, etc.

## Recommended final spot checks
1. Vault login: configured Secure Device Unlock key opens the device security prompt without opening the vault keyboard.
2. Secure Device Unlock not yet configured: unlock with the master password, then configure it from Settings; the login key is not used for setup.
3. Account Setup: Terms/Privacy acceptance is required only in Step 1.
4. Step 1 → Step 2: no stale Terms/Privacy warning appears.
5. Vault Setup: Google Password Manager does not offer to generate/save the vault master password on Chrome.
6. Create Vault → Install App → open vault.
7. Existing-account multi-tenant isolation remains blocked on mismatched session/vault identities.

## Verification performed in patch workspace
- Security static checks: 13/13 PASS
- Reliability static checks: 20/20 PASS
- Legal/commercial static checks: 35/35 PASS
- Landing UX static checks: 36/36 PASS
- Mobile restoration checks: 6/6 PASS
- Trusted Person / Emergency Flow checks: 64/64 PASS
- Onboarding Flow checks: 52/52 PASS
- JS/MJS syntax checks: 70 files PASS
- JSX syntax/transpile checks: 7/7 PASS
- Netlify Function imports: 60/60 PASS
- CSS structural validation: PASS

`npm run build` was not run in the patch workspace because project dependencies are deliberately not installed there.
