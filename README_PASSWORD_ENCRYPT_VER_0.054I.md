# Password-Encrypt Ver-0.054I — Trusted Person Emergency Flow UX

This patch refines the Trusted Person Planning UX and standardises customer/admin date presentation.

## Changes
- Trusted Person Help & FAQs use one question/answer per row.
- Desktop Send invitation control aligns with the right-side stage actions.
- New/reset Trusted Person plans default release scope to Full vault access.
- Step 1 and Step 2 editor panels close after a successful save.
- Displayed application dates use dd/mmm/yyyy, with time appended where relevant (for example 11/Aug/2026, 07:59).
- Removed the duplicate “Complete Stages 1–4 in order” setup introduction. The same setup explanation remains in Help & FAQs.
- FAQ answer text uses normal weight instead of heavy bold styling.

No Supabase SQL or new environment variables are required.
