# Password-Encrypt Ver-1.030.07

## Android-native checklist scrolling

- Replaces the unsuccessful JavaScript-driven checklist scrolling used in Ver-1.030.05 and Ver-1.030.06.
- Confirms the underlying blocker was the older mobile `.checklist-line { touch-action: none; }` rule.
- The final mobile cascade now applies `touch-action: pan-y !important` to the checklist scroll panel, every row and every row button.
- Ordinary swipes beginning directly on a checkbox, item text or blank row area are handled by Android's native scrolling.
- Touch pointer capture is no longer started for Android fingers; the pointer path is restricted to a pen.

## Long-press reordering retained

- The reorder timer still activates after a stationary 420 ms hold.
- A captured, non-passive touch listener takes control only after long-press activation.
- Movement before activation cancels the reorder timer and remains available to native scrolling.
- Movement after activation is prevented from scrolling and instead reorders the highlighted row.
- Downward and upward multi-position calculations remain symmetrical.

## Regression protection

- Confirms the old `touch-action: none` declaration is overridden by the final native `pan-y` rule.
- Confirms touch scrolling no longer depends on JavaScript `scrollTop` changes.
- Confirms movement before the hold returns control to native scrolling.
- Confirms the reorder listener is non-passive and only prevents the gesture after activation.
- Confirms pointer capture cannot compete with Android touch input.
- Retains the dedicated checklist panel, fixed progress summary and multi-position reorder checks.

## Deployment notes

- No Supabase SQL migration is required.
- No new environment variables are required.

## Version alignment

- App: Password-Encrypt Ver-1.030.07
- package.json/package-lock.json: 1.30.7
- Service worker cache: my-passwords-v1.030.07
- Server APP_VERSION: Password-Encrypt Ver-1.030.07
