# My Passwords Ver-0.001 Security Notes

This is a foundation patch, not a finished commercial password manager.

## What Ver-0.001 does

- Creates a PWA shell.
- Creates a local encrypted vault using browser Web Crypto.
- Uses PBKDF2 + AES-GCM for local encryption.
- Keeps sensitive values in an encrypted local payload.
- Prepares Netlify Functions and database schema.
- Uses SaaS-ready tenant/user/vault tables.

## What Ver-0.001 does not yet do

- It does not yet sync vault records to Netlify Database.
- It does not yet include production authentication.
- It does not yet include Stripe billing.
- It does not yet include full emergency access workflow.
- It does not yet include secure account recovery.

## Critical rule

Never store readable passwords, bank details, card numbers, secret keys, private keys, recovery phrases or PINs in normal database columns.

Use encrypted_payload only.
