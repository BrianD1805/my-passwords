# My Passwords Ver-0.042B

## Admin UX fixes and refinements

Ver-0.042B simplifies the single-site Admin interface without changing Stripe Checkout, webhook processing, subscription billing amounts, encrypted vault data or tenant isolation.

### Overview

- Removed the developer-facing Foundation status / SaaS controls section.
- Retained the useful account, plan, billing and sync totals.

### Subscription Plans

- Subscription Plans now opens as a clean plan directory.
- Clicking a plan opens a dedicated centred plan window for editing.
- Added an Add plan button that opens a blank plan window.
- Added safe plan deletion from the edit window.
- A plan cannot be deleted while a customer account or subscription still uses it.
- Synced Stripe Products and Prices are archived before an unused plan is deleted.
- Improved spacing between the plan action buttons and Stripe Billing status panel.

### Customers

- Customers now appear as an accordion list.
- Clicking a customer row expands the full trial, onboarding, billing and account controls.
- Suspend / Remove suspension now sits with the other customer action controls.
- Removed the separate Managed by Stripe Billing information panel.
- Stripe subscription status and Stripe references now use the full available width.
- Founder onboarding now displays Founder account rather than Pending verification.

### Version alignment

- Visible version: `My Passwords Ver-0.042B`
- npm version: `0.0.42-b`
- Service-worker cache: `my-passwords-v0.042B`
- Netlify Function version: `My Passwords Ver-0.042B`

### Database

No Supabase SQL is required for Ver-0.042B.
