# My Passwords Ver-0.047C — Popup Focus and Mobile Back Navigation

## Build summary

- Removed automatic focus from popup input fields so mobile keyboards open only after the customer selects an input.
- Clears any active input focus when a popup opens or changes to another input step.
- Increased the popup green top accent from 3px to 6px.
- Keeps the green accent off the left side and fades it shortly after the top-right corner.
- Added mobile/browser Back handling for the vault route.
- Back closes an open dropdown or popup first.
- Back from Settings returns to the Passwords home page.
- Back from the Passwords home page opens a confirmation popup instead of immediately closing the app.
- No database migration is required.
- Master-password, encryption, account recovery, SMS and subscription logic are unchanged.
