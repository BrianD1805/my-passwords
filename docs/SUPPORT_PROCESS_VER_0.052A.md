# My Passwords Ver-0.052A — Customer Support Process

Date: 7 August 2026
Public support contact: **info@zippyweb.uk**

## 1. Core support rule

Support operates on account, billing, verification and operational metadata. Support must never ask a customer to send:

- Master password
- Saved password or other decrypted vault field
- Decrypted document contents
- OTP
- Recovery code
- Session cookie/token
- Encryption key
- Full payment-card number
- Card security code/CVV/CCV

If a customer sends secret material voluntarily, do not copy it into tickets, diagnostics or notes. Advise the customer to rotate any exposed credential where appropriate.

## 2. Identity verification

Before making an account-affecting support change:

1. Identify the account using the account email and non-secret account metadata.
2. Use the application's existing verification/recovery mechanisms rather than asking for secret vault data.
3. For high-impact actions, require the normal verified-contact/session control available in the product.
4. Record the action in the appropriate audit/admin history.

Support cannot recover or reset the master password.

## 3. Diagnostics

Use the Ver-0.051+ Safe diagnostics report where possible. It is designed to contain metadata only.

Check:

- App version
- Account/plan state
- Verification/device/session state
- Sync/backup status and timestamps
- Sanitized error/health codes
- Billing/subscription status

Do not request screenshots showing open vault secrets. If a screenshot is needed, ask the customer to close/hide sensitive fields first.

## 4. Billing support

For billing investigations request only:

- Account email
- Stripe invoice/receipt number or My Passwords invoice reference
- Date/amount/currency of the disputed charge
- Description of the issue

Use Stripe Dashboard and the safe My Passwords billing/reconciliation tools. Do not ask for full card details.

Refunds/corrections must follow the published Subscription, Cancellation & Refund Policy and any mandatory rights that apply.

## 5. Account deletion/privacy requests

For a deletion or privacy request:

1. Record receipt date and scope.
2. Verify identity proportionately.
3. Use the in-app account export/deletion workflow where it satisfies the request.
4. Explain the 14-day in-app deletion safety period when applicable.
5. Explain that deleting the cloud account does not remotely erase local browser/device copies.
6. Identify any limited payment/legal/security records that must remain and document the reason.
7. Escalate unusual legal/privacy requests for jurisdiction-specific review.

## 6. Security incident reports

If a customer reports suspected compromise:

- Preserve sanitized timestamps, account/device identifiers and security-event metadata.
- Recommend revoking/end sessions or removing verified devices where appropriate.
- Recommend rotating exposed third-party credentials if the customer says vault contents were exposed.
- Never ask the customer to prove compromise by sending passwords or decrypted vault contents.
- Escalate any suspected service-wide issue to the operational/security process immediately.

## 7. Service targets

No public response-time/SLA is promised by Ver-0.052A. Support should acknowledge and triage requests reasonably promptly, with security, billing and privacy issues prioritised over general questions.

Do not advertise a guaranteed response time until staffing and operational coverage can consistently meet it.
