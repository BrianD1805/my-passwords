# My Passwords Ver-0.036A

Emergency Access testing patch.

## Changes

- Added a **10 minutes — testing only** waiting-period option in Emergency Access.
- Updated the Emergency Access request waiting-period parser to support minutes.
- Improved emergency invitation email sending feedback so failed/time-out email attempts clearly say the invite link was still created and can be copied manually.
- Added a timeout around Resend invitation sending so the app does not appear stuck if Resend/email delivery is slow.
- Clarified the message shown if the invite email was sent but the emergency release package refresh hits a problem.
- Added a non-migration SQL helper file: `db/CLEAR_EMERGENCY_ACCESS_TEST_DATA_VER_0_036A.sql`.

## No schema changes

No Supabase schema migration is required for this patch.
