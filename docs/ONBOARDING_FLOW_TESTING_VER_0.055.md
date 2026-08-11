# Password-Encrypt Ver-0.055 — Onboarding Flow Testing

## Existing customer path
1. On the public landing page press **Open My Vault**.
2. Confirm a popup asks whether you already have a Password-Encrypt account.
3. Select **Yes — I’m an existing customer**.
4. If this device already has the local vault, the normal unlock screen must appear.
5. If this device has no local vault, the page must show **Open Existing Vault** only. It must not show **Create Vault**.
6. Verify the existing account, enter the existing master password and restore the secure backup.
7. If no existing secure backup can be restored, the app must stop with an explanatory message; it must not change into create-vault mode.

## New customer path
1. On the public landing page press **Open My Vault**.
2. Select **No — I’m new to Password-Encrypt**.
3. Confirm the normal Start Free Trial/Create Account onboarding opens.
4. Complete verification as a new account.
5. Confirm the final action continues to normal secure vault setup where a new master password and vault can be created.

## Existing account discovered during signup
If signup identifies an already-existing account, after verification it must route to the existing-customer vault flow and must not offer creation of another vault.
