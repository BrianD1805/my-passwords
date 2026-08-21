# Password-Encrypt Ver-1.015 — Onboarding Verification Recovery

## Purpose
Prevent onboarding from becoming trapped when an SMS request hangs or the internet connection fails during mobile verification.

## Changes
- SMS/account-preparation network requests stop after 20 seconds instead of remaining in a permanent Sending state.
- A visible **Cancel sending** action aborts an in-flight onboarding request.
- Failed/cancelled SMS requests offer **Retry SMS**.
- **Do this later — verify email instead** allows mobile verification to be deferred.
- Either verified onboarding channel (email or SMS) can activate the account and start the configured trial.
- The unverified contact method remains marked as pending rather than blocking onboarding.
- Future authenticated vault sign-ins show a reminder until both email and mobile are verified.
- The reminder links directly to the existing secure email/mobile verification flow.
- Ver-1.014 Guided Tour and default Home-folder behaviour are preserved.

## Database
No Supabase schema change is required.
