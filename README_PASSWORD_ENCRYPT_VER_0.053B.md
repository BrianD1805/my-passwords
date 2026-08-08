# Password-Encrypt Ver-0.053B — Fixes, Improvements & Final Testing

Targeted pre-launch UX and plan-limit pass.

## Included
- Footer tagline: “A trusted place for your private details that matter.” on one desktop line with balanced footer spacing.
- Lighter Admin typography while retaining clear heading/button hierarchy.
- Emergency Access reframed clearly as Next of Kin / Trusted Person access for incapacity and serious emergencies.
- Duplicate document-limit marketing rows removed from plan cards.
- New `item_limit` per subscription plan, editable in Admin, displayed on landing plan cards, enforced for new vault items and cloud snapshot item counts.
- Mobile plan cards use horizontal swipe/scroll-snap instead of stacking.
- My Subscription shows plan usage for vault items, encrypted documents and encrypted document storage, including remaining allocations.

## Database
Run `PASSWORD_ENCRYPT_VER_0.053B_SUPABASE_SQL.sql` before testing this version.

## Version alignment
- App/server: `Password-Encrypt Ver-0.053B`
- npm: `0.0.53-b`
- service worker: `my-passwords-v0.053B`
- patch folder: `password-encrypt-ver-0.053B`
