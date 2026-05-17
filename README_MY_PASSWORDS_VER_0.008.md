# My Passwords Ver-0.008 — Tasteful Toast Notifications

This patch adds user reassurance notifications throughout the vault app.

## What changed

- Bumped visible version to My Passwords Ver-0.008.
- Added tasteful toast notifications for save, copy, sync, restore, bootstrap, warning and error states.
- Desktop toast position: bottom right.
- Mobile/PWA toast position: bottom centre, just above the safe area.
- Toasts auto-dismiss and can be clicked to dismiss manually.
- Existing status panels remain in place for audit/history, but quick feedback is now visible without scrolling.

## Test flow

1. Unlock the vault.
2. Copy a username or secret and confirm a toast appears.
3. Add a test item and confirm the save/sync feedback appears.
4. Click Push encrypted vault and confirm sync success toast appears.
5. On mobile/PWA, confirm toast appears bottom centre and does not disappear off-screen.

## Deploy

```bat
npm install
npm run build
git status
git add .
git commit -m "My Passwords Ver-0.008 add tasteful toast notifications"
git push origin main
```
