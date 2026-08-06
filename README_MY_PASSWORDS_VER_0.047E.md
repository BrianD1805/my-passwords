# My Passwords Ver-0.047E — Back Navigation and Folder Layout Fixes

## Build summary

- Rebuilt the mobile device Back handler around one deterministic vault-route guard instead of relying on delayed React effects.
- The unlocked Passwords search screen now opens the leave-app confirmation on its first device Back press.
- Settings returns to the Passwords search screen first; the next Back press opens the leave confirmation.
- Open popups, dropdowns, item views and menus close before any page-level Back action.
- The locked vault login page never displays the Passwords-home leave confirmation.
- Removed the stale Back suppression flag that could cause the first press to be ignored and the second press to close the PWA.
- Reduced the popup green top/right accent from 9px to 6px.
- Removed the popup's physical top border so no white one-pixel outline remains above the green accent.
- Kept the green accent fade down approximately half of the popup's right side.
- Reordered Manage folders controls into fixed columns: Edit, item count, Home. Built-in folders reserve the Edit column so every row stays aligned.
- Local Netlify testing remains browser-manual and uses `netlify dev --no-open`.
- No database migration is required.
- Vault encryption, account recovery, SMS, subscriptions and cloud-sync data logic are unchanged.
