# Password-Encrypt Ver-1.002.01

Emergency Package release-page usability update.

## Changes

- Removed obsolete waiting-period explanatory copy from the released Emergency Package page.
- The release page now identifies the account owner who prepared the package.
- Updated the Emergency package ready wording.
- Moved the full-package download controls to the top of the released package, immediately after the ready message.
- Full ZIP download is now available even when the package contains no released document files; TXT and DOCX remain available separately.
- Added clear Windows, Android and iPhone/iPad ZIP extraction instructions.
- Released vault content is grouped into independently expandable folder dropdowns; more than one folder can remain open at once.
- Documents is always shown first, followed by other folders alphabetically, then number-led folders, then symbol-led folders.
- Released document files are individually downloadable from the Documents folder.
- Owner-written package notes and instructions are retained in their own expandable section.

## Database / environment

- No Supabase SQL change is required.
- No new Netlify environment variables are required.
- Existing VAPID keys remain unchanged.

## Version alignment

- App/server: Password-Encrypt Ver-1.002.01
- npm package: 1.2.1
- service-worker cache: my-passwords-v1.002.01

## Verification

- Security: 13/13 PASS
- Reliability: 20/20 PASS
- Legal/commercial: 35/35 PASS
- Landing/plan UX: 36/36 PASS
- Mobile: 6/6 PASS
- Trusted Person / Emergency Flow: 75/75 PASS
- Onboarding: 52/52 PASS
- Push Notifications: 32/32 PASS
- Ver-1.002.01 feature checks: 17/17 PASS

The sandbox package does not include node_modules, so the Vite production build is left for the normal local project test rather than installing dependencies in the patch workspace.
