# Password-Encrypt Ver-1.030.09

## Checklist view scrolling correction

Ver-1.030.09 removes the checklist's separate inner scrolling panel from the view screen.

The previous design had two vertical scroll areas inside the same popup:

- the popup body;
- the checklist rows panel.

It also inherited an older mobile rule that disabled normal touch panning on checklist rows. Later overrides attempted to compensate for that structure, but the nested scrolling design remained unreliable on the affected phone.

## Changes

- Removed the `checklist-lines-scroll` wrapper from the checklist view markup.
- Removed all dedicated checklist-panel height, overflow and overscroll CSS.
- Removed the checklist panel border, background, rounded corners and padding.
- Made the popup body the only scrolling surface for the whole checklist view.
- Explicitly restored native `pan-y` behaviour when a swipe begins on an unselected checklist row or its checkbox/text button.
- Kept `touch-action: none` limited to a row that has already been selected for reordering.
- Kept the progress summary, checklist items and updated date in the same continuous scroll.
- Retained the uncluttered long-press reorder and selected-row delete behaviour.

## Version alignment

- App: Password-Encrypt Ver-1.030.09
- package.json/package-lock.json: 1.30.9
- Service worker cache: my-passwords-v1.030.09
- Server APP_VERSION: Password-Encrypt Ver-1.030.09

## Deployment notes

- No Supabase SQL migration is required.
- No Netlify environment-variable change is required.
- After deployment, close and reopen the installed app once so the Ver-1.030.09 service worker cache takes over.

## Automated verification

- Production build passed.
- 377 automated checks passed.
- The feature regression suite contains 62 checks, including explicit checks that the nested panel no longer exists and that mobile row swipes use the single popup-body scroll surface.

