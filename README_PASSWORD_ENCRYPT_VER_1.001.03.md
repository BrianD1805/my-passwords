# Password-Encrypt Ver-1.001.03

## Founder Plan usage and vault / Emergency Access improvements

This is a full overwrite build based on Ver-1.001.02.

### Included
- Founder Plan now shows current usage under Plan and billing > Subscription overview: total vault items, encrypted documents and total account storage used in MB. Founder access remains unlimited.
- Vault-home favourite item summary is clickable and opens a view containing all favourite vault items.
- Stored document popup has a Share action beside the Documents pill. It uses the device/browser Web Share API when file sharing is supported and keeps Download as the fallback.
- Full-vault Trusted Person Emergency Packages can now include the actual stored document files. The owner browser decrypts each document locally while the vault is unlocked, re-encrypts a separate copy for the Trusted Person invite token, and uploads only that re-encrypted copy.
- Released Trusted Person packages show individual document downloads and a ZIP download containing the TXT package, DOCX package and released document files.
- Terms disclosure is updated to describe the Emergency Access document-release behaviour.

### Database change
Run `db/migrations/2026-08-13_emergency_access_documents_ver_1_001_03.sql` in Supabase before deploying this build.

No new Netlify environment variables are required. Keep the existing Ver-1.001 VAPID keys unchanged.

### Version alignment
- App/server: Password-Encrypt Ver-1.001.03
- npm package: 1.1.3
- service-worker cache: my-passwords-v1.001.03

### Verification
Static regression suites pass:
- Security 13/13
- Reliability 20/20
- Legal/commercial 35/35
- Landing/plan UX 36/36
- Mobile 6/6
- Trusted Person/Emergency Flow 70/70
- Onboarding 52/52
- Push Notifications 32/32
- Ver-1.001.03 feature checks 10/10

A local Vite production build was not run in the packaging environment because the uploaded full-source ZIP does not include `node_modules`; no dependency install was performed in the packaging environment.
