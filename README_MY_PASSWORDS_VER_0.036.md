# My Passwords Ver-0.036 — Full Vault Emergency Release Option

## Build summary
Ver-0.036 extends Emergency Access so the owner can explicitly choose **Full vault access** for next-of-kin use, instead of waiting for a future release.

## Included
- Adds **Full vault access** as an owner-selectable release scope.
- Keeps **Emergency Info folder only** available as the safer restricted option.
- When an invite exists, saving the Emergency Access plan prepares an encrypted emergency release package while the vault is unlocked.
- When sending an invite, the release package is also prepared and saved.
- The release package is encrypted in the browser using the secure invite token, so the owner master password is not stored or sent to the server.
- If the waiting period ends and the request becomes `release_ready`, the trusted person can open the owner-prepared package from the secure browser link.
- Full vault access includes saved vault records available at the time the package was prepared, including passwords and card records when selected by the owner.
- The trusted person still does not need My Passwords installed or their own vault.

## Important safety notes
- This build does not store the owner master password.
- The emergency package is a prepared snapshot. If the owner changes the vault later, they should save the Emergency Access plan again to refresh the release package.
- Encrypted document file downloads are not separately decrypted in this first full-vault foundation; the vault records/metadata are included.
- Owner cancellation still prevents release.

## SQL
No SQL required. This uses existing `metadata` fields on `public.emergency_access_invitations` and existing request status flow.

## Test checklist
1. Open `/vault` and unlock.
2. Go to Settings → Emergency Access.
3. Choose Release scope: Full vault access.
4. Save plan.
5. Send or resend invite.
6. Accept invite from the trusted-person browser link.
7. Request emergency access.
8. Confirm owner sees the request and can cancel.
9. For testing only, use database/test timing to make the request `release_ready`.
10. Open the trusted-person link again and confirm the emergency package can be viewed.
