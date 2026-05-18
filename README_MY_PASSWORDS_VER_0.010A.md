# My Passwords Ver-0.010A — App-style in-field vault actions

This patch is a focused UX polish pass after Ver-0.010.

## What changed

- Vault item details now use app-style field blocks.
- Username, password/secret, URL and notes copy controls are inside the field area.
- Password reveal/hide is inside the password field beside the copy icon.
- Removed the old bulky text action buttons under/next to fields.
- Preserved the Ver-0.010 edit item flow.
- Preserved the existing encrypted save and auto-sync engine.
- Bumped visible app version to My Passwords Ver-0.010A.
- Bumped service worker cache to my-passwords-v0.010A.
- Bumped Netlify function version to My Passwords Ver-0.010A.

## Supabase

No Supabase SQL changes are required for this patch.

## Local testing

npm install
npm run build
npm run dev

## Deploy

git status
git add .
git commit -m "My Passwords Ver-0.010A app-style in-field vault actions"
git push origin main
