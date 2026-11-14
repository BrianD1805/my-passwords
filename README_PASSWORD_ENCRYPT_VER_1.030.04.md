# Password-Encrypt Ver-1.030.04

## Continuous downward mobile movement

- Fixes mobile devices that bundle a longer finger slide into one movement event.
- Reordering now calculates the total distance travelled from the original press point.
- One row-height moves one position, two row-heights move two positions and three row-heights move three positions.
- The row continues moving downward for the full deliberate gesture instead of stopping after the first position.
- Upward movement uses the same distance calculation and remains symmetrical.
- The correction applies to both checklist edit mode and the uncluttered mobile view screen.

## Regression protection

- Confirms one downward row-height produces exactly one move.
- Confirms three downward row-heights received in one phone event produce exactly three moves.
- Confirms the same bundled movement works upward.
- Retains the earlier protection against an item unexpectedly shooting straight to the bottom.

## Deployment notes

- No Supabase SQL migration is required.
- No new environment variables are required.

## Version alignment

- App: Password-Encrypt Ver-1.030.04
- package.json/package-lock.json: 1.30.4
- Service worker cache: my-passwords-v1.030.04
- Server APP_VERSION: Password-Encrypt Ver-1.030.04
