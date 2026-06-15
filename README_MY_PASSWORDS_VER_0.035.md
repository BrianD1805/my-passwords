# My Passwords Ver-0.035 — Emergency Package Release Foundation

Ver-0.035 continues the Emergency Access flow after Ver-0.034 owner notification and waiting-period foundation.

## What changed

- Bumped the app to My Passwords Ver-0.035 across visible version text, package.json, package-lock.json, server function version, service worker cache and patch folder naming.
- Added an owner-side Emergency Package Foundation editor in Settings → Emergency Access.
- The owner can prepare an Emergency Info package with:
  - package title,
  - emergency message,
  - important contacts,
  - document/location notes,
  - trusted-person checklist.
- The default release scope remains Emergency Info folder only.
- Cards and full-vault release remain excluded by default and are marked as later/future explicit choices only.
- The emergency invite/request page now checks the secure token status on page load.
- If the request already exists, the trusted-person page recognises the active request.
- If the waiting period has ended, the trusted-person page shows a release-ready foundation screen.
- No normal vault passwords, card details, documents, or full vault contents are exposed by this patch.

## Important safety note

The Emergency Package data is still saved inside the owner's encrypted vault plan. Ver-0.035 prepares the owner UI and the trusted-person release-ready screen. It does not yet perform secure server-side package release of encrypted vault contents.

## No SQL required

This is a code-only patch. The existing emergency_access_invitations and emergency_access_requests tables are reused.

## Test steps

1. Install patch and confirm footer shows My Passwords Ver-0.035.
2. Open Settings → Emergency Access.
3. Confirm the Emergency Package Foundation editor appears.
4. Add package message/contact/document/checklist details and save.
5. Use the emergency invite link after an accepted invitation.
6. Confirm the page recognises an existing request.
7. If the waiting period has ended, confirm the trusted-person page shows the release-ready foundation card.

## Deployment

Use the standard local test and Git deploy process.
