# Password-Encrypt Ver-1.029.02

## Guided-tour layout correction

- Moves each highlighted Settings control into a predictable position near the top of the visible page.
- Anchors the explanation panel beneath the measured bottom edge of the highlight.
- Keeps a deliberate 24-pixel desktop gap and 18-pixel mobile gap between the highlight and explanation.
- Gives the explanation panel its own viewport-aware scrolling when a small screen cannot show the whole panel at once.
- Adds temporary page-bottom room while a tour is active so controls near the end of Settings can also move upward cleanly.

## Preserved Ver-1.029.01 presentation

- Keeps the single, even and softened spotlight introduced in Ver-1.029.01.
- Keeps the English-only introduction wording and all 35 Settings tour steps.

## Regression coverage

- Confirms the old centre-scroll and top/bottom card-switch behaviour is removed.
- Confirms target positioning and card placement are based on measured viewport geometry.
- Confirms the desktop and mobile gaps, card height limits and temporary scrolling room.
- Confirms the prior backup retry, secure-device refresh and guided-tour presentation protections remain intact.

## Deployment notes

- No Supabase SQL migration is required.
- No new environment variables are required.

## Version alignment

- App: Password-Encrypt Ver-1.029.02
- package.json/package-lock.json: 1.29.2
- Service worker cache: my-passwords-v1.029.02
- Server APP_VERSION: Password-Encrypt Ver-1.029.02
