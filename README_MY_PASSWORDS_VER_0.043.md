# My Passwords Ver-0.043

## Subscription Lifecycle Management

This release completes the customer-facing Stripe subscription lifecycle while keeping payment-card management and Stripe-hosted invoice self-service inside Stripe Customer Portal.

### Customer features

- Upgrade to a higher plan immediately, with Stripe proration where applicable.
- Schedule a downgrade for the next renewal.
- Change monthly, quarterly or annual billing at the next renewal.
- Display upcoming scheduled plan and billing changes.
- Cancel at the end of the current billing period.
- Reactivate before the scheduled cancellation completes.
- Display renewal date and expected renewal amount.
- Display recent Stripe payment and invoice history.
- Provide clear failed-payment and grace-period guidance.
- Refresh directly from Stripe when a webhook is delayed.
- Prevent creation or modification when overlapping live Stripe subscriptions are detected.
- Distinguish Trial active, Subscription active, Payment needs attention, Cancellation scheduled, Cancelled and Suspended.

### Admin features

- Manual **Refresh from Stripe** on each Stripe-managed customer.
- Renewal amount/date, scheduled changes and last Stripe refresh shown in the customer accordion.
- Overlapping subscriptions are flagged for manual review rather than changed automatically.

### Required Supabase migration

Run this file in Supabase SQL Editor before deploying the application:

`db/migrations/2026-08-03_subscription_lifecycle_management_ver_0_043.sql`

The migration is additive only. It does not delete or rewrite encrypted vault snapshots, encrypted documents, tenants, users or Emergency Access records.

### Stripe webhook events

Keep the existing verified webhook endpoint and include these events:

- `checkout.session.completed`
- `checkout.session.expired`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `customer.subscription.paused`
- `customer.subscription.resumed`
- `customer.subscription.trial_will_end`
- `invoice.paid`
- `invoice.payment_succeeded`
- `invoice.payment_failed`
- `invoice.payment_action_required`
- `subscription_schedule.created`
- `subscription_schedule.updated`
- `subscription_schedule.released`
- `subscription_schedule.completed`
- `subscription_schedule.canceled`
- `subscription_schedule.aborted`

### Safety notes

- Stripe remains the payment source of truth.
- Verified webhooks remain enabled and idempotent.
- Checkout completion also reconciles directly with Stripe so a delayed webhook does not leave the customer in a blank or indefinite state.
- Customer and Admin refresh actions read Stripe state before updating My Passwords.
- Multiple live subscriptions block automatic actions and require Admin review.
- My Passwords does not store full card details.
