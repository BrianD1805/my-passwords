# Password-Encrypt Ver-0.053G — UX Polish & Progressive Settings

Built on Ver-0.053F.

## Changes
- Increased spacing between landing-page plan cards by 15px (16px → 31px).
- Added subtle alternating left/right fade-and-slide reveal as plans enter the viewport. No carousel or horizontal page scrolling is used; reduced-motion users receive no animation.
- Upgraded landing FAQs to a premium numbered disclosure treatment with clean borders and open-state emphasis, without coloured shadows.
- Removed the parenthetical “passwords, cards, notes & more” from the public plan item allowance.
- Reworked My Account, My Subscription, Vault Safety and Trusted Person Access into Settings-style progressive drill-down sections so customers choose the information/action they want instead of seeing every panel at once.
- Renamed the customer Settings directory item from Emergency Access to Trusted Person Access while preserving the existing Emergency Access workflow and legal terminology where required.

## Database / environment
No Supabase SQL changes are required.
No new Netlify environment variables are required.

## Local checks
Run from the existing project directory:

npm run security:check && npm run reliability:check && npm run legal:check && npm run ux:check && npm run mobile:check && npm run build && netlify dev --no-open

## Deploy

git status && git add -A && git commit -m "Password-Encrypt Ver-0.053G UX polish and progressive settings" && git push origin main
