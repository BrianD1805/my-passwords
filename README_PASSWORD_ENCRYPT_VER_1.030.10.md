# Password-Encrypt Ver-1.030.10

## Checklist workflow improvements

Ver-1.030.10 simplifies editing and makes everyday checklist use faster from the View screen.

## Edit screen

- Removed the completed/not-completed tick control from existing checklist rows.
- Removed the six-dot drag grip and its obsolete long-press editor code.
- Existing checklist rows now show only the item text, up/down reorder buttons and delete button.
- Removed Add checklist item from an existing checklist's Edit screen.
- New-checklist creation still allows item entry so a checklist can be created normally.
- Completion position and strike-through options remain available.

## View screen

- Added a compact Add checklist item entry at the bottom of the list.
- Pressing Add or Enter saves the new item immediately without opening Edit or pressing a separate Save button.
- Checklist item text is explicitly normal weight instead of inheriting bold popup-button styling.
- Reduced the top and bottom padding inside the category/favourite pills.
- Moved progress into the fixed popup header so it remains visible while the checklist scrolls.
- Progress now shows the completed count and percentage, for example `4 of 10 · 40%`.
- The progress bar remains accessible to screen readers.

## Version alignment

- App: Password-Encrypt Ver-1.030.10
- package.json/package-lock.json: 1.30.10
- Service worker cache: my-passwords-v1.030.10
- Server APP_VERSION: Password-Encrypt Ver-1.030.10

## Deployment notes

- No Supabase SQL migration is required.
- No Netlify environment-variable change is required.
- Close and reopen the installed app once after deployment so the new service-worker cache takes over.

## Automated verification

- Production build passed.
- 379 automated checks passed.
- The Ver-1.030.10 feature suite contains 64 checks covering the simplified editor, immediate View-screen add, fixed header progress, percentage display, normal-weight item text and reduced pill padding.

