# Password-Encrypt Ver-0.054A — Trusted Person Flow Approved Wording & Release Package Improvements

Ver-0.054A applies the wording and UX decisions approved while live-testing Ver-0.054.

## Approved flow changes
- Stage numbers remain internal to the owner/app and are removed from nominee-facing emails.
- Initial invitation explains Password-Encrypt, shows the account holder's full name/email/phone, explains the Trusted Person purpose and includes a link to the public Password-Encrypt landing page.
- After accepting an invitation, the browser page is confirmation-only; it no longer shows a Request Emergency Access action.
- The separate future-use email is titled `Password-Encrypt Emergency Access — Keep this link safe` and tells the trusted person to save the email/link somewhere safe.
- The owner still receives the waiting-period warning when access is requested.
- Final release email is titled `Password-Encrypt Emergency Access — Your emergency package is ready` and explains the 30-day access window.
- Emergency Package links expire server-side 30 days after release readiness.
- Released vault records display in alphanumeric order: letters first, then numbers, then special characters.
- Final package page has focused FAQs near the top and hides the stale pre-release FAQ block.
- Emergency Package can be downloaded as TXT or DOCX, with a visible plaintext/sensitive-data warning.
- Trusted Person settings show the current internal stage at the top of the section for at-a-glance status.

## Database
No Supabase schema migration is required. The 30-day expiry is stored in existing request metadata.
