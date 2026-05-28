# My Passwords Ver-0.013A — OTP Foundation for New-Device Restore, Test Mode Only

This patch adds the safe foundation for OTP-based new-device restore without enabling live SMS/email delivery and without making OTP mandatory.

## Safety position

This app is now being used with live real passwords, so this patch is deliberately additive and low-risk.

- Existing encrypted local vault data is not changed.
- Existing encrypted Supabase snapshots are not changed.
- The encryption/decryption engine is not rewritten.
- Local-first daily unlock remains unchanged.
- OTP is not enforced, so there is no lockout risk.
- Test OTP codes are temporary challenge records in Supabase.

## What changed

- Added `otp_challenges` Supabase table for temporary OTP challenge records.
- Added `request-otp-test` Netlify Function.
- Added `verify-otp-test` Netlify Function.
- Added locked-screen test-mode OTP panel for new/cleared-device restore flow.
- Added in-app OTP foundation panel.
- OTP code is returned on-screen in test mode only. No SMS or email is sent.
- OTP records store a hash of the OTP code, not the plain code.
- Added expiry and attempt tracking foundation.
- Bumped app version to `My Passwords Ver-0.013A`.
- Bumped service worker cache to `my-passwords-v0.013A`.

## Supabase SQL required

Run:

`db/migrations/2026-05-28_otp_foundation_test_mode_ver_0_013A.sql`

## Local testing

```bash
npm install
npm run build
npm run dev
```

## Deploy

```bash
git status
git add .
git commit -m "My Passwords Ver-0.013A OTP foundation test mode"
git push origin main
```

## Suggested test

1. Run the SQL migration in Supabase.
2. Deploy the patch.
3. Unlock normally on a device with an existing local vault.
4. Use the in-app OTP foundation panel to create a test OTP.
5. Enter the displayed test code and verify it.
6. Confirm the vault still unlocks normally and no OTP lockout has been introduced.

## Next likely patch

Ver-0.013B should connect a real provider only after test-mode is confirmed. Provider options include Supabase Auth with a configured SMS provider, Twilio, Vonage, MessageBird, Africa's Talking, or email OTP as a backup.
