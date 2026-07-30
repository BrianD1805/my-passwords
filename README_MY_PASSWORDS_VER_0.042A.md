# My Passwords Ver-0.042A

## Stripe customer reference and Admin spacing refinement

Ver-0.042A is a minor Admin UX patch built on Ver-0.042. It does not change Stripe Checkout, webhook processing, subscription status, billing amounts, vault encryption, tenant isolation or customer data.

### Changes

- Shows the Stripe customer reference (`cus_...`) inside each Stripe-managed customer card in Admin.
- Shows the matching Stripe subscription reference (`sub_...`) alongside it for easier support and Stripe Dashboard lookup.
- Adds safe wrapping for long Stripe references on desktop and mobile.
- Corrects the internal padding, icon spacing and text separation in the **Managed by Stripe Billing** information panel.
- Keeps Stripe in whichever mode is configured by the Netlify keys. No Stripe environment or product changes are made by this patch.

### Version alignment

- Visible version: `My Passwords Ver-0.042A`
- npm version: `0.0.42-a`
- Service-worker cache: `my-passwords-v0.042A`
- Netlify Function version: `My Passwords Ver-0.042A`

### Database

No Supabase SQL is required.
