# My Passwords Ver-0.036B

Emergency accepted confirmation email and resend request-link controls.

## What changed

- When a trusted emergency contact accepts an invitation, the app now attempts to send a second email with their secure Request Emergency Access link.
- The accepted confirmation email tells the trusted person to keep the email somewhere safe.
- The Request Emergency Access link remains browser-only and does not require the trusted person to install My Passwords or create a vault.
- Accepting an invitation now clears the invitation expiry so the secure request link can be used later unless the owner cancels/resets the invite.
- Added owner controls in Settings > Emergency Access after acceptance:
  - Resend request link
  - Copy request link
- The request link does not release vault contents. It only lets the trusted person start the emergency request and waiting period.
- No Supabase schema changes are required.

## Testing flow

1. Clear Emergency Access test data if required using the existing SQL helper.
2. In the owner vault, set waiting period to 10 minutes for testing.
3. Save the Emergency Access plan.
4. Send the invitation.
5. Open the invite link as the trusted person and accept.
6. Confirm the trusted person receives the accepted/request-link email.
7. In the owner vault, click Check status.
8. Confirm owner controls show Resend request link and Copy request link.
9. Use the request link to start the request-access test.

## Safety notes

- No owner master password is stored or sent.
- No vault contents are released by accepting an invitation.
- No vault contents are released by receiving or opening the Request Emergency Access link.
- Vault contents only become available according to the later waiting-period/release-ready flow and only for the prepared emergency package scope.
