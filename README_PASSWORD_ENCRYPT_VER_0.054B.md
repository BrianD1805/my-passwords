# Password-Encrypt Ver-0.054B — Trusted Person Emergency Flow UX

Ver-0.054B locks down the owner-facing Trusted Person experience before the full emergency-flow retest.

## Main UX change

The Trusted Person screen now presents one clear six-step route from setup through emergency release:

1. Add and save trusted person details.
2. Prepare and save the emergency package.
3. Send the invitation.
4. Trusted person accepts.
5. Trusted person requests Emergency Access only if needed.
6. Waiting period completes and the prepared package becomes available if the owner does not cancel.

Each stage shows its action beside it. Completed stages display a large green tick. Future steps remain visibly locked until the required earlier work is complete. Secondary actions such as resend/copy/cancel are kept in stage-specific dropdowns, while Reset to zero is kept separately under flow management.

The invitation action is now blocked until Steps 1 and 2 have both been saved. This prevents the previous confusing route where the owner could consider sending an invitation before completing the emergency package.

## Data / schema

No Supabase SQL migration is required. Trusted-person and package completion timestamps remain inside the existing encrypted local Trusted Person metadata.
