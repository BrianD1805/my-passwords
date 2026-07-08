# My Passwords Ver-0.037A — Emergency Reset Flow Fix

## Purpose
Fixes the Emergency Access reset flow so Reset invite clears stale invite, accepted, request, waiting and release-ready state for the selected trusted person before a fresh invite is sent.

## Changes
- Reset invite now passes the trusted person email to the reset function.
- Server reset cancels the current invitation.
- Server reset also cancels any active accepted/pending/sent/declined invitations for the same owner/trusted-person email.
- Server reset cancels any active emergency access requests for the same owner/trusted-person email.
- Local encrypted vault metadata is cleared for invite, acceptance, request, resend and release-ready fields while preserving trusted person details and waiting period.
- No Supabase schema changes.

## Version
My Passwords Ver-0.037A
