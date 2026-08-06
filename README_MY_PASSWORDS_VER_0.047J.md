# My Passwords Ver-0.047J

## Android Back request root replacement

- Removed the artificial `pushState` / `popstate` Back controller completely.
- Uses the browser `CloseWatcher` API for Android Back gestures/buttons and desktop Escape close requests.
- Keeps one app-level watcher active while the vault is unlocked or a dismissible login popup is open.
- Recreates the watcher before React updates the current popup/page, preventing a rapid second Back press from falling through.
- Password-search home opens the Leave My Passwords confirmation on the first Back request.
- Settings returns to password-search home; open popups, item views, menus and folder management close first.
- The plain locked vault login has no watcher, so native Back can leave normally.
- Removes current-entry and session markers left by Ver-0.047C through Ver-0.047I without creating new history entries.
- Keeps the approved Ver-0.047F popup green accent unchanged.
- Local Netlify testing remains `netlify dev --no-open`.

No Supabase SQL is required.
