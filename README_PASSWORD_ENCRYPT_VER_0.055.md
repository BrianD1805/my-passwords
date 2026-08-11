# Password-Encrypt Ver-0.055 — Onboarding Flow

Ver-0.055 separates new-customer onboarding from existing-customer vault access so the public “Open My Vault” action cannot lead an existing customer into creating another vault by mistake.

## Changes
- “Open My Vault” on the public landing page now opens a clear existing/new customer choice popup.
- Existing customers continue to `/vault?entry=existing`.
- The existing-customer vault screen shows only **Open Existing Vault** when no local vault exists; **Create Vault** is not offered.
- The existing-customer restore flow cannot silently fall back to create mode if no secure backup is found.
- If an existing account is detected during the signup flow, completion also routes into existing-customer vault access rather than new-vault creation.
- New customers still use **Start free trial** and, after successful onboarding, continue to the normal secure vault creation flow.
- Existing-vault verification/master-password wording is distinct from new-vault setup wording.

No Supabase SQL or new environment variables are required.
