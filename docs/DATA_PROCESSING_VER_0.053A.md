# Password-Encrypt Ver-0.053A — Data Processing Register

Date: 8 August 2026
Purpose: internal launch-readiness record for privacy notices, vendor review, support handling and data-subject requests.

This document describes the current implementation. It must be updated when vendors, hosting regions, data categories, retention, encryption architecture or customer features change.

## 1. Roles and identity

Password-Encrypt is presented publicly as **a ZippyWeb project**. The exact legal controller/seller identity, registered/principal address, registration number and tax identifiers must be confirmed before public sales and then reflected in the public Privacy Policy and Stripe public business details where required.

Public support/privacy contact: **info@zippyweb.uk**.

## 2. Data map

### Account and identity data

Examples: display name, email address, mobile number, account/vault name, verification status, account status, plan, tenant/user identifiers.

Purpose: create and administer the account, verify access, deliver account services, enforce plan entitlements, prevent abuse and provide support.

### Device and session metadata

Examples: device identifiers, device label/type, browser/platform information, verified-device status, session creation/expiry/revocation timestamps, security events.

Purpose: account security, device management, session control, diagnostics and fraud/abuse prevention.

### Vault and encrypted document storage

Vault records and uploaded document contents are encrypted in the browser before cloud storage. The server receives encrypted payloads plus operational metadata needed to store, sync, count and enforce limits. The master password is not intentionally sent to or stored on Password-Encrypt servers.

The implementation should therefore be described as **client-side encrypted**, not with an absolute “zero knowledge” or “cannot ever be decrypted” promise.

### Secure device unlock — local-only security-sensitive material

If the customer enables Secure device unlock, the browser stores a wrapped copy of the master password and a non-exportable local AES-GCM device key in local browser/device storage. A platform WebAuthn credential check precedes the app's normal use of that local material. This material is not part of the normal cloud account record but is security-sensitive and can be affected by compromise of the browser/device or same-origin application code.

### Emergency Access

The service stores trusted-person contact data, waiting/release status and an owner-prepared emergency package. The emergency package is separately encrypted in the browser using the Emergency Access secret/link material before server storage. Emergency Access is an intentional disclosure path selected by the owner; it is not the same as support or administrators having routine vault access.

Current implementation note: a full-vault Emergency Access package contains the selected/prepared vault record data but does not separately decrypt uploaded encrypted document files into that package.

### Billing and commercial data

Examples: Stripe customer/subscription IDs, plan, billing interval, amounts, currency, invoice/payment identifiers, renewal/cancellation dates and payment status.

Full payment-card details are handled by Stripe rather than stored by Password-Encrypt.

### Communications

Examples: email/SMS destinations, masked destinations, delivery/provider IDs, delivery status, lifecycle-email event type, timestamps.

Email provider: Resend. SMS verification provider: Twilio where enabled.

### Operational monitoring and support diagnostics

Examples: function/check names, service status, timestamps, sanitized error codes, sync/backup status, conflict counts, plan/account status and device/browser metadata.

Ver-0.051+ diagnostics are designed to exclude passwords, decrypted vault values, encrypted vault payloads, document contents, OTPs, recovery codes, cookies, session tokens and provider secrets.

## 3. Current processor/service-provider register

| Provider | Current purpose | Typical data categories |
| --- | --- | --- |
| Netlify | Hosting, deployment, CDN/serverless functions | Requests, service metadata, function execution data |
| Supabase | Application database/storage | Account metadata, encrypted vault/document blobs, billing/operational metadata |
| Stripe | Subscription billing, invoices, receipts | Customer/billing details, payment data, tax/address data when configured |
| Resend | Transactional email | Email address, message content, delivery metadata |
| Twilio | SMS verification | Mobile number, verification/delivery metadata |
| Google Fonts | Ubuntu web-font delivery | Normal browser request metadata such as IP/user agent |
| FlagCDN | Country-flag image delivery | Normal browser request metadata such as IP/user agent |

Before launch, retain and periodically review the current contractual/privacy/DPA terms applicable to each material processor and identify the actual processing/hosting regions used by the account configuration. Google Fonts and FlagCDN are external browser resources and should also remain reflected in the public notice while they are used.

## 4. Essential cookies and local browser storage

The current build uses essential security/session cookies and browser storage for account sessions, CSRF protection, encrypted local vault storage, device identifiers, sync safety, cached entitlements/settings and optional Secure device unlock. No advertising or behavioural-analytics tracker was identified in the Ver-0.053A source review.

Clearing browser/site data can remove the local encrypted vault, local device/session state and Secure device unlock material. This should be explained to customers before recommending that they clear browser data during support.

## 5. Purposes / legal-basis mapping

The exact legal basis depends on the law applying to the seller and customer. The current product purposes are:

- Contract/service delivery: account creation, vault sync/backup, subscriptions and support.
- Security and legitimate operational interests where permitted: fraud/abuse prevention, security logging, reliability monitoring, diagnostics and dispute handling.
- Legal obligations: tax/accounting records and valid legal requirements.
- Consent where specifically required: communications or processing for which applicable law requires consent.

Do not rely on this internal description as a substitute for jurisdiction-specific legal advice.

## 6. Retention implementation

Current application behaviour:

| Data category | Current handling |
| --- | --- |
| Active account/profile data | Generally retained while account is active |
| Encrypted cloud vault/document data | Generally retained while account is active; removed from active application data when completed deletion removes the tenant |
| Pending account deletion | 14-day safety period; customer can cancel during that period |
| Operational events | `retention_until`, normally 180 days |
| Scheduled health-check history | Cleanup targets >180 days |
| Customer/admin email delivery logs | Cleanup targets >180 days |
| SMS delivery logs | Cleanup targets >180 days |
| Manual Stripe reconciliation history | Cleanup targets >365 days |
| Completed/cancelled account-deletion request records | Cleanup targets >365 days from record creation |
| Legal-acceptance/audit records | No generic short retention cleanup; retain only while reasonably necessary for agreement evidence, security, legal compliance or disputes |
| Stripe/provider records | Provider-controlled and/or retained for payment, tax, fraud, dispute or legal requirements |

Deletion of a cloud account does not remotely erase an encrypted local vault already stored on a customer's browser/device. The customer must clear local storage separately on devices they no longer control.

## 7. Data-subject/privacy request process

Requests can arrive through **info@zippyweb.uk** or an in-app workflow. Support should:

1. Record the request date and requested right/action.
2. Verify identity proportionately using account/contact metadata; never request the master password or vault contents.
3. Search only the systems necessary for the request.
4. Use the built-in account export/deletion tooling where appropriate.
5. Record any lawful reason for retaining limited records after deletion.
6. Consider whether a processor/recipient must also be instructed or notified.
7. Respond within the timeframe required by the law that applies to the request.

## 8. International processing

Netlify, Supabase, Stripe, Resend and Twilio may process data in countries different from the customer and operator. Before public launch, determine which transfer safeguards, notices or contractual mechanisms apply to the actual seller/controller and its target markets.

## 9. Security boundary for staff/support

Admin and support tooling must remain metadata-only for vault content. Staff must not be given a feature that decrypts customer vaults or documents. Operational errors must not log request bodies or decrypted secret values.

If a future support or business feature changes this boundary, the Privacy Policy, Terms, claims register and data-processing register must be revised before release.

## 10. Review triggers

Review this document whenever any of these occur:

- New hosting/database/communications/payment provider
- Family or Business plan launch
- New analytics or advertising
- New support tooling
- Change to Emergency Access cryptography or scope
- Change to Secure device unlock storage
- Change to retention periods
- New tax/VAT collection configuration
- New countries/regions materially affecting privacy obligations
