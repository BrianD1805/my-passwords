# Password-Encrypt Ver-1.016 — Final Onboarding Flow

## Purpose
Finish the new-customer onboarding sequence so verification, master-password creation, installation, Push Notifications and the Guided Tour remain in one consistent onboarding experience until the vault is opened.

## Changes
- Expanded onboarding from 12 to 14 steps without removing the email-verification steps.
- Fixed the mobile-number country/number field so the rounded left outline is clean and continuous.
- SMS verification now shows clear live feedback that the request has been made and that mobile-network delivery can take a little while.
- After successful mobile verification, new customers continue to Email Verification (Step 8) instead of jumping directly to the master-password steps.
- Preserved Ver-1.015 behaviour: either verified contact method is enough to activate/onboard the customer; the other may be completed later and is reminded on future sign-ins.
- Master-password and confirmation fields now have independent show/hide eye controls styled to match the vault login control.
- Password mismatch feedback is now a prominent red alert panel.
- Install App remains Step 12.
- Push Notifications is now Step 13 inside the onboarding card rather than an ordinary vault popup.
- Guided Tour choice is now the final Step 14 inside the onboarding card.
- The normal vault opens only after the customer completes the final Guided Tour choice. Choosing Start tour opens the vault and immediately begins the interactive tour.
- Guided Tour welcome wording is now generic and no longer describes Home folders or the folder three-dot button in the welcome description.
- Guided Tour welcome popup padding has been corrected for later use from Settings.
- Landing-page trial/setup wording now matches the one-contact-method verification rule.

## Onboarding order
1. Name
2. Email address
3. Vault name
4. Terms and Privacy
5. Mobile number
6. Request SMS
7. Enter SMS code
8. Request email code
9. Enter email code
10. Create master password
11. Confirm master password
12. Install app
13. Push Notifications
14. Guided Tour choice

## Database
No Supabase schema change or SQL migration is required for Ver-1.016.

## Build note
The isolated build workspace did not contain dependencies. `npm install` exceeded the execution window and left an incomplete `node_modules`, which was removed before packaging. Static/regression suites and JSX/JavaScript syntax validation passed. Run the normal local `npm install` and `npm run build` before publishing.
