# Password-Encrypt Ver-0.054 — Trusted Person Emergency Flow Testing

Ver-0.054 is the first focused testing build for the Trusted Person / Emergency Access journey. It simplifies the owner-facing flow, records a metadata-only event history, provides a true reset-to-zero action for repeated testing, expands stage-specific email guidance, and adds an Admin permanent-account-delete testing tool.

## Trusted Person owner experience

- The owner is shown one current flow stage rather than several competing status panels.
- Secondary actions are presented through one `Choose an action` dropdown.
- Trusted person details and the emergency package each have their own Save button.
- Event history is optional and opens as a Settings-style accordion with dates and times.
- The flow refreshes status silently while the Trusted Person settings section is open.
- Reset to zero removes the trusted person plan metadata, invitation/request flow, links and flow audit history so testing can restart from Stage 1.

## Flow stages

1. Add/save a trusted person and send the nomination invitation.
2. Trusted person accepts or declines the nomination.
3. After acceptance, the trusted person receives a separate secure Request Access link for a future genuine emergency.
4. Using Request Access starts the configured waiting period and notifies the owner, who can cancel before release.
5. If the waiting period completes without cancellation, only the prepared emergency package becomes available.

## Emails

Emails now identify the relevant stage and explain what has happened, what is not yet available, and what happens next. No email contains decrypted vault contents or the master password.

## Admin permanent delete testing tool

Admin customer detail includes `Delete account permanently` for non-Founder accounts. It requires typing `DELETE` plus a second browser confirmation. If the customer has a live Stripe subscription, Password-Encrypt cancels that subscription before deleting the account. The tenant and its dependent rows are then permanently deleted and an account-deleted email is sent to the captured account-holder email address.

This tool is intended mainly for disposable testing accounts. It is irreversible. The Founder account is protected from this action.

## Database changes

No Supabase schema migration is required for Ver-0.054. Trusted Person flow history is stored in the existing invitation metadata and is deleted with the invitation during Reset to zero.

## Verification commands

```bat
npm run security:check && npm run reliability:check && npm run legal:check && npm run ux:check && npm run mobile:check && npm run emergency:check && npm run build && netlify dev --no-open
```
