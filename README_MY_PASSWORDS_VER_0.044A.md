# My Passwords Ver-0.044A

## Plan and Billing UX and Bug Fixes

This full overwrite patch is based on Ver-0.044.

### Changes

- Corrected the Personal-only launch filter so published Personal tier codes such as `personal_1`, `personal_2` and `personal_3` remain available to the public pricing, checkout and subscription-change flows.
- Kept Family and Business unavailable until their functionality is built.
- Replaced the large plan and billing-period button grids with compact, accessible dropdowns.
- Added a compact selected-plan price summary.
- Reduced the main subscription summary to the current plan, next renewal and renewal amount.
- Moved billing period, last payment and last Stripe refresh into a "More subscription details" dropdown.
- Moved Stripe Customer Portal and cancellation controls into a "Manage subscription" dropdown.
- Moved invoice and payment history into a separate dropdown.
- Moved Refresh from Stripe into the subscription status header.
- The refresh icon rotates while Stripe reconciliation is running.
- Removed the routine "Subscription status refreshed directly from Stripe." success panel while preserving genuine errors and action confirmations.
- Added improved spacing and mobile layout throughout Plan and Billing.

### Database

No Supabase SQL is required.

### Version alignment

- Visible app version: My Passwords Ver-0.044A
- npm version: 0.0.44-a
- Service worker cache: my-passwords-v0.044A
- Netlify Functions version: My Passwords Ver-0.044A
