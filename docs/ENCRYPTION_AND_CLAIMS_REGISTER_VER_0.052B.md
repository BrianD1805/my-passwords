# Password-Encrypt Ver-0.052B — Encryption & Marketing Claims Register

Date: 8 August 2026

Purpose: keep public security/privacy claims aligned with the implementation actually shipped.

## Current implementation facts

- Vault records are encrypted in the browser before cloud backup/sync.
- Uploaded document contents are encrypted in the browser before upload.
- Vault encryption uses AES-GCM.
- The key is derived from the master password using PBKDF2 with SHA-256 and the current implementation uses 250,000 iterations.
- Password-Encrypt does not intentionally send or store the master password on its servers.
- Cloud systems do store encrypted vault/document payloads and metadata required to operate the service.
- Server/admin support tools are designed to use metadata and not return decrypted vault/document content.
- Secure device unlock, when deliberately enabled, stores a wrapped master password and a non-exportable local device key in the browser/device so the app can recover the master password locally after platform credential verification.
- Emergency Access is an owner-selected disclosure path. It stores a separately encrypted emergency package that can become available to the trusted person after the configured process/waiting period.
- The service is a web/PWA application, so code delivered to the browser participates in the encryption/decryption process.

## Approved public claims

These are accurate when used in context:

- “Client-side encrypted vault.”
- “Vault records are encrypted in your browser before cloud storage.”
- “Uploaded documents are encrypted before upload.”
- “Password-Encrypt does not intentionally send or store your master password on its servers.”
- “Support cannot recover or reset your master password.”
- “Routine admin/support diagnostics are metadata-only and do not expose decrypted vault contents.”
- “Stripe handles full payment-card details.”
- “Emergency Access is optional and owner-controlled.”

## Claims that require qualification

### “Only your master password opens your vault”

Do not use as an absolute statement. Secure device unlock can locally unwrap the master password on a deliberately configured device. Better wording:

> “Your master password is the primary secret that decrypts your vault. Secure device unlock can locally unwrap it on a device you deliberately set up.”

### “We cannot decrypt your vault”

Prefer:

> “Password-Encrypt does not hold the server-side master password normally needed to decrypt stored vault snapshots, so routine server/admin systems cannot normally read them.”

Why: the browser application itself performs decryption after receiving the required local secret, Secure device unlock changes the local threat model, Emergency Access creates an intentional disclosure package, and absolute future/compromise claims are not justified.

### “Zero knowledge”

Do not use as an unqualified marketing promise. The service necessarily processes account metadata, billing metadata, sync metadata and Emergency Access metadata; a web/PWA also delivers executable code involved in client-side cryptography. If the phrase is ever used, it requires a precise technical definition and architecture/security review first.

## Prohibited / unsupported claims

Do not publish:

- “Fully secure”
- “100% secure”
- “Unhackable”
- “Cannot ever be decrypted”
- “Nobody can ever access your data”
- “Zero knowledge” without a documented, reviewed definition
- Claims that all customer data is encrypted end-to-end if account/billing/operational metadata is not
- Claims that deleting the cloud account remotely wipes every local browser/device copy

## Change-control rule

Any future change to vault encryption, key derivation, Secure device unlock, Emergency Access, server-side recovery, admin/support tooling or document handling must trigger a review of:

1. Terms of Service
2. Privacy Policy
3. Billing/refund policy if commercial impact exists
4. Landing-page claims
5. FAQs and lifecycle emails
6. This claims register


## Product naming
All public security claims in this build use **Password-Encrypt** as the service name. The rename does not change the cryptographic implementation or expand any security guarantee.
