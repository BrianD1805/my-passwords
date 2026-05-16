# My Passwords Ver-0.002 Security Notes

This patch introduces the database sync foundation without changing the core safety rule:

**The master vault password is never sent to Netlify Functions or the database.**

The browser encrypts the vault using Web Crypto AES-GCM. The sync function receives only:

- encryptedBlob
- localSalt
- localIv
- tenantId
- userId
- itemCount
- clientUpdatedAt

The database can store the encrypted snapshot but cannot read the original passwords, bank details, API keys or notes.

## What Ver-0.002 is not yet

Ver-0.002 is not a full commercial password manager yet. It does not yet include:

- Real account authentication
- Password reset/recovery policy
- Multi-device conflict resolution
- Emergency unlock approval workflow
- Subscription billing
- Production-grade rate limiting
- Independent security audit

Those must be added before this becomes a SaaS product.
