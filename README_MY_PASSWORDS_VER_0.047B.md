# My Passwords Ver-0.047B — Minor Recovery and Popup UX Edits

## Changes

- Removed the recovery guidance paragraph from the vault login screen.
- Kept the recovery explanation inside the Recover account access popup only.
- Placed Clear local vault on this device and Recover account access on separate lines on desktop and mobile.
- Added 3px more spacing between the Cancel and Send recovery code buttons.
- Refined the popup accent to a 3px green line that fades in across the upper third, wraps the top-right corner smoothly, fades down the right side, and does not create a green left edge or white halo.

## Database

No Supabase SQL changes are required.

## Testing

Run `npm run build` and `npm run netlify:dev`.
