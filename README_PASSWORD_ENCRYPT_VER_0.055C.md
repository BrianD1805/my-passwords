# Password-Encrypt Ver-0.055C — Onboarding Flow

## Scope
Ver-0.055C refines new-customer onboarding only.

1. Step 2 Vault Setup always resets the document to the top when opened.
2. The new-vault master-password fields no longer advertise `autocomplete="new-password"` and include password-manager suppression hints; they remain read-only until the customer deliberately interacts with them.
3. The welcome trial email now says the trial "has started and will end on [date]".
4. New-customer onboarding is now a three-step journey:
   - Step 1 — Account setup
   - Step 2 — Vault setup
   - Step 3 — Install app
5. Step 3 captures and invokes the browser's native PWA installation prompt where supported. On platforms without a programmatic prompt (notably iPhone/iPad Safari), it shows the correct Add to Home Screen instructions.
6. Installation is recommended but not mandatory; the customer can continue in the browser.

## Database / environment
No Supabase SQL changes.
No new Netlify environment variables.

## Local verification
Run from the existing project directory:

    npm run security:check && npm run reliability:check && npm run legal:check && npm run ux:check && npm run mobile:check && npm run emergency:check && npm run onboarding:check && npm run build && netlify dev --no-open

## Deploy

    git status && git add -A && git commit -m "Password-Encrypt Ver-0.055C onboarding flow and install step" && git push origin main

## Live test focus
1. Complete Step 1 Account Setup and confirm Step 2 opens at the very top.
2. Focus both master-password fields and confirm Google/Chrome no longer opens the generated strong-password suggestion used in Ver-0.055b.
3. Create the vault and confirm the app goes directly to Step 3 — Install app.
4. Use Install Password-Encrypt on a supported browser and confirm the native install prompt appears.
5. On iPhone/iPad, confirm Step 3 instead gives Add to Home Screen instructions.
6. Confirm Continue in browser still opens the newly created vault if installation is skipped.
7. Check the welcome email sentence reads: "Your [vault] account is ready and your [plan] trial has started and will end on [date]."
