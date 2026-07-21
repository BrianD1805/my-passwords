# My Passwords Ver-0.039K

## Verification popup and mobile layout refinements

- Removes the outer drop shadow from the **Verify this device** popup while preserving the centred popup layout, sticky header/footer and internal scrolling.
- Corrects the mobile header grid so the full Vault Safety status text fits in all states, including **Up to date**, **Saving...**, **Backup pending**, **Review vault** and **Not checked**.
- Keeps the Help button first on mobile, followed by Vault Safety, Vault and Settings.
- Keeps the desktop footer on one line.
- Splits the mobile footer into two centred lines, with the version first and **secure private vault** underneath.
- No vault, encryption, authentication, sync, billing or database logic changes.
- No Supabase SQL required.
