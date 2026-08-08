# Password-Encrypt Ver-0.053 — Final Testing Checklist

Ver-0.053 is the final pre-launch fixes/improvements/testing series before Version 1.000.

## First-pass checks for this patch

1. Confirm Password-Encrypt Ver-0.053 is visible after deploy.
2. On mobile/PWA, confirm Ubuntu is used on landing, signup, vault, settings and popup controls.
3. Landing plans: confirm the old long pricing disclaimer is gone.
4. Landing plans: confirm `NO CREDIT CARD DETAILS are taken during your free trial.` is visible.
5. Signup Screen 1: confirm only Terms of Service and Privacy Policy are required.
6. Open Terms/Privacy from signup and return without losing entered values or the tick state.
7. Signup popup: desktop progress 1–4 appears beside the title; mobile progress appears directly beneath the title inside the sticky header.
8. Start/continue a trial and confirm no card details are requested.
9. In Plan & Billing for an account without an active Stripe subscription, confirm the Subscription, Cancellation & Refund Policy acknowledgement tick is shown before Stripe Checkout.
10. Confirm Stripe Checkout cannot be opened until that tick is selected.
11. Open the Billing policy from the acknowledgement, return to the same Plan & Billing screen, then tick and open Stripe Checkout.
12. Cancel Stripe Checkout and confirm no subscription change occurs.

Continue the wider Version 1.000 launch regression testing after these pass.
