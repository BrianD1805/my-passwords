# My Passwords Ver-0.052A — Signup Legal Acceptance Fix

## Scope
Targeted legal-signup correction for the current Legal, Privacy and Commercial Readiness build.

### Fixes
1. The required legal acceptance checkbox is now visible on Signup Screen 1.
2. Terms of Service, Privacy Policy and Subscription/Cancellation/Refund Policy open in an in-app legal popup from signup.
3. Closing the legal popup returns to the same signup screen without clearing entered signup data or legal acceptance state.
4. Links between legal documents inside the signup popup stay inside the popup.
5. Existing server-side legal-version enforcement and acceptance audit recording remain unchanged.

## Version alignment
- App/server: `My Passwords Ver-0.052A`
- npm package: `0.0.52-a`
- service-worker cache: `my-passwords-v0.052A`
- patch folder: `my-passwords-ver-0.052A`

## Database
No Supabase SQL changes are required for Ver-0.052A.

## Local verification
Run from the current project directory:

```bat
npm run security:check && npm run reliability:check && npm run legal:check && npm run build && netlify dev --no-open
```

Expected static checks:
- 13/13 Security PASS
- 20/20 Reliability PASS
- 26/26 Legal/commercial readiness PASS

## Live test
1. Start a new Personal Plan signup.
2. On Screen 1 enter test account details and confirm the legal checkbox is visible.
3. Leave the checkbox unticked and press Continue: signup must stay on Screen 1 and show the acceptance warning.
4. Open Terms of Service. Confirm it opens in a popup over signup.
5. Close with Back to signup. Confirm all Screen 1 fields are unchanged.
6. Repeat for Privacy Policy and Subscription, Cancellation & Refund Policy.
7. Tick the checkbox, open and close a policy again, and confirm the checkbox remains ticked.
8. Press Continue. Signup should advance to plan confirmation normally.

## Deploy

```bat
git status && git add -A && git commit -m "My Passwords Ver-0.052A signup legal acceptance fix" && git push origin main
```
