# My Passwords Ver-0.042

## Stripe Billing Recurring Subscription Checkout

Ver-0.042 connects the existing Admin-managed subscription plans to Stripe Billing while keeping the public site, vault, Admin, Netlify Functions and webhooks inside one Netlify deployment.

### Customer billing

- My Subscription is available inside Settings.
- Customers can choose a published plan and monthly, quarterly or annual billing.
- Hosted Stripe Checkout handles card collection; My Passwords does not receive or store full card details.
- The customer’s remaining trial is passed to Stripe when enough trial time remains.
- An existing open Checkout Session is reused instead of creating duplicates.
- Cancelling Checkout expires the open session and records the cancellation locally.
- The checkout return page is informational only. Paid access is activated only after a verified Stripe webhook.
- Stripe Customer Portal provides payment-method updates, invoices and cancellation management.
- Founder access remains permanent and never enters Stripe Billing.

### Admin plan sync

- Saving a plan in `/admin` creates or updates its Stripe Product.
- Monthly, quarterly and annual recurring Stripe Prices are created from the GBP prices stored in Admin.
- When an amount changes, a new Stripe Price is created for future customers and the old Price is made inactive.
- Each plan shows Stripe sync status and can be synced manually.
- Existing Stripe-managed subscriptions are not changed by local trial controls.

### Webhook lifecycle

The webhook endpoint is:

`https://password-encrypt.com/.netlify/functions/stripe-webhook`

Configure these Stripe events:

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

Webhook signatures are checked against the unmodified request body. Duplicate Stripe event IDs are ignored after successful processing.

### Subscription lifecycle

- `trialing` and `active` subscriptions keep cloud access active.
- Failed or action-required payments enter a seven-day grace period.
- `paused`, `cancelled` and `incomplete_expired` subscriptions pause cloud features while preserving the local encrypted vault.
- Billing events and renewal/payment dates appear in the single-site Admin.

### Required Netlify variables

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

`STRIPE_PUBLISHABLE_KEY` is not required by this build because payment details are collected on Stripe-hosted Checkout rather than through an embedded Stripe.js card form. It may be added later if an embedded payment interface is introduced.

Keep the existing Supabase, Resend and session variables configured.

### Stripe Dashboard setup

1. Use Stripe test-mode keys for initial testing.
2. Add the webhook endpoint and selected events.
3. Copy the endpoint signing secret into `STRIPE_WEBHOOK_SECRET` in Netlify.
4. Configure and activate the Stripe Customer Portal for payment-method, invoice and cancellation options.
5. Redeploy after environment-variable changes.
6. Save each published My Passwords plan in `/admin` so its Stripe Product and recurring Prices are created.

Do not mix test-mode and live-mode keys or webhook secrets.

### Database migration

Run:

`db/migrations/2026-07-22_stripe_billing_recurring_checkout_ver_0_042.sql`

This is additive and does not delete or replace encrypted vault snapshots, documents, Emergency Access records, tenants or users.

### Expected build

`my-passwords@0.0.42`
