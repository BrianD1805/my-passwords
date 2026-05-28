# My Passwords Ver-0.014G

Premium account verification UX polish on top of Ver-0.014F.

## What changed
- Combined mobile country selection and number entry into one app-style Mobile number field.
- Shows the selected country as a flag inside the phone field.
- Changed visible "Backup email" wording to "Email".
- Moved the one-time-code guidance above the Email/SMS toggle.
- Added clearer customer-facing guidance for receiving a one-time code.
- Added premium animated verification popups for:
  - sending the email code,
  - verifying the one-time code,
  - opening/unlocking the vault.
- Added large tick/cross result states for verification success/failure.
- Added a visible "Enter master password" next-step button after account verification.

## Safety
- No Supabase SQL changes.
- No encryption changes.
- No sync engine changes.
- No vault snapshot changes.
- OTP behaviour remains staged; this is a UX polish patch.

## Dependency safety
- Package lock remains on public npm registry only.
- No internal sandbox registry URLs.
- No react-refresh or @vitejs/plugin-react dependency.
