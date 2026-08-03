# My Passwords Ver-0.042K

## Offline startup and PWA application-shell protection

Ver-0.042K prevents a blank startup screen when the device has no internet connection.

### Changes

- The service worker now caches the complete built application shell, including the current JavaScript and CSS assets referenced by `index.html`.
- Successful same-origin static assets are retained in a versioned runtime cache for later offline use.
- Netlify Function requests no longer fall back to `index.html`; while offline they return a clear JSON `503` response that the app can understand.
- Navigation requests use the cached application shell and a dedicated offline fallback page when the network is unavailable.
- `index.html` contains a client-facing startup fallback so a missing JavaScript bundle cannot leave a blank page.
- The Vault displays a clear offline notice while preserving access to the encrypted local vault.
- Vault Safety displays `Offline` instead of incorrectly showing `Up to date` while the connection is unavailable.
- Manual refresh explains that secure backup and syncing need an internet connection.
- Public plans and the secure customer session are checked again automatically when connectivity returns.
- Pending vault backup already continues through the existing automatic online retry flow.
- Admin displays a clear offline screen instead of remaining on an indefinite access-check state.
- Added a React startup error boundary so an unexpected render failure produces a readable recovery screen instead of a blank page.

### Important testing note

After publishing, open My Passwords once while online and allow the page to finish loading. This installs the new service worker and saves the current application files. Then close the PWA, disable internet access and reopen it to test offline startup.

### Database

No Supabase SQL is required.
