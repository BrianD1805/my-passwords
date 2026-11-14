# Password-Encrypt Ver-1.030.01

## Normal checklist editor

- Removes the visible `[ ]` and `[x]` storage markers from checklist edit mode.
- Presents every checklist entry as a normal editable app row with its own completion control.
- Adds an item button and Enter-key shortcut for adding rows.
- Adds a clear delete control for each row.
- Keeps existing checklist data compatible by converting the clean editor rows back to the established encrypted storage format when saving.

## Reordering

- Desktop: drag an item using its grip handle.
- Mobile and tablet: press and hold the grip for 420 milliseconds, then drag the item to its new position.
- Keyboard: focus the grip and press the Up or Down arrow key.
- Button fallback: use the small up/down controls beside the item.
- Provides a raised, tinted visual state while an item is being moved.
- Supports checklists of any practical length without a reorder-attempt limit.

## Preserved Ver-1.030 behaviour

- Live progress bar and completed-of-total count.
- Choice to keep completed items in place or show them at the bottom.
- Choice to show or remove completed-item strikethrough.
- Existing checklists retain their previous display behaviour.

## Deployment notes

- No Supabase SQL migration is required.
- No new environment variables are required.
- Deploy the complete project normally through Netlify.

## Version alignment

- App: Password-Encrypt Ver-1.030.01
- package.json/package-lock.json: 1.30.1
- Service worker cache: my-passwords-v1.030.01
- Server APP_VERSION: Password-Encrypt Ver-1.030.01
