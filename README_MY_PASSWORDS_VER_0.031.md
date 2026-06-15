# My Passwords Ver-0.031

Emergency Access invite foundation.

## Summary
- Adds invitation status to the encrypted Emergency Access plan.
- Adds Send invitation, Check status and Cancel invite controls.
- Adds a public invite acceptance page at `/emergency-invite`.
- Adds Netlify Functions for sending/cancelling/checking emergency invitations and accepting/declining invitations.
- Adds a Supabase table for invitation records.
- Does not grant vault access, does not store the master password, and does not create any emergency release package yet.

## SQL
Run `db/migrations/2026-06-15_emergency_access_invites_ver_0_031.sql` in Supabase SQL Editor.
