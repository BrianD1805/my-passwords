# My Passwords Ver-0.010 — Proper Edit Item Flow

This patch builds on Ver-0.009 and keeps the existing encrypted sync engine untouched.

## What changed

- Added an edit button to each vault card.
- Selecting edit pre-fills the existing item into the left-hand form.
- The form clearly changes into edit mode with an edit banner.
- Save updates the existing item instead of creating a duplicate.
- Cancel edit clears the form without changing the vault.
- Updated items reuse the existing encrypted local save and `autoSync` path.
- Version text, health endpoint and service worker cache name bumped to Ver-0.010.

## What was deliberately not changed

- Supabase schema.
- Netlify Functions sync contract.
- Encryption/decryption model.
- Auto-pull on unlock behaviour.
- Auto-upload after item changes.

## Local test checklist

1. Unlock the vault.
2. Click the pencil/edit button on an existing item.
3. Confirm the form switches to edit mode and pre-fills title, category, URL, username, secret, notes and favourite state.
4. Change the title or notes.
5. Save the updated item.
6. Confirm the card updates rather than duplicating.
7. Confirm a sync/toast message appears.
8. Lock and unlock again.
9. Confirm the edited item remains correct.
10. Test on PWA/mobile after deploy to confirm auto-pull still brings down the edited item.
