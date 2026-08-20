# Password-Encrypt Ver-1.009 — Admin Email Notifications

Ver-1.009 adds low-volume automatic owner/Admin email notifications using the existing Resend configuration.

## Admin notifications

Admin → Automated Emails now contains an **Admin email notifications** panel. The default recipient is `bdh1805@gmail.com`. The recipient and each notification type can be enabled/disabled independently. Save remains disabled until settings have changed, and a safe Admin test email can be sent from the panel.

Automatic notifications are available for:

- New client onboarded — name, registered email, registered mobile, plan and verification status/method.
- New subscription purchased — customer details, plan and billing frequency. Stripe Checkout purchases are reported even when the subscription begins in `trialing` state.
- Trial extension requested — customer details, plan and current trial end date.
- Payment failed.
- Subscription cancelled.
- Account deletion requested.

Notification delivery is deliberately non-blocking: a temporary Resend/Admin-notification failure cannot prevent onboarding, Stripe webhook processing or an account-security action from completing.

## Trial extension request

Customers with trial history can request an extension from Settings → Plan & Billing. The request is recorded and the Admin notification is sent. The existing Admin → Customers → Extend trial control remains the approval action; approving the extension also resolves the pending request. Only one recent request can be pending at a time, with server-side rate limiting.

## Security and privacy

The Admin notification emails contain account/operational metadata only. Vault contents, encrypted payloads, master passwords, OTPs, documents, pictures, cards and recovery secrets are never included. Notification history stores generic subjects and masked recipient information rather than the customer details contained in the delivered email body.

## Database

Run `db/migrations/2026-08-20_admin_email_notifications_ver_1_009.sql` before publishing Ver-1.009.

No new Netlify environment variables are required. The existing `RESEND_API_KEY` and `OTP_EMAIL_FROM` configuration is used.
