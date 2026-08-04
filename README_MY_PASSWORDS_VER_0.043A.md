# My Passwords Ver-0.043A

## Paid Invoice Status & Receipt Link Correction

This refinement makes Stripe invoice history unambiguous for customers. A paid invoice is clearly shown as **Paid** and links to the Stripe receipt instead of presenting a payment action.

### Customer payment-history changes

- Paid invoices show **Paid** and the payment date.
- Paid invoices use **View receipt**.
- A separate **Download invoice** action is shown when Stripe provides the invoice PDF.
- Open invoices retain **Pay invoice**.
- Overdue open invoices show **Payment needs attention** and **Pay now**.
- Void and uncollectible invoices display neutral invoice-view actions.
- Draft invoices do not display a customer action.

### Stripe receipt handling

- The server resolves the successful Charge receipt URL for paid invoices.
- It supports both older Invoice payment fields and Stripe's current Invoice Payment resource.
- If a direct receipt URL is unavailable, the paid Hosted Invoice Page remains a safe fallback because it displays the paid status and receipt download.

### Database and environment

- No Supabase SQL is required.
- No new Netlify environment variables are required.
- Existing Stripe webhook configuration remains unchanged.
