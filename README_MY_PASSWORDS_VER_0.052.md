# My Passwords Ver-0.052 — Legal, Privacy and Commercial Readiness

Ver-0.052 prepares the Personal Plan build for the final launch-testing phase. Family and Business remain unpublished/reserved for post-Version-1.00 work.

## Public legal pages

New public routes:

- `/terms` — Terms of Service
- `/privacy` — Privacy Policy
- `/billing-terms` — Subscription, Cancellation & Refund Policy

The landing page, signup flow, Plan & Billing area, support area and lifecycle emails link to the relevant policies.

## Signup agreement evidence

New public accounts must explicitly accept the current Terms, Privacy Policy and Billing & Refund Policy. The server independently verifies the current legal document version and writes the acceptance version/timestamp into the existing audit log. Existing-account recovery/reuse is not blocked by a new-account acceptance check.

No database schema change is required.

## Security/privacy claims

Public wording now reflects the actual implementation:

- client-side AES-GCM vault/document encryption
- PBKDF2-SHA-256 master-password key derivation
- no intentional server storage/transmission of the master password
- no absolute “fully secure”, “unhackable”, “cannot ever be decrypted” or unqualified “zero knowledge” promise
- Secure device unlock explicitly disclosed as a local wrapped-master-password convenience mechanism
- Emergency Access explicitly disclosed as an owner-controlled release mechanism

See `docs/ENCRYPTION_AND_CLAIMS_REGISTER_VER_0.052.md`.

## Trials, subscriptions, cancellation and refunds

Customer-facing wording now makes clear that:

- account trial creation does not itself create a paid subscription
- paid subscription begins only after deliberate Stripe Checkout completion
- subscriptions renew automatically at the selected billing interval until cancellation takes effect
- cancellation normally takes effect at the end of the current paid period, subject to mandatory rights
- refund/billing-error handling is described in the public Billing & Refund Policy

## Tax/VAT readiness

Prices are not falsely described as universally tax-inclusive. Tax treatment remains dependent on the actual seller registrations and target markets.

Optional server setting added:

`STRIPE_AUTOMATIC_TAX=true`

When enabled, new Stripe Checkout sessions enable Stripe automatic tax and allow the checkout billing address to update the Stripe customer for tax calculation. Leave this unset/false until Stripe Tax registrations, product tax settings and seller tax obligations are confirmed.

## Stripe statement descriptor and invoice/receipt readiness

The application does not hard-code a merchant statement descriptor because Stripe requires it to match the actual verified business/DBA identity. Complete the Stripe Dashboard checks in `docs/COMMERCIAL_LAUNCH_CHECKLIST_VER_0.052.md` before public payments.

Stripe-hosted invoices/receipts remain the authoritative payment records and available links are surfaced in Plan & Billing.

## Retention

The operational cleanup job now also targets old customer/admin email logs, SMS delivery logs and completed/cancelled account-deletion request records in addition to the Ver-0.051 monitoring history.

See the exact implementation matrix in `docs/DATA_PROCESSING_VER_0.052.md`.

## Support

Public support remains `info@zippyweb.uk`. The support process explicitly prohibits requesting passwords, vault contents, OTPs, recovery codes, encryption keys, session secrets or full card/security-code details.

See `docs/SUPPORT_PROCESS_VER_0.052.md`.

## Manual pre-launch items that cannot be safely invented in code

Before public sales, confirm:

1. Exact legal seller/controller name and business/postal address.
2. Company/registration number where applicable.
3. Tax/VAT registration details and target-market obligations.
4. Stripe public business details and statement descriptor.
5. Whether/where Stripe Tax should be enabled.
6. Applicable processor DPAs/international-transfer requirements for the actual legal seller and target markets.

These are intentionally recorded as launch items rather than populated with guessed information.

## Version alignment

- App/server: `My Passwords Ver-0.052`
- npm: `0.0.52`
- service-worker cache: `my-passwords-v0.052`
- patch folder: `my-passwords-ver-0.052`

## Database / environment changes

No Supabase SQL changes are required for Ver-0.052.

New optional server-only environment switch:

- `STRIPE_AUTOMATIC_TAX=true` — enable only after the seller's tax obligations, Stripe Tax registrations and product tax settings are confirmed. If absent/false, checkout behaviour remains as before Ver-0.052.

## Verification

Patch-workspace verification completed:

- 13/13 security static checks passed
- 20/20 reliability static checks passed
- 23/23 legal/commercial readiness static checks passed
- 56/56 Netlify Function JavaScript files passed `node --check`
- 56/56 Netlify Function modules imported successfully
- 7/7 JSX files passed syntax transpilation
- Stripe automatic-tax feature switch verified OFF by default and ON only when explicitly enabled

`npm run build` was not run in the patch workspace because `node_modules` is intentionally not installed there. Run this locally before deployment:

```bat
npm run security:check && npm run reliability:check && npm run legal:check && npm run build && netlify dev --no-open
```

Deploy after testing:

```bat
git status && git add -A && git commit -m "My Passwords Ver-0.052 legal privacy and commercial readiness" && git push origin main
```
