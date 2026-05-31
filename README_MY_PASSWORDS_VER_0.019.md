# My Passwords Ver-0.019

Secure document upload and retrieval foundation.

## What changed
- Added a Documents folder.
- Added storage-only document uploads for TXT, MD, CSV, Excel, Word and PDF.
- Uploaded documents are stored inside the encrypted vault data and backed up through the existing encrypted sync path.
- Documents can be downloaded later from the item popup.

## Safety
- No Supabase SQL changes.
- No encryption algorithm changes.
- No sync engine changes.
- No dependency changes.

## Note
Ver-0.019 stores documents inside the encrypted vault snapshot. To protect browser/PWA storage and backup performance, individual uploads are limited to 4MB in this foundation build.
