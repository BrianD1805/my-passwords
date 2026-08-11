# Password-Encrypt Ver-0.054J — Trusted Person Emergency Flow UX

This is a focused Trusted Person Emergency Flow UX patch over Ver-0.054I.

## Changes
- Trusted Person action-dropdown trigger and option text use lighter typography so choices fit more cleanly on desktop and mobile.
- Stage 5 no longer offers the redundant manual “Check for Emergency Access request” action because the Trusted Person status checker already refreshes automatically.
- Stage 5 actions are shortened to:
  - Resend access link
  - Copy access link
- Invitation, waiting-period and maintenance action dropdowns use the same lighter Trusted Person action-menu typography for consistency.

No Trusted Person backend flow, reminder schedule, waiting period, release logic, email wording or security behaviour is changed.

No Supabase SQL or new environment variables are required.
