# Password-Encrypt Ver-1.029.01

## Guided-tour highlight correction

- Removes the second visual ring that was being applied directly to the highlighted control.
- Keeps one consistently measured spotlight around the selected control, correcting the uneven inner blue outline on its left and right sides.
- Softens the remaining blue ring, white border and background dimming so the guided tour feels calmer while the selected control remains clear.
- Retains the existing tour card, navigation, responsive positioning and background interaction protection.

## Introduction wording

- Changes the Settings tour introduction to: **“This tour clearly explains every Settings section.”**
- Removes the previous wording about “everyday language” so the introduction makes no language-related claim.

## Regression coverage

- Confirms the duplicate target ring is no longer activated.
- Confirms the single spotlight uses the new even, softer border and ring.
- Confirms the Settings introduction contains no language claim.
- Confirms all 35 Settings tour steps, 15 disclosure targets and the original vault tour remain available.

## Deployment notes

- No Supabase SQL migration is required.
- No new environment variables are required.

## Version alignment

- App: Password-Encrypt Ver-1.029.01
- package.json/package-lock.json: 1.29.1
- Service worker cache: my-passwords-v1.029.01
- Server APP_VERSION: Password-Encrypt Ver-1.029.01
