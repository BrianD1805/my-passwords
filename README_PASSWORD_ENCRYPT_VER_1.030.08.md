# Password-Encrypt Ver-1.030.08

## Native checklist scrolling without gesture competition

- Confirms Ver-1.030.07 was deployed and its `pan-y` override was present, ruling out a stale deployment.
- Removes the document-level touch listener used to combine scrolling and reordering in one gesture.
- Removes all touch-start interception from unselected checklist rows.
- An unselected row is now an ordinary Android-native vertical scroll surface.
- Removes the outer popup card as a third competing scroll container; the popup body and checklist list remain the intentional scrolling areas.

## Two-stage mobile reordering

- Hold a row still for 420 ms to select and highlight it.
- Lift the finger after the selection message appears.
- Drag the already-highlighted row up or down with a new gesture.
- Pointer capture begins only for this second drag gesture.
- Only the selected row disables native panning; all other rows remain scrollable.
- No permanent handles or arrows are added to the view screen.

## Why the interaction changed

- Android native scrolling and same-gesture long-press dragging were competing for ownership of the first touch.
- CSS overrides alone could not guarantee which path Android selected.
- Separating selection from dragging removes that competition completely.
- Scrolling no longer depends on JavaScript `scrollTop`, `touchmove` or a non-passive document listener.

## Regression protection

- Confirms unselected rows have no touch listener or document touch interception.
- Confirms movement before selection cancels the timer without preventing native scrolling.
- Confirms pointer capture starts only for an already-selected row.
- Confirms only the selected row receives `touch-action: none`.
- Confirms the outer card is fixed rather than being a third scroll container.
- Retains the dedicated checklist panel and multi-position reorder tests.

## Deployment notes

- No Supabase SQL migration is required.
- No new environment variables are required.

## Version alignment

- App: Password-Encrypt Ver-1.030.08
- package.json/package-lock.json: 1.30.8
- Service worker cache: my-passwords-v1.030.08
- Server APP_VERSION: Password-Encrypt Ver-1.030.08
