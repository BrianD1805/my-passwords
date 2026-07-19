# My Passwords Ver-0.039B

## Add-item browser autofill isolation fix

- Prevents the browser/password manager from automatically placing the vault account login and master password into a new password item.
- The Add Item form now disables form autocomplete, identifies its credential fields as vault-entry fields, and includes common password-manager ignore attributes.
- New-item username and secret fields remain read-only until the user focuses them, preventing background autofill when the popup opens.
- Existing-item editing remains immediately editable.
- The master vault login is explicitly marked as the current master password, while new-vault password fields are marked as new passwords, helping browsers keep the two contexts separate.
- No encryption, account, tenant, subscription, database or cloud-sync logic changed.
- No Supabase SQL is required.
