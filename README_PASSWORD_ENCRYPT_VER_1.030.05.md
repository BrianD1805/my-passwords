# Password-Encrypt Ver-1.030.05

## Reliable mobile checklist movement

- Fixes the underlying reason a checklist item could move down once and then stop.
- The phone gesture is now captured by the stationary checklist panel instead of the row being moved.
- React can therefore relocate the selected row without ending the active gesture.
- Downward movement now continues for the full finger travel, matching the already-correct upward behaviour.
- The same stable-parent handling is used in checklist edit mode and the uncluttered checklist view.

## Scrolling inside the checklist panel

- Removes the old popup rule that forced the item card to hide overflow.
- Restores the popup as a proper bounded vertical scroll area.
- Moving a finger before the 420 ms hold threshold scrolls the panel from anywhere over a checklist row.
- Holding still until the row highlights switches the gesture to reordering.
- The view screen remains uncluttered: no permanent handles or arrow controls were added.

## Regression protection

- Confirms pointer capture belongs to the stationary editor list and view checklist.
- Confirms a row itself no longer owns the move, release or cancellation handlers.
- Confirms movement received as one larger phone event can cross several positions in either direction.
- Confirms an ordinary swipe over a row scrolls the item popup.
- Confirms the popup's final style restores vertical overflow after the older legacy rule.

## Deployment notes

- No Supabase SQL migration is required.
- No new environment variables are required.

## Version alignment

- App: Password-Encrypt Ver-1.030.05
- package.json/package-lock.json: 1.30.5
- Service worker cache: my-passwords-v1.030.05
- Server APP_VERSION: Password-Encrypt Ver-1.030.05
