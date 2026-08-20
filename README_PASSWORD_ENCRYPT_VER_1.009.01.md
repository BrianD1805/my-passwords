# Password-Encrypt Ver-1.009.01 — Admin Email Notifications UX

Ver-1.009.01 is a focused Admin UX refinement of the Ver-1.009 automatic owner email notification feature.

## Changes

- Reworked Admin → Automated Emails → Admin email notifications into a compact control panel.
- Recipient and master notification switch are grouped at the top.
- Replaced awkward native checkbox placement with clear on/off switches.
- Notification types are presented as balanced event cards with simple icons.
- Added an enabled/paused summary above the event cards.
- Trial-extension request count and Send test / Save changes actions now share one compact action row.
- Recent Admin email history is clearly separated from settings.
- Save changes remains disabled/grey until a setting actually changes.
- Responsive layout collapses from three columns to two and then one on smaller screens.

## Database / configuration

No new Supabase SQL is required. Continue using the Ver-1.009 Admin Email Notifications migration and existing Resend environment variables.
