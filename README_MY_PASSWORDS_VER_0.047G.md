# My Passwords Ver-0.047G — Android Back Navigation Guard Rebuild

## Critical correction

- Rebuilt the Android/PWA Back guard so it no longer trusts a stale browser-history marker left behind by an earlier page load or restored PWA session.
- Every fresh app load now creates its own uniquely identified Back-guard pair.
- The password-search home screen opens the **Leave My Passwords?** confirmation on the first device Back press.
- Settings returns to the password-search home screen on the first Back press, then opens the confirmation on the next Back press.
- Open popups, item views, folder management, custom selectors and the mobile menu close before app-level navigation is considered.
- The listener is active throughout the My Passwords app rather than depending on one exact route spelling.
- `/vault/`, `/app/` and `/login/` trailing-slash routes are normalised.
- Stripe return URL cleanup now preserves and recreates the active Back guard instead of erasing it.
- The locked vault login page does not show the home-page leave confirmation.

## Existing Ver-0.047F popup correction retained

- The approved green popup edge, top-right curve and right-side fade are unchanged.
- The pale outer line beside the green edge remains removed.

## Local testing

Run from the current project directory:

```bat
npm run build
netlify dev --no-open
```

After Netlify reports that port 8888 is ready, manually open `http://localhost:8888`.

## Database

No Supabase SQL is required for this patch.
