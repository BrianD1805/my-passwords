# My Passwords Ver-0.022

## SaaS landing page polish and Create Account onboarding popup

This patch builds on Ver-0.021A and keeps the public SaaS landing page separate from the private PWA vault login.

## Main changes

- Polished the public SaaS landing page at `/`.
- Added a proper **Create Account** onboarding popup that is available only from the landing page.
- The popup collects account/profile details, plan foundation choice and security confirmation before sending the user to `/vault` for OTP and master password setup.
- Kept `/vault`, `/app` and `/login` as private vault routes.
- Kept the installed PWA start URL as `/vault`.
- Updated app version to **My Passwords Ver-0.022**.
- Updated the service worker cache name to avoid old landing-page assets sticking after deployment.

## Safety notes

- No encrypted vault storage logic changed.
- No document blob storage logic changed.
- No cloud snapshot sync logic changed.
- No destructive migration included.
- No new Supabase SQL is required for this patch; the Ver-0.021 SaaS account foundation SQL remains the current database foundation.

## Local testing

Run:

```bat
npm install
npm run build
npm run dev
```

Check:

- `http://localhost:5173/` shows the polished SaaS landing page.
- The **Create Account** button opens the onboarding popup.
- The popup footer stays visible and the body scrolls inside the popup.
- Completing the popup sends the user to `/vault`.
- `http://localhost:5173/vault` still shows the standalone private vault login/unlock page.
- Existing live vault unlock, sync and document download/upload behaviour remains unchanged.
