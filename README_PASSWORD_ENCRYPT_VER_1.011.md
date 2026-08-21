# Password-Encrypt Ver-1.011 — Session Clear & Simplified Trial Onboarding

Ver-1.011 prevents stale browser/PWA state from trapping a customer after a failed or abandoned onboarding/install attempt, and removes the plan-choice card from normal trial onboarding.

## Previous setup / failed installation recovery

When Start Free Trial detects an earlier Password-Encrypt onboarding flow, pending signup, stored account identity, existing local encrypted vault, or active customer session, it now opens the first-party **Previous setup found** popup.

Available actions depend on what is present:

- **Continue previous onboarding** — resumes a current compatible onboarding flow.
- **Retry the app installation** — when a local encrypted vault already exists, keeps that vault and returns directly to the final Install Password-Encrypt card.
- **Start fresh onboarding** — explicitly ends an old customer session, clears Password-Encrypt onboarding/device/browser state and Password-Encrypt caches, then opens a clean onboarding flow.

If a local encrypted vault exists, Start fresh gives a prominent warning before it can be removed. Starting fresh does not delete the old server account or secure cloud backup, but local-only vault changes that were never backed up cannot be recovered after clearing the device copy.

The reset is deliberately selective: it does not call `localStorage.clear()` and therefore does not wipe unrelated website/browser storage.

## Trial plan selection

Normal **Start Free Trial** onboarding no longer asks the customer to choose a plan. The trial is silently prepared on **Plan 1 / Personal**.

If the customer deliberately starts onboarding from a specific public plan card on the landing page, that explicit plan selection is retained. The server independently defaults generic onboarding requests to Personal, so a stale client plan value cannot accidentally change the normal trial plan.

The legal card continues to make clear that creating a trial does not start a paid subscription. The customer chooses and confirms paid billing separately at the end of the trial.

## Onboarding sequence

The onboarding flow is now 12 cards:

1. Name
2. Email address
3. Vault name
4. Terms & Privacy
5. Mobile number
6. Send SMS code
7. Verify SMS code
8. Send email code
9. Verify email code
10. Create master password
11. Confirm master password
12. Install Password-Encrypt

## Database / configuration

- No Supabase SQL migration is required.
- No new Netlify environment variables are required.
- Existing Twilio, Resend, push and Stripe configuration is unchanged.
