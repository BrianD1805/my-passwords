# My Passwords Ver-0.047I

## Android hardware Back controller replacement

This build removes the previous Navigation API, hash-change, history-forward, and route-level Back guard implementation.

The replacement controller is installed before React renders and owns one same-document history guard for `/vault`, `/app`, and `/login`.

- Every hardware Back traversal is re-armed synchronously before React changes popup or page state.
- The React layer consumes the Back action using the latest rendered state.
- Open overlays, popups, password items, folder management, and menus close first.
- Settings returns to the password-search home screen.
- Back on the password-search home screen opens the Leave My Passwords confirmation.
- The locked vault screen exits without showing the home warning.
- Legacy Ver-0.047H hash/history markers are removed during startup.
- Exit traverses through any same-document guard entries left by earlier patches.
- Service-worker registration bypasses the HTTP cache for update checks.
- The approved Ver-0.047F popup green edge remains unchanged.
- Local Netlify testing uses `netlify dev --no-open`.

No Supabase SQL is required.
