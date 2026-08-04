# My Passwords Ver-0.045C — Fixes & Status Panel Upgrade

## What changed

- Restored the Clear local vault action on both the locked vault screen and Vault Safety settings.
- Fixed the undefined local-only risk check that prevented the clear-vault confirmation popup from opening.
- Removed the filled warning/error highlight from the clear-vault control and returned it to a slightly bolder, underlined text link.
- Removed the old native scrollbar arrow buttons from custom dropdown menus.
- Preserved blank top and bottom scrollbar-track space so the scrollbar thumb cannot travel into those end areas.
- Enlarged the Vault Status text and icon in the app header.
- Upgraded the Vault Status control with a premium two-line layout, icon tile, refined gradients, borders, shadows, and distinct safe/warning/neutral states.
- Preserved all existing vault, sync, backup, confirmation, and dropdown selection logic.

## Files updated

- `src/main.jsx`
- `src/styles.css`
- `package.json`
- `package-lock.json`
- `public/sw.js`
- `public/offline.html`
- `netlify/functions/_db.js`

## Database

No Supabase SQL is required for Ver-0.045C.
