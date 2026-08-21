# Password-Encrypt Ver-1.014 — First-Time Guided Help & Home Folder Improvements

## What changed

- New users are offered an interactive guided tour after their first successful vault entry.
- The tour explains search, Home folders, New folder, the folder three-dot button, Add item, Favourites, Vault Status, Settings, Help and Lock.
- Tour state is saved against the authenticated user account with a device fallback so Firefox reload/storage behaviour does not strand the guide.
- Maybe later re-offers the tour after 24 hours; Skip tour stops automatic prompts; the tour can always be run again from Settings → Help and support.
- New vaults start with Passwords, Cards, Bank Details, Notes and Documents selected as Home folders.
- Creating a custom folder now asks whether it should be added to Home.
- Users may select as many Home folders as they want. On mobile, extra Home folders are available through a Show more / Show fewer control rather than being silently hidden.
- Manage folders wording now explains the house button, custom-folder pencil and Home overflow behaviour.

## Database

Run `db/migrations/2026-08-21_guided_tour_ver_1_014.sql` before publishing.
