# Password-Encrypt Ver-1.029

## Guided Settings tour

- Adds a separate **Take the Settings tour** choice under Settings → Help and support.
- Keeps the original vault guided tour available as its own choice.
- Uses the existing guided-tour spotlight, card, progress, Back, Next, Skip and Finish controls for a consistent look and feel.
- Includes 35 plain-language steps covering the Settings directory and every main Settings page.
- Automatically moves to the correct Settings page as the customer continues through the tour.
- Automatically opens the relevant internal disclosure for My Account, My Subscription, Vault Safety and Trusted Person maintenance topics.
- Shows a safe explanatory fallback when a target is not visible at the current screen size.

## Safety and behaviour

- Taking the tour does not save a preference, enable a service, change billing, send an invitation or perform any other Settings action.
- Completing or skipping the Settings tour does not alter the saved onboarding/vault-tour status.
- The tour returns to the main Settings directory when it is finished or skipped.
- Existing Ver-1.027 bounded backup retries and Ver-1.028 secure-device refresh handling remain unchanged.

## Regression coverage

- Confirms all 11 Settings directory choices have guided coverage.
- Confirms all 15 internal Settings disclosure rows used by the tour have matching targets.
- Confirms all main Settings routes are visited, disclosures open one at a time, and tour preparation cannot invoke a Settings action.
- Confirms the original vault tour and responsive guided-tour styling remain available.

## Deployment notes

- No Supabase SQL migration is required.
- No new environment variables are required.

## Version alignment

- App: Password-Encrypt Ver-1.029
- package.json/package-lock.json: 1.29.0
- Service worker cache: my-passwords-v1.029
- Server APP_VERSION: Password-Encrypt Ver-1.029
