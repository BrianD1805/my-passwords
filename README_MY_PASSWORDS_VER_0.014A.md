# My Passwords Ver-0.014A

OTP method UX polish on top of working Ver-0.014 email OTP delivery.

## What changed
- Added a clean Email OTP / SMS OTP toggle.
- Kept Email OTP as the working Resend delivery route.
- Kept SMS OTP in safe test mode only, with no real SMS sent yet.
- Removed the messy separate OTP action buttons.
- Added persistent on-screen verified guidance so the user does not have to rely on a toast.
- After OTP verification, the panel clearly tells the user to enter the master vault password to complete login/restore.

## Safety
- No encryption changes.
- No sync engine changes.
- No Supabase SQL changes.
- No vault snapshot changes.
- OTP is still not enforced, so there is no lockout risk.
