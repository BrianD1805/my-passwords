# Password-Encrypt Ver-1.030

## Redesigned checklists

- Adds a live progress bar and a completed-of-total item count.
- Restyles checklist rows with clean circular controls and a flatter, more spacious layout.
- Lets each checklist keep completed items in their original position or display them at the bottom.
- Lets each checklist turn completed-item strikethrough on or off, including reusable monthly lists.
- Preserves the stored original order when an item is checked or unchecked, so changing the display choice later does not repeatedly rearrange the saved list.
- Removes the three example checklist lines from the editor placeholder.

## Backward compatibility

- Existing checklists retain their previous move-completed-items-to-bottom behaviour until edited.
- New checklists default to keeping items in their original position with strikethrough enabled.
- Checklist preferences are stored inside the encrypted vault item; no database migration is needed.

## Preserved fixes

- Retains the complete repaired vault logo from Ver-1.029.03.
- Retains the responsive Settings guided-tour placement and softer highlight.
- Retains bounded backup retries and secure-device refresh recovery.

## Regression coverage

- Confirms checklist display choices are saved with the encrypted item.
- Confirms toggling completion does not reorder the underlying stored lines.
- Confirms progress count, accessible progress bar and optional strikethrough styling.
- Confirms prior security, reliability, onboarding, push, backup and guided-tour protections remain intact.

## Deployment notes

- No Supabase SQL migration is required.
- No new environment variables are required.

## Version alignment

- App: Password-Encrypt Ver-1.030
- package.json/package-lock.json: 1.30.0
- Service worker cache: my-passwords-v1.030
- Server APP_VERSION: Password-Encrypt Ver-1.030
