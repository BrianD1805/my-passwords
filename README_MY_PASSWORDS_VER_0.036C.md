# My Passwords Ver-0.036C

Emergency Access UX pass, request section cleanup, Q&A accordion, and waiting-period completion notification.

## Summary

This patch continues from Ver-0.036B and focuses on making the Emergency Access owner and nominee experience clearer before further release testing.

## Changes

- Reworked the owner Emergency Access status area into clearer sections:
  - Invitation
  - Request access
- Renamed the vague `Cancel request` button to `Cancel emergency request`.
- Moved request-link actions and emergency cancellation into the Request access section.
- Moved explanatory notes into Q&A accordion sections.
- Added Q&A guidance explaining:
  - what happens when access is requested
  - how the owner cancels
  - that the nominee does not need the app
  - how the nominee knows when the waiting period ends
  - what Full vault access means
- Added nominee-side Q&A accordions on the emergency invite/request page.
- Added release-ready email notification support when the system detects that the waiting period has ended.
- The nominee can still use the same secure browser link to check status and open the emergency package when ready.

## Safety notes

- No master password is stored or sent.
- No vault contents are released before the waiting period ends.
- Full vault access only applies when the owner deliberately selected that release scope.
- Emergency contacts still do not need to install the PWA or create their own vault.

## SQL

No new SQL is required for this patch.

## Local testing

```bat
npm install
```

```bat
npm run build
```

```bat
npm run dev
```

## Deploy

```bat
git status
git add .
git commit -m "My Passwords Ver-0.036C emergency access UX pass"
git push origin main
```
