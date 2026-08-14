# Password-Encrypt Ver-1.005 — Emergency Access for Password-Encrypt Users

## Included

- Vault home favourite pill now reads `0 Favourites`, `1 Favourite`, `2 Favourites`, and so on.
- The default Emergency Info `Emergency Access Note` is repurposed as a real Emergency Access hub. Untouched legacy starter items are upgraded automatically; edited user notes are not overwritten.
- A released Emergency Package now offers **Import into my vault** for recipients who already use Password-Encrypt.
- The release token is handed to the existing-customer vault route through short-lived session storage; decrypted emergency contents are not placed in URL parameters or persistent local storage.
- After the nominee unlocks and verifies their own vault, Password-Encrypt re-fetches and decrypts the released package, checks for duplicates, and imports it into a new custom folder named `Emergency Package — <owner>`.
- Imported records preserve their original type for viewing while remaining grouped inside the one received-package folder.
- Released documents are decrypted from the Emergency Access release, then encrypted again with the nominee's own master password and stored through the nominee's normal encrypted document store.
- Item/document plan limits are checked before import. If the nominee's plan cannot hold the complete package, Password-Encrypt does not silently omit protected documents.
- Received packages are listed from the `Emergency Access` item in the default Emergency Info folder.
- Imported package records are treated as read-only archival copies so the received package cannot be accidentally edited into a different record type. They may still be deleted deliberately.
- Renaming a received-package folder keeps its Emergency Access hub reference aligned.

## Database / environment

No new Supabase SQL or Netlify environment variables are required for Ver-1.005.

## Version

- App: Password-Encrypt Ver-1.005
- npm: 1.5.0
- Service-worker cache: my-passwords-v1.005
