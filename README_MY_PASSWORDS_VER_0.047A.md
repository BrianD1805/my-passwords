# My Passwords Ver-0.047A — Minor Login and Recovery UX Edits

This corrective patch refines the locked-vault page without changing account recovery, OTP, SMS, session, encryption or vault-decryption logic.

## Changes

- Removed the duplicated visible “Master vault password” label above the unlock field while retaining an accessible input label for screen readers.
- Renamed “Sign in / recover account access” to “Recover account access”.
- Kept the locked-vault screen uncluttered by showing only the “Recover account access” action.
- Moved all guidance explaining when recovery should be used into the recovery popup.
- Clarified inside the popup that account recovery restores account and subscription services but does not open or decrypt the vault.
- Simplified the green security panel to: “Only your master password opens your vault.”

## Database

No Supabase SQL is required.
