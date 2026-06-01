# My Passwords Ver-0.022 — Separate SaaS Landing Page and PWA Vault Login

This patch corrects the Ver-0.021 layout so the SaaS marketing/onboarding foundation is on a separate public landing page, while the installed PWA opens directly to the standalone private vault login/unlock page.

## Key changes

- Root `/` now shows the SaaS landing page.
- `/vault` shows the standalone My Passwords login/unlock screen.
- PWA `start_url` is now `/vault`, so installed app users open directly into the vault login.
- Existing live vault data, encrypted cloud snapshots and document blobs are not changed.
- Existing Ver-0.021 Supabase SaaS foundation SQL remains valid; no extra SQL is required for this layout fix.

## Test URLs

- Public landing page: `/`
- Vault / PWA login page: `/vault`
- Compatibility routes: `/app` and `/login`

## Safety note

This is a routing/layout fix only. It does not clear local storage, alter encryption, change document blob handling, or modify vault sync logic.
