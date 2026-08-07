# My Passwords Ver-0.049A — Admin Automated Emails

Ver-0.049A adds a dedicated Automated Emails area to the existing single-site Admin.

## Admin controls

- Delivery totals for sent, failed, pending and retrying customer emails.
- Search and filters for customer, email type, delivery status and date range.
- Customer email delivery history and failed-email error details.
- Retry control for eligible failed lifecycle emails.
- Safe Resend test email that does not alter a customer's lifecycle or account state.
- Manual Customer Lifecycle and Emergency Access release checks from Admin.
- Clear schedules and last successful processor run information.
- Recent processor-run history.
- Audit logging for every Admin-triggered processor run, retry and test email.

## Shared processing

The Admin manual-run buttons call the same exported processing functions as the scheduled Netlify functions. Scheduled and Admin-triggered processing therefore use one source of truth.

## Security boundary

The Automated Emails Admin endpoint queries email delivery metadata, customer account labels and processor-run history only. It does not query vault items, encrypted vault payloads, document contents, master passwords, encryption salts or decryption material.

## Database

Run `db/migrations/2026-08-07_admin_automated_emails_ver_0_049A.sql` before testing the Admin Automated Emails page. It adds processor-run history only.

## Development

Use:

`npm run build`

then:

`netlify dev --no-open`

Open `http://localhost:8888/admin` manually after Netlify Dev is ready.
