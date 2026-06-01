# My Passwords Ver-0.023

Dedicated `/vault` first-time setup flow.

## Summary

Ver-0.023 keeps the public SaaS landing page separate from the private vault PWA page and replaces the old embedded new-device setup panel with a cleaner Create Vault popup on `/vault`.

## Included changes

- `/vault` still opens as the standalone private vault login page.
- Existing local-vault users still see the simple master-password unlock screen.
- First-time/no-local-vault users now see a simple choice to create a vault or open an existing vault.
- The new Create Vault popup collects account details, verifies by email OTP, and then asks for the master password.
- New vault creation requires matching master password entries.
- Opening an existing vault uses the same secure account verification and master-password route.
- Public landing page remains on `/`.
- No Supabase schema changes are required.
- No encryption, document blob, cloud sync, or vault item storage logic was changed.

## Testing focus

1. Existing installed PWA opens `/vault`.
2. Existing local vault unlocks exactly as before.
3. A browser/device without local storage shows the Create Vault/Open Existing Vault choices.
4. Create Vault opens a centred popup with sticky header/footer and internal body scroll.
5. Email OTP verification still works.
6. Creating a test vault requires matching master password entries.
7. `/` still shows the public SaaS landing page.
