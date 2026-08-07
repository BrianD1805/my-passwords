# My Passwords Ver-0.048

## Admin Customer Operations

The single-site Admin now has a complete customer operations workflow:

- Search customers by account name, owner name, email, phone or account ID.
- Filter customers by plan, trial status, payment status and account status.
- Open a dedicated customer detail page.
- Review a combined customer timeline.
- Review trial, subscription and billing history.
- Review sync-health events and the last successful encrypted backup.
- Review contact verification, verified-device and session metadata.
- Review the last successful account sign-in.
- Add and delete internal Admin notes.
- Suspend and reactivate customer accounts.
- Extend internal or active Stripe trials.
- Refresh the latest subscription state directly from Stripe.
- Resend only account emails appropriate to the customer’s current state.
- Review pending, cancelled and completed account deletion requests.
- Review each customer’s tenant audit log and a global Admin Audit page covering customer changes, plan operations, Stripe refreshes, account emails, notes and Admin sign-in activity.

## Vault security boundary

Admin endpoints use the Supabase service role only inside Netlify Functions and return operational metadata only. They do not select or return:

- `vault_items.encrypted_payload`
- `vault_sync_snapshots.encrypted_blob`
- encrypted document data
- local encryption salts or IV values
- the master vault password
- any decrypted vault field

Admin cannot open, read or decrypt customer vault contents.

## Database migration

Apply:

`db/migrations/2026-08-06_admin_customer_operations_ver_0_048.sql`

The migration adds only:

- `public.admin_customer_notes`
- `public.admin_email_log`

It does not alter existing encrypted vault data.

## Local testing

Run `npm run build`, then `netlify dev --no-open`. Open `http://localhost:8888/admin` manually after Netlify Dev reports that port 8888 is ready.

Node is pinned to `22.23.2` for local and Netlify builds.
