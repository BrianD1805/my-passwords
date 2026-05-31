# My Passwords Ver-0.020

Encrypted external document storage foundation.

## What changed
- Document file contents are now encrypted in the browser and stored separately from the main vault snapshot.
- The encrypted vault keeps only document metadata and the external encrypted document reference.
- This keeps the main password vault faster as document storage grows.
- Existing Ver-0.019 document items that already contain inline `dataUrl` file data are preserved and can still be downloaded.
- New document uploads use the `document_blobs` Supabase table through Netlify Functions.

## Safety
- Existing vault items are not migrated or deleted.
- Existing inline documents are not removed.
- No encryption algorithm change.
- No sync engine rewrite.
- Requires one additive Supabase SQL migration before uploading new external documents.

## Required SQL
Run `db/migrations/2026-05-31_document_blobs_ver_0_020.sql` in Supabase SQL Editor before testing document uploads.

This migration includes explicit `grant ... to service_role;` and does not grant to `anon` or `authenticated`.
