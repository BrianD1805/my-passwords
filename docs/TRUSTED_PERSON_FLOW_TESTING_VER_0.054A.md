# Password-Encrypt Ver-0.054A — Trusted Person Emergency Flow live testing

Test this flow in order and review each customer-facing screen/email before moving to the next stage.

## 1. Reset and Stage 1 invitation

- Open Settings → Trusted Person Access.
- Confirm the current stage is visible at the top at a glance.
- If reusing a test flow, choose Reset to zero and confirm trusted-person details, requests, links, emergency-package setup and event history are cleared.
- Add/save the trusted person and emergency package separately.
- Send the invitation.
- Verify the recipient email:
  - Subject: `You've been chosen as a trusted person for Password-Encrypt`.
  - No internal stage/state numbering.
  - Explains what Password-Encrypt is.
  - Shows the owner full name, email and phone.
  - Explains serious illness/incapacity purpose and that acceptance grants no vault access.
  - Includes Learn more about Password-Encrypt link to the public landing page.

## 2. Invitation acceptance and future-access email

- Accept the nomination from the invitation link.
- Acceptance page should be confirmation-only; it should not show the future Request Emergency Access action.
- Verify the separate email:
  - Subject: `Password-Encrypt Emergency Access — Keep this link safe`.
  - No internal stage/state numbering.
  - Tells recipient to save the email/link somewhere safe/private for future use.
  - Explains that using it later starts the waiting period and does not immediately reveal vault information.

## 3. Emergency Access request and owner warning

- Use the saved Request Emergency Access link.
- Confirm the request starts the configured waiting period.
- Owner should receive a clear warning email explaining that no vault information has yet been released and how to cancel the request.
- Check the owner-facing current stage at the top of Trusted Person Access.

## 4. Waiting period completes

- Let the configured test waiting period finish without cancellation.
- Verify recipient release email:
  - Subject: `Password-Encrypt Emergency Access — Your emergency package is ready`.
  - No internal final-stage wording.
  - Explains that only the prepared package is available.
  - States that the secure link is available for 30 days and shows the expiry date/time.

## 5. Released package page

- Open the secure link.
- Confirm no stale invitation/request message is displayed.
- Confirm focused FAQs are near the top.
- Confirm exact access expiry is displayed.
- Confirm items are alphanumerically ordered: letters first, then numbers, then symbols.
- Test TXT download.
- Test DOCX download.
- Confirm the page warns that downloaded files are readable sensitive data and should be stored securely.

## 6. Event history and reset

- On the owner account, open Event history and verify relevant events show date/time.
- Reset to zero and confirm the flow returns to the initial stage and old flow audit records are gone.

## 7. Admin hard-delete test account (optional destructive test)

Use only on a disposable test account.

- Admin → customer detail → permanent delete.
- Founder account must remain protected.
- Type the required confirmation and delete.
- Confirm the customer can no longer authenticate.
- Confirm the account holder receives a simple account-deleted email with no reason stated.
