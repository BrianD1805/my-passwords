# Password-Encrypt Ver-1.008 — Encrypted Picture Uploads

Ver-1.008 adds encrypted Pictures as a first-class vault upload type for important images such as photo IDs, passports and driving licences.

## Customer features

- New **Pictures** vault category.
- Supported picture formats: JPG/JPEG, PNG, WEBP, HEIC and HEIF.
- Maximum size: **10 MB per picture**.
- Pictures are encrypted in the browser before they leave the device.
- Stored pictures can be viewed, shared and downloaded from their vault popup.
- Plan & Billing shows Picture usage separately from Documents.
- Customer-facing plan features show the Picture allowance.
- Founder Plan remains unlimited for Picture count/storage at plan level, while the 10 MB per individual picture limit still applies.

## Subscription/Admin controls

Admin → Subscriptions now includes:

- **Picture limit** — `0` means unlimited.
- **Encrypted pictures** feature toggle.
- Existing total account storage limits continue to include encrypted vault data, Documents and Pictures.

Both the browser UI and authenticated server endpoints enforce the Picture feature, Picture count limit, total storage allowance and the 10 MB per-file maximum.

## Larger encrypted upload transport

Documents and Pictures now use chunked encrypted transport so the supported 10 MB source-file limit can be handled without sending one oversized function request. The readable file remains encrypted before upload; the server stores only encrypted file chunks and metadata.

Existing stored Documents remain compatible.

## Emergency Access

When an owner deliberately selects **Full vault access**, prepared Emergency Packages now include both stored Documents and stored Pictures. Pictures appear in their own Pictures folder on the release page and in the full ZIP. If a Password-Encrypt recipient imports the package into their own vault, Pictures remain Pictures and are re-encrypted for the recipient's vault.

## Database

Run the full migration in:

`db/migrations/2026-08-16_picture_uploads_ver_1_008.sql`

The migration is additive. It adds the Picture plan limit, file-kind metadata and chunk storage tables. No new Netlify environment variables are required.
