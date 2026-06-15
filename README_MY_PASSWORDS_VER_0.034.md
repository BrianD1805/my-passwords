# My Passwords Ver-0.034 — Emergency Access owner notification + waiting period release foundation

## Build purpose
Ver-0.034 continues the Emergency Access flow after the trusted person request is recognised correctly by the owner panel.

This build adds the owner-notification and waiting-period release foundation. It does not release vault contents yet.

## What changed
- Bumped the app to My Passwords Ver-0.034 across visible version text, package.json, package-lock.json, server function version, service worker cache and patch folder naming.
- Emergency access request emails now warn the owner that the selected emergency package can become available if the owner does not cancel before the waiting period ends.
- Emergency Access owner panel wording now explains that the waiting period is the safeguard and that cancellation must happen before the waiting period ends.
- Existing active requests are now checked for expiry. If the waiting period has already ended, the request can be marked as `release_ready`.
- `release_ready` is a foundation status only in Ver-0.034. It does not include or expose vault contents.
- Owner status check recognises `release_ready` and shows the waiting period ended message.
- Cancel request now also covers `release_ready` foundation requests.
- Trusted-person browser page wording now makes clear that no My Passwords app/account is needed, while future optional account-linking can be added later for trusted people who already have their own vault.

## Important live-vault safety
- No SQL migration is required for this build.
- No vault data is released by this build.
- No master password is stored.
- No local storage, cloud snapshots, document blobs or existing emergency records are cleared.
- The first release scope should remain the selected Emergency Info package / selected emergency package, not the full vault by default.

## Test checklist
1. Unlock the vault and open Settings → Emergency Access.
2. Confirm the footer shows My Passwords Ver-0.034.
3. Use an accepted invite and request emergency access from the trusted-person browser page.
4. Confirm the owner receives the request email if Resend is configured.
5. Click Check status in the owner panel.
6. Confirm the owner panel shows the accepted invitation, active request, request date and waiting-period end time.
7. Confirm the copy explains that if the owner does not cancel before the waiting period ends, the selected emergency package can become available.
8. Confirm Cancel request still works and no vault contents are released.

## Notes for future Ver-0.036
Ver-0.036 should design/build the actual emergency package release page and package format. The release package should be controlled and selected by the owner, with Emergency Info package as the safest default.
