# Password-Encrypt Ver-1.031.3

## Checklist popup refinements

Ver-1.031.3 tidies the checklist header and footer and adds clear save-before-close feedback when a checklist still has changes being written.

## Footer and header

- The checklist `Updated` date and time is centred in the popup footer.
- The small shield/checklist icon to the left of the checklist title is hidden on mobile only.
- The checklist title is two pixels smaller and uses a slightly lighter font weight on desktop and mobile.
- The background-save indicator beside the three-dot menu remains available and unchanged.

## Save-before-close feedback

- Clicking the header X while a checklist is saving, or while changes still need saving, opens a blocking `Hang on…` popup.
- The popup explains that Password-Encrypt is saving the changes before closing.
- A rotating save icon and moving progress bar provide visible save animation.
- The popup remains visible if edits made during the first save require a follow-up save.
- After a successful save, the checklist closes automatically.
- If the save fails, the waiting popup closes, the checklist stays open and the existing error message is shown.
- Backdrop, hardware Back and three-dot `Close list` behaviour remain unchanged.

## Version alignment

- App: Password-Encrypt Ver-1.031.3
- package.json/package-lock.json: 1.31.3
- Service worker cache: my-passwords-v1.031.3
- Server APP_VERSION: Password-Encrypt Ver-1.031.3

## Deployment notes

- No Supabase SQL migration is required.
- No Netlify environment-variable change is required.
- Close and reopen the installed app once after deployment so the new service-worker cache takes over.

## Automated verification

- Production build passed.
- 396 automated checks passed.
- The Ver-1.031.3 feature suite contains 81 checks, including dedicated coverage for the centred footer, smaller/lighter title, mobile icon removal, save-wait popup activation, save animation, successful automatic close and failure recovery.
