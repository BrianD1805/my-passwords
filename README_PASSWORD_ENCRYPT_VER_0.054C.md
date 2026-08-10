# Password-Encrypt Ver-0.054C — Trusted Person Emergency Flow UX

Ver-0.054C is a focused owner-side Trusted Person UX refinement over Ver-0.054B.

## Changes

1. The long serious-emergency explanation is no longer permanently in the flow. It is hidden behind a compact help icon and expands only when the owner asks for it.
2. The current-stage card is now explicitly labelled **Current progress**, so messages such as **Add your trusted person** are clearly understood as progress/status information rather than another setup section.
3. The current-stage blue accent is rendered as a full-height stage-card rail, including expanded stage content, instead of appearing only beside part of an opened stage.

## Existing ordered flow retained

1. Add and save trusted person details.
2. Prepare and save the emergency package.
3. Send the invitation.
4. Trusted person accepts.
5. Trusted person requests Emergency Access only if needed.
6. Waiting period completes and the prepared package becomes available if the owner does not cancel.

Completed stages keep their large green tick and stage actions remain beside the relevant stage.

## Data / schema

No Supabase SQL migration is required for Ver-0.054C.
