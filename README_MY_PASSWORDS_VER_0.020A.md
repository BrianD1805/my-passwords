# My Passwords Ver-0.020A

Urgent document upload bug fix.

## What changed
- Fixed PDF/document upload error: `Maximum call stack size exceeded`.
- Replaced unsafe binary-to-base64 conversion with chunk-safe helpers.
- Applied the safer conversion to encrypted document upload/download and existing vault encryption helpers.

## Safety
- No Supabase SQL changes.
- No encryption algorithm changes.
- No sync engine changes.
- No dependency changes.
- Existing vault data is preserved.
