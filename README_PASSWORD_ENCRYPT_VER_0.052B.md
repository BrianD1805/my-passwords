# Password-Encrypt Ver-0.052B — Product Branding & Ubuntu Restoration

## Scope
Targeted launch-branding update on top of the tested Ver-0.052A Legal, Privacy and Commercial Readiness build.

### Changes
1. Customer-facing product/service name changed from **My Passwords** to **Password-Encrypt** across the live app, landing page, admin, legal pages, PWA shell and server-generated customer/admin communications.
2. The vault home heading now displays the customer's own vault/account name instead of the product name.
3. Vault home title sizing is slightly reduced and allowed to wrap safely for longer vault names.
4. Ubuntu is restored as the global font across the app, landing page, admin and legal pages.
5. The legal document version/effective date is updated to **2026-08-08 / 8 August 2026** because the service name changed in the legal documents.
6. Internal storage keys and existing technical identifiers using `my-passwords` are intentionally retained to avoid breaking existing local vaults, Web/PWA state or billing metadata.

## Version alignment
- App/server: `Password-Encrypt Ver-0.052B`
- npm package version: `0.0.52-b`
- service-worker cache: `my-passwords-v0.052B`
- patch folder: `password-encrypt-ver-0.052B`

## Database
No Supabase SQL changes are required for Ver-0.052B.

## Environment follow-up
If `OTP_EMAIL_FROM` includes a sender display name, confirm it says `Password-Encrypt` rather than `My Passwords`. Do not change the verified sending address/domain unless required.

## Local verification
```bat
npm run security:check && npm run reliability:check && npm run legal:check && npm run build && netlify dev --no-open
```

Expected static checks:
- 13/13 Security PASS
- 20/20 Reliability PASS
- 30/30 Legal/commercial readiness PASS

## Live test
1. Confirm the landing page, legal pages, vault login and Admin use `Password-Encrypt`.
2. Unlock a vault and confirm the home heading shows that customer's vault name.
3. Confirm a long vault name wraps/fits cleanly on desktop and mobile.
4. Confirm Ubuntu is used across landing, vault, settings, popups, Admin and legal pages.
5. Confirm the PWA installed/app name is `Password-Encrypt` after the manifest/service-worker update is picked up.
6. Confirm signup legal pages show Effective 8 August 2026 / Document version 2026-08-08.

## Deploy
```bat
git status && git add -A && git commit -m "Password-Encrypt Ver-0.052B branding and Ubuntu restoration" && git push origin main
```
