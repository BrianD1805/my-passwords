# My Passwords Ver-0.005 — Improved Vault Forms, Snapshot History and Admin/Sync Layout Polish

## Summary

Ver-0.005 builds on the confirmed stable Ver-0.004 Supabase foundation.

This patch keeps Netlify hosting, GitHub deploy, Netlify Functions and Supabase as the active database layer.

## What changed

- Bumped visible app/function version to `My Passwords Ver-0.005`.
- Improved the Add encrypted item form with category-aware placeholders.
- Added a show/hide button for the new item secret field.
- Added a favourite checkbox when adding an item.
- Added favourite toggle buttons on saved vault cards.
- Favourites now sort above normal items.
- Added copy URL and copy notes buttons.
- Added cloud snapshot count to the dashboard.
- Added a visible Cloud snapshot history panel.
- Added a Snapshot history button that loads the latest five Supabase snapshots.
- `sync-vault` now supports history lookup with `history=1`.
- The sync success message now includes cloud snapshot count.
- Tidied the admin/sync status layout so messages are easier to see.

## Local testing

Run from the Program Files folder:

```bat
npm install
npm run build
npm run dev
```

## Deploy commands

```bat
git status
git add .
git commit -m "My Passwords Ver-0.005 improve vault forms and snapshot history"
git push origin main
```

## Netlify environment variables

Keep:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

The old Netlify Database variable is no longer needed.

## Live tests after deploy

Health:

```text
https://brians-password-vault.netlify.app/.netlify/functions/health
```

Database health:

```text
https://brians-password-vault.netlify.app/.netlify/functions/db-health
```

In-app tests:

1. Unlock the vault.
2. Add a new encrypted item using the improved form.
3. Mark it as favourite.
4. Sync encrypted vault.
5. Click Snapshot history.
6. Confirm the snapshot count increases and the latest snapshot row appears.

## Notes

This version still stores the real vault content as an encrypted snapshot. Supabase receives encrypted blobs, salt and IV metadata, not readable passwords.
