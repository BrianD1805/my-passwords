# Password-Encrypt Ver-1.031.1

## Checklist interaction fixes

Ver-1.031.1 improves mobile reordering, inline editing and saving without reintroducing the old Edit popup.

## Reliable mobile movement

- Finger reordering now uses one dedicated native touch path instead of competing touch and pointer handlers.
- A parallel browser pointer-cancel event can no longer terminate the active finger drag.
- The long-press delay is slightly shorter and allows normal small finger movement before activation.
- Keep the finger pressed after the item highlights, then move through one or several positions in either direction.
- Normal list scrolling remains available before a long press becomes an active drag.
- Edge auto-scroll and the open/completed group boundary remain protected.

## Inline item editing

- Tapping item text opens its inline editing state without automatically focusing the field or opening the mobile keyboard.
- This allows the item delete button to be used immediately.
- Tap inside the text field when text editing is actually required.
- The editor is now a wrapping text area, so long item text remains visible instead of extending off the left edge.

## Background saving

- Checklist changes are saved automatically after 1.8 seconds without another edit.
- Several quick edits, additions or reorders are batched into one background save.
- Editing remains available while a background save is running.
- Revision tracking ensures changes made during a save are included in the next save.
- Background failures do not start an unlimited retry loop. A later edit or manual Save & close can retry.
- Background offline saves do not interrupt the checklist with an offline popup.
- `Save & close` is enabled only while unsaved changes remain and is greyed out after the background save completes.
- Closing by the header X, backdrop, hardware Back or the new menu action waits for outstanding changes to save first.

## Three-dot menu

- Added `Close list` as the final menu action.
- Existing rename, favourite, completion position, strike-through and whole-checklist delete actions remain unchanged.

## Version alignment

- App: Password-Encrypt Ver-1.031.1
- package.json/package-lock.json: 1.31.1
- Service worker cache: my-passwords-v1.031.1
- Server APP_VERSION: Password-Encrypt Ver-1.031.1

## Deployment notes

- No Supabase SQL migration is required.
- No Netlify environment-variable change is required.
- Close and reopen the installed app once after deployment so the new service-worker cache takes over.

## Automated verification

- Production build passed.
- 382 automated checks passed.
- The Ver-1.031.1 feature suite contains 67 checks, including dedicated regression coverage for touch-drag ownership, pointer-cancel isolation, multi-position movement, background-save batching, bounded failure behaviour, disabled Save & close state, keyboard suppression, long-text wrapping and the Close list menu action.
