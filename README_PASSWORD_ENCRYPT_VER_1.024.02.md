# Password-Encrypt Ver-1.024.02

## Focused fixes

This patch is deliberately limited to three areas and does not change the Ver-1.024.01 onboarding state machine or 14-step sequence.

1. **Welcome email timing**
   - Welcome email follow-up is requested only after successful email OTP verification.
   - Admin onboarding notification remains independent and may run after either verified contact channel.
   - The shared customer email service now refuses both Welcome templates unless the target user's email is already marked verified.

2. **Settings drill-down scroll position**
   - Opening any Settings section resets the document to the top immediately before/after the section swap.
   - Removes the retained deep-scroll position that forced users to manually scroll upward after opening a section, especially on mobile.

3. **Emergency Access labels**
   - Settings directory now clearly separates **Nominate a Trusted Person** from **Receive an Emergency Package**.

No Supabase migration is required.
