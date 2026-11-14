# Password-Encrypt Ver-1.030.06

## Checklist data-panel scrolling

- Corrects Ver-1.030.05, which restored scrolling on the surrounding popup but did not give the checklist rows their own scroll area.
- The checklist rows now sit inside a dedicated, height-limited `checklist-lines-scroll` data panel.
- The progress heading, completed-item count and progress bar remain fixed above the scrolling rows.
- Swiping directly over any normal checklist row scrolls this inner data panel.
- The gesture records and changes the inner panel's own scroll position instead of the surrounding popup position.
- Read-only imported checklist rows retain normal vertical touch scrolling.

## Reordering retained

- A normal immediate swipe scrolls the checklist rows.
- A stationary 420 ms press highlights the selected row and switches the gesture to reordering.
- Stable checklist-panel pointer capture continues to support repeated downward and upward movement.
- No permanent handles or arrow controls have been added to the view screen.

## Regression protection

- Confirms the checklist rows are wrapped by the dedicated scroll area.
- Confirms the inner data panel has bounded height and vertical overflow.
- Confirms swipe handling targets `checklist-lines-scroll`, not `item-popup-card`.
- Confirms the progress summary remains outside the scrolling rows.
- Retains all Ver-1.030.05 multi-position reorder checks.

## Deployment notes

- No Supabase SQL migration is required.
- No new environment variables are required.

## Version alignment

- App: Password-Encrypt Ver-1.030.06
- package.json/package-lock.json: 1.30.6
- Service worker cache: my-passwords-v1.030.06
- Server APP_VERSION: Password-Encrypt Ver-1.030.06
