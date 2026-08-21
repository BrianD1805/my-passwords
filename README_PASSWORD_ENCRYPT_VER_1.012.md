# Password-Encrypt Ver-1.012 — Admin UX Improvements

## Build scope

Ver-1.012 restructures Password-Encrypt Admin for faster customer support and clearer operational information. It does not change vault encryption, customer vault contents, billing rules, onboarding logic, Trusted Person logic, SMS delivery, push delivery, or plan entitlements.

### Customer directory

- Customer sort defaults to **Newest first**.
- Sort options: Newest first, Oldest first, Name A–Z, Name Z–A, Most recent sign-in, Most recent backup.
- Selecting a customer opens a standalone customer administration page rather than rendering the detail inside the Customer directory.
- Opening a customer always returns the viewport to the top.
- The standalone customer page has a clear **Back to customers** button.

### Customer detail

Customer information is now ordered into:

1. Summary metrics
2. Account and subscription
3. Admin controls and support
4. History and operational records

Large data areas use independent accordion disclosures, so Admin can open only the information needed.

The four summary metrics are clickable shortcuts to their detailed sections.

### Backup count clarification

`vault_sync_snapshots.item_count` is the vault-item count recorded when the encrypted snapshot was successfully saved. It is calculated from the visible vault entries and therefore already includes Document and Picture entries that existed in that snapshot. Document and Picture counts must not be added to the snapshot item count again.

Admin now also loads the current `document_blobs` metadata counts and shows the number of stored Documents and Pictures separately. This makes a stale snapshot obvious. For example, if the current phone vault shows 63 items but Admin shows a last successful snapshot of 56 items from an older date, Admin is showing the older successful cloud snapshot rather than a second method of counting the same files.

### Verification UX

Email and Mobile verification are now displayed consistently. Each verified state has its own green tick and equal visual emphasis.

### Admin overview

- The large `Admin` heading is reduced.
- Each overview stat is clickable.
- Clicking a stat displays the underlying customer/plan/audit records directly below the stats.
- Customer rows in the stat detail can open the standalone Customer page.

### Admin navigation

The previous permanently visible Admin tab strip is replaced by one **Admin menu** button inside the Admin header. Expanding it shows all Admin sections inside the header panel.

## Database / environment

No Supabase SQL migration is required.

No new Netlify environment variables are required.

## Verification

- Security: 13/13 PASS
- Reliability: 20/20 PASS
- Legal/commercial: 35/35 PASS
- Landing/plan UX: 36/36 PASS
- Mobile: 6/6 PASS
- Emergency Flow: 75/75 PASS
- Onboarding: 61/61 PASS
- Push Notifications: 32/32 PASS
- Ver-1.012 Admin UX: 21/21 PASS
- JSX parse check: PASS
- Updated Netlify function syntax checks: PASS

The full source package intentionally excludes `node_modules`, `.git`, generated `dist` output and Netlify local cache folders.
