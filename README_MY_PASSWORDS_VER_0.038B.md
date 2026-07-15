# My Passwords Ver-0.038B — Secure device unlock wording and password reminder

## Summary
- Renamed the user-facing feature from Fingerprint unlock to Secure device unlock.
- Kept the fingerprint icon, but made it larger and removed the coloured button treatment so the icon sits plainly on the white login background.
- Kept the password input placeholder as “Enter password”.
- Added a forced master-password check after 14 days or 10 secure-device quick unlocks, whichever comes first.
- Updated the Settings → My Account wording to explain that secure device unlock is a convenience feature, not a master-password replacement.

## Security note
My Passwords cannot safely recover a forgotten master password because the master password is the encryption key. Account email/OTP can verify identity, but it cannot decrypt the vault. Safe handling means encouraging password memory, emergency access, backups, and reset/rebuild options without weakening encryption.

## SQL
No SQL required.
