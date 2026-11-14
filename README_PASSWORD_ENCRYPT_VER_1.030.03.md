# Password-Encrypt Ver-1.030.03

## Precise mobile checklist movement

- Replaces target-following drag behaviour with measured row-height movement.
- Moving a finger by one row-height moves the selected checklist item by exactly one position.
- A stationary finger cannot trigger extra movements as the surrounding rows rearrange.
- The same measured movement is used in edit mode and the checklist view screen.
- Each movement gives light vibration feedback where the device supports it.

## Uncluttered mobile view screen

- Press and hold directly on a checklist row to select and highlight it.
- Slide the highlighted row upward or downward to reorder it.
- Adds no drag handles or arrow buttons to the view screen.
- Only the selected row shows a single `×` delete control, following the compact Google Keep pattern.
- The final reordered list is encrypted and saved when the gesture finishes, instead of saving repeatedly while the finger is moving.

## Preserved behaviour

- A normal tap still checks or unchecks the item.
- Existing progress, completed-position and strikethrough choices remain available.
- Existing checklist storage remains compatible.
- Desktop view remains unchanged and uncluttered.

## Deployment notes

- No Supabase SQL migration is required.
- No new environment variables are required.

## Version alignment

- App: Password-Encrypt Ver-1.030.03
- package.json/package-lock.json: 1.30.3
- Service worker cache: my-passwords-v1.030.03
- Server APP_VERSION: Password-Encrypt Ver-1.030.03
