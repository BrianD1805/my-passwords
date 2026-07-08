# My Passwords Ver-0.037 — Emergency contact request access flow improvements

This patch improves the Emergency Access email and browser-link flow.

## Changes

- Adds a three-step link model for Emergency Access:
  - invitation review link
  - request access link
  - open emergency package link
- Personalises emergency emails using the owner first name where possible.
- Adds clearer next-step wording in each email.
- Adds spam/junk folder guidance in emergency emails.
- Changes the waiting-period-complete email button to wording like `Open Brian's Vault`.
- Updates nominee-facing pages so the same emergency route presents more relevant information depending on whether the link is for invitation, request access, or opening access.
- Keeps the browser-only nominee flow. The nominee still does not need the PWA installed.
- Keeps the owner master password private. It is not stored or emailed.

## SQL

No SQL changes are required.

## Notes

Email delivery to spam is usually a mixture of domain reputation, sender history, DNS authentication, recipient filtering, and wording. This patch makes subjects and body copy more personal and less generic, but DNS/domain reputation may still need further attention later.
