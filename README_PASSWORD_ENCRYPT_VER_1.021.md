# Password-Encrypt Ver-1.021 — Emergency Backup Codes

## Purpose
Adds an emergency recovery option for customers who forget the master password without giving Password-Encrypt support a readable server-side copy or a normal password-reset capability.

## Emergency Backup Codes
- Settings → Protection and recovery → Emergency Backup Codes.
- Generates 10 high-entropy one-time codes in the unlocked browser.
- Each code is 24 base32 characters, displayed as six groups of four.
- Each code derives an AES-GCM wrapping key in the browser and protects a separate encrypted copy of the current master password.
- Supabase stores the encrypted recovery envelope and one-way code fingerprint, never the readable code or readable master password.
- Generating a new set removes the previous recovery envelopes.
- A successfully used recovery envelope is deleted so that code cannot be reused against retained server recovery data.

## Saving the codes
The newly generated set is shown once and can be:
- copied,
- downloaded as a TXT file, or
- explicitly emailed to the customer's verified email address.

Emailing the actual codes is optional and less private. Password-Encrypt does not keep plaintext codes for later re-sending. If a customer loses the set, they must open the vault and generate a new set.

## Recovery flow
1. From the locked vault, select **Use Emergency Backup Code**.
2. If needed, verify the account email using the normal account-recovery OTP.
3. Enter one unused Emergency Backup Code.
4. The browser identifies the matching encrypted recovery envelope and decrypts the protected master-password copy locally.
5. The recovered password opens the encrypted vault.
6. After successful unlock, the used recovery envelope is deleted and a security-notice email is sent.

## Reminder emails
- Enabled by default after generating a set.
- Scheduled every 90 days.
- Reminder emails never contain backup codes.
- They state how many unused codes remain and ask the customer to confirm they still have them stored safely.
- Settings includes **Send reminder now** and an on/off checkbox.

## Security boundary
Password-Encrypt support still cannot see, recover or reset the master password. Emergency Backup Codes work only if the customer deliberately generated them while the vault was unlocked and still possesses an unused code. If the customer loses the master password, all backup codes and all configured Secure device unlock access, Password-Encrypt still cannot decrypt the vault for them.

## Database
Run `SUPABASE_SQL_PASSWORD_ENCRYPT_VER_1.021.sql` before testing the feature.

## Legal/privacy
Terms and Privacy copy is updated to disclose encrypted recovery envelopes, code fingerprints, optional explicit email delivery of a new plaintext code set, and recovery-envelope retention. Legal version is 2026-08-26 for new/pending signup acceptance.
