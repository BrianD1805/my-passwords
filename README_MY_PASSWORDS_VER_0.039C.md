# My Passwords Ver-0.039C

## Master-password manager isolation

- Protects the existing-vault master-password field from background browser and password-manager autofill.
- Keeps the field read-only until the user deliberately interacts with it.
- Clears unsolicited background autofill while the field has not been deliberately activated.
- Removes the standard `current-password` autocomplete classification.
- Marks the unlock and setup forms to be ignored by common password managers.
- Adds a clear security warning telling users not to save the vault master password in a browser or another password manager.
- Applies the same password-manager exclusion attributes during initial vault creation and existing-vault setup.
- Preserves the Ver-0.039B Add Item autofill isolation fix.
- No database migration or Supabase SQL is required.
