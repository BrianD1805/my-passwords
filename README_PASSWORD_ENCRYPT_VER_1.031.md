# Password-Encrypt Ver-1.031

## Checklist UX and one-screen editing

Ver-1.031 removes the separate Edit workflow for existing checklists and makes the checklist View screen the single place for everyday use and editing.

## Checklist screen

- Every checklist item is now shown as its own rounded card.
- Tapping an item's text edits that item inline.
- The circular check control alone marks an item complete or incomplete.
- Completed text receives the tick and optional strike-through; tapping elsewhere on the row does not toggle it.
- Adding an item uses a rounded inline control matching the checklist design.
- Progress remains visible in the fixed header and shows completed count, total count and percentage.
- Item text remains normal weight and header pills keep their compact padding.
- An individual item can be deleted from its inline editing state.

## Draft and save behaviour

- Adding, renaming, ticking, deleting and reordering checklist items changes an in-memory draft first.
- Draft changes do not save or show a separate notification after each action.
- `Save & close`, the header close button, the backdrop and hardware Back all use the same final save-on-exit path.
- One successful `Checklist saved.` confirmation is shown after the final write.
- If the final save fails, the checklist stays open so the user can try again.
- An unchanged checklist closes without making an unnecessary write.

## Three-dot checklist menu

- Rename checklist.
- Add to or remove from favourites.
- Keep completed items in place or move them to the bottom.
- Turn completed-item strike-through on or off.
- Delete the whole checklist.
- Whole-checklist deletion uses a clear confirmation explaining that the checklist and every item inside it will be deleted, distinct from deleting one item.

## Mobile reordering

- Press and hold an item, keep the finger down, then move it in one continuous gesture.
- The old lift-and-press-again phase has been removed.
- Both upward and downward movement support multiple positions in one gesture.
- Dragging near the top or bottom automatically scrolls the popup body.
- The normal checklist screen stays uncluttered with no permanent handles or arrow controls.
- The popup body remains the one scrolling surface; checklist rows do not create a nested scrolling panel.

## Version alignment

- App: Password-Encrypt Ver-1.031
- package.json/package-lock.json: 1.31.0
- Service worker cache: my-passwords-v1.031
- Server APP_VERSION: Password-Encrypt Ver-1.031

## Deployment notes

- No Supabase SQL migration is required.
- No Netlify environment-variable change is required.
- Close and reopen the installed app once after deployment so the new service-worker cache takes over.

## Automated verification

- Production build passed.
- 372 automated checks passed.
- The Ver-1.031 feature suite contains 57 checks covering the one-screen draft workflow, inline editing, separate tick control, rounded cards and add control, three-dot actions, whole-checklist confirmation, one-gesture mobile reordering, auto-scroll and single-save behaviour.
