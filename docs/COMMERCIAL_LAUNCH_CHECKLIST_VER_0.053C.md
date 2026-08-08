# Password-Encrypt Ver-0.053C — Commercial Launch Checklist

Date: 8 August 2026
Scope: Personal Plan public launch only. Family and Business remain unpublished/reserved for later releases.

This checklist records the commercial settings that cannot safely be guessed or hard-coded by the application. Complete these items before taking public payments. It is an operational checklist, not legal or tax advice.

## 1. Legal seller / service operator identity — MUST CONFIRM BEFORE LAUNCH

The public application currently identifies Password-Encrypt as **a ZippyWeb project** and publishes **info@zippyweb.uk** for support and privacy requests.

Before public sales, confirm the exact seller/controller identity that should appear on customer-facing legal documents and payment records, including where applicable:

- Legal or sole-trader name
- Trading name / DBA
- Registered or principal business address
- Company/registration number
- Tax/VAT registration number(s)
- Country of establishment
- Privacy/data-protection contact details

Do not invent these values. Once confirmed, update the public legal pages and Stripe public business details so they match.

## 2. Stripe statement descriptor — CONFIRMED FOR CURRENT LAUNCH BRAND

Stripe's account statement descriptor is a merchant-account setting, not a Password-Encrypt vault setting. The current Stripe values were confirmed during Ver-0.052 live testing as:

- Full descriptor: **PASSWORD-ENCRYPT**
- Short descriptor: **PASS-EN**

These values align with the Password-Encrypt service/domain identity. Recheck them only if the Stripe merchant/business identity changes.

Requirements from Stripe's current documentation include:

- 5–22 characters for the complete static descriptor
- At least one letter
- Latin characters only for the normal Latin descriptor
- Must reflect the business/DBA name
- Certain special characters are prohibited

The descriptor must continue to match the merchant identity customers know and the Stripe account's verified business/DBA information.

Also ensure the website and billing policy tell customers that the card/bank statement uses the descriptor configured on the Stripe merchant account.

Official reference: https://docs.stripe.com/get-started/account/statement-descriptors

## 3. Stripe public business details, branding, invoices and receipts — MUST CONFIRM

In Stripe Dashboard, review the merchant/account public details and invoice/receipt branding. Confirm that customer payment records show the correct:

- Seller/business name
- Support email
- Support URL/website
- Business address where required
- Tax/VAT ID where required
- Product/plan wording
- Currency
- Cancellation/support link or wording where Stripe provides it

Password-Encrypt displays Stripe-hosted invoice/receipt links when available. Stripe remains the authoritative payment record for Stripe charges.

Official references:
- https://docs.stripe.com/receipts
- https://docs.stripe.com/invoicing/customize

## 4. Tax / VAT — MUST BE DECIDED WITH THE SELLER'S ACTUAL FACTS

Ver-0.053C deliberately does **not** claim that public prices are tax-inclusive. The public Billing Policy says tax depends on the seller's registrations and customer location.

The checkout code now supports optional Stripe Tax through the server-only environment variable:

`STRIPE_AUTOMATIC_TAX=true`

Default/absent value: Stripe automatic tax is **off**.

Do not enable this variable until you have confirmed:

1. The legal seller and country of establishment.
2. Where the seller is registered or required to register for VAT/GST/sales tax or similar taxes.
3. The correct Stripe Tax registrations.
4. The product/default tax code and tax behaviour in Stripe.
5. That checkout/invoice public business and tax details are correct.
6. Whether advertised consumer prices must be shown tax-inclusive in each target market.

When enabled, Password-Encrypt passes `automatic_tax[enabled]=true` to Stripe Checkout and allows Checkout to update the existing Stripe customer's billing address so Stripe can use the checkout address for tax calculation.

Official reference: https://docs.stripe.com/payments/checkout/taxes

## 5. Trial and recurring-payment presentation — IMPLEMENTED, VERIFY LIVE

The app now states that:

- A trial starts only after successful account/contact verification.
- Creating the trial does not itself create a paid subscription.
- A card is not required merely to create the trial account.
- A paid subscription begins only after the customer deliberately completes Stripe Checkout.
- Paid subscriptions renew automatically at the selected billing interval until cancellation takes effect.
- Cancellation is normally effective at the end of the current paid period, subject to mandatory consumer rights.

Before launch, perform one complete live Personal Plan signup and Stripe Checkout test and compare all displayed dates/amounts to the Stripe subscription.

## 6. Refund and cancellation operations — IMPLEMENTED, VERIFY SUPPORT PROCESS

The public Billing Policy covers normal non-refundable subscription periods while preserving mandatory statutory rights. It also tells customers to contact support for duplicates, post-cancellation charges, billing errors and exceptional cases.

Support must never ask for:

- Full card number
- Card security code
- Master password
- OTP
- Recovery code
- Decrypted vault contents

Use Stripe invoice/payment IDs and Password-Encrypt metadata for billing investigations.

## 7. Customer email wording — IMPLEMENTED

Lifecycle emails now link to Terms, Privacy and Billing & Refunds and avoid implying that a trial automatically becomes paid. Account-deletion completion wording also recognises that limited payment/legal/provider records can remain after application account deletion.

In Stripe Dashboard, separately decide whether Stripe's own successful-payment and refund receipt emails should be enabled. Avoid duplicate or contradictory billing messaging.

## 8. Support process — IMPLEMENTED AND DOCUMENTED

Public support contact: **info@zippyweb.uk**.

See `docs/SUPPORT_PROCESS_VER_0.052.md` for the support handling rules, identity checks, billing investigation process and privacy-request workflow.

## 9. Data processing and vendor documentation — IMPLEMENTED AS INTERNAL REGISTER

See `docs/DATA_PROCESSING_VER_0.052.md`.

Before launch, keep current copies/records of applicable processor terms or DPAs for Netlify, Supabase, Stripe, Resend and Twilio and confirm any international-transfer requirements that apply to the actual legal seller and customers.

## 10. Encryption/marketing claims — IMPLEMENTED AS CLAIMS REGISTER

See `docs/ENCRYPTION_AND_CLAIMS_REGISTER_VER_0.052.md`.

Do not publish absolute claims such as:

- “fully secure”
- “unhackable”
- “cannot ever be decrypted”
- an unqualified “zero knowledge” promise

Approved claims must describe the implementation that exists today, not an intended future architecture.

## 11. Personal-only launch — IMPLEMENTED

Family and Business remain reserved/unpublished. Before Version 1.00, verify that neither plan is available on the landing page or accepted by the signup/checkout server path.


## 12. Browser storage and external resources — DISCLOSED

The current build uses essential cookies/local browser storage and does not intentionally include advertising or behavioural-analytics trackers. It also loads Ubuntu from Google Fonts and country-flag images from FlagCDN, which create browser requests to those services. If either external resource is removed or self-hosted later, update the Privacy Policy and data-processing register.


## Ver-0.053C product identity alignment
- Customer-facing service/product name: **Password-Encrypt**.
- Public domain and Stripe statement descriptor already use the Password-Encrypt identity.
- The operator statement remains **Password-Encrypt · A ZippyWeb project** unless formal legal entity details are later supplied.
- Before launch, confirm the Resend/OTP sender display name (if one is configured in `OTP_EMAIL_FROM`) also says **Password-Encrypt**.
- The vault home heading is intentionally the customer's own vault name rather than the product name.
