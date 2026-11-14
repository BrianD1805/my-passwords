# Password-Encrypt Ver-1.030.02

## Checklist reordering correction

- Removes the dotted drag-handle button from the desktop checklist editor.
- Desktop checklist rows retain the small, dependable up and down controls.
- Mobile and tablet retain the dotted press-and-hold handle.
- Pressing and holding for 420 milliseconds highlights the entire selected row.
- Sliding the highlighted row upward or downward changes its position.
- Removes browser-native dragging from the mobile handle so it cannot compete with the app's touch interaction.
- Allows a small amount of natural finger movement while the long press is being recognised.
- Releases and resets pointer capture after every attempt so reordering continues to work repeatedly.

## Preserved behaviour

- Checklist edit mode continues to hide raw `[ ]` and `[x]` storage markers.
- Existing checklists remain compatible.
- Add, complete and delete controls remain available.
- Progress, completed-position and strikethrough options remain unchanged.

## Deployment notes

- No Supabase SQL migration is required.
- No new environment variables are required.

## Version alignment

- App: Password-Encrypt Ver-1.030.02
- package.json/package-lock.json: 1.30.2
- Service worker cache: my-passwords-v1.030.02
- Server APP_VERSION: Password-Encrypt Ver-1.030.02
