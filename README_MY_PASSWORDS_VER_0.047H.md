# My Passwords Ver-0.047H

## Android Back navigation controller rebuild

This patch replaces the previous Back-button implementation after the earlier history guard did not reliably receive Android/Samsung PWA Back gestures.

### Root cause corrected

The previous controller depended on a committed `popstate` traversal and then tried to rebuild the same browser-history guard. On affected installed PWAs, the first Back gesture could consume the guard without applying the React UI action, leaving the next Back gesture free to close the application.

### Changes

- Uses a distinct same-document Back boundary instead of duplicate identical URL entries.
- Handles Chrome/Android Navigation API `traverse` events before relying on the older `popstate` fallback.
- Keeps independent `popstate` and `hashchange` fallbacks for other browsers.
- Centralises every Back action in one controller:
  - open popup or selector: close it;
  - open password/item: return to password search;
  - Settings: return to password search;
  - password-search home: open **Leave My Passwords?**;
  - locked vault login with no popup: allow the device Back action normally.
- Re-establishes the Back boundary after each consumed action and when an installed PWA resumes.
- Adds a guard-integrity check while the unlocked app is active so a browser resume cannot silently remove the boundary.
- Keeps the approved Ver-0.047F popup green edge unchanged.

## Database

No Supabase SQL changes are required.

## Local testing

```bat
npm run build
netlify dev --no-open
```

After Netlify reports port 8888 is ready, open `http://localhost:8888` manually.
