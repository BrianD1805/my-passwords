# Password-Encrypt Ver-1.023 — Emergency Backup Codes UX and Recovery

## Purpose
Improve the Emergency Backup Codes experience and turn successful backup-code recovery into a complete master-password replacement flow.

## Changes
- Generated-code popup has cleaner spacing and a two-by-two action layout: Copy all, Download, Email codes, Done.
- Replaced “I have saved them” with “Done”.
- Emergency Backup Code status now preloads as soon as a verified session is available. Settings shows “Checking…” while status is unknown rather than briefly showing “Set up”.
- Simplified the configured Emergency Backup Codes Settings screen to the essentials: unused-code count, generation date, reminder status, reminder toggle, Generate new set and Send reminder now.
- First-time setup retains the necessary recovery/security explanation without repeating it after codes already exist.
- After an Emergency Backup Code successfully recovers the vault, the customer must set a new master password before continuing to use the vault.
- The vault and externally stored encrypted documents/pictures are re-encrypted with a fresh salt and the new master password.
- A new encrypted cloud recovery point is confirmed before the password change is treated as complete when cloud backup is enabled.
- Secure Device Unlock is cleared because its local wrapper contains the previous master password; the customer may enable it again later.
- The used backup code is deleted immediately. The old code set is replaced by a fresh 10-code set for the new master password.
- Older encrypted recovery points are removed after the new password is established so old-password recovery history is not retained unnecessarily.
- Security email wording now explains that the remaining old code set will be replaced when the new master password is set.

## Database
No Supabase SQL is required for Ver-1.023. It uses the existing Emergency Backup Codes and vault snapshot tables introduced by earlier builds.

## Testing priorities
1. Open Settings and confirm Emergency Backup Codes does not briefly show “Set up” when 10 codes already exist.
2. Generate a new set and confirm the popup uses two buttons per row with sensible padding and a final Done button.
3. Confirm the configured Settings section is compact and does not repeat the first-time information overload.
4. Lock the vault and recover using an unused Emergency Backup Code.
5. Confirm normal vault interaction remains blocked until a new master password is entered and confirmed.
6. Confirm the new master password opens the vault after relocking.
7. Confirm the old master password and used backup code no longer work.
8. Confirm a fresh set of 10 backup codes is presented after the password change.
9. If documents/pictures are stored externally, open several after the password change to confirm successful re-encryption.
10. If Secure Device Unlock was enabled, confirm it must be deliberately set up again after the password change.
