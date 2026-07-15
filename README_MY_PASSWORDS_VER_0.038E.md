# My Passwords Ver-0.038E — Secure device unlock counter reset fix

Fixes the forced password reminder after 10 secure-device unlocks so that a successful master-password unlock resets the quick-unlock counter back to 0.

## Changes
- Password confirmation now resets `quickUnlockCount` after every successful master-password unlock path.
- Fixes the cloud-restore path where the password unlock could succeed but the secure-device counter did not restart.
- The password-check prompt no longer focuses the hidden/input field automatically; it tells the user to type the password and use Unlock Local Vault.
- No Supabase SQL changes required.
