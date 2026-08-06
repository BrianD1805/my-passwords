# My Passwords Ver-0.047F — Popup Right-Edge Outline Correction

## Change

- Removed the remaining pale/white physical popup border from the top and right edges.
- Shifted the existing six-pixel green accent outward by one pixel so it sits flush with the popup edge around the top-right curve and down the right-hand fade.
- The approved green thickness, top fade position, corner curve, and halfway-down right-side fade are unchanged.
- The normal faint popup border remains on the left and bottom edges.

## Local testing

Run from the current project directory:

```bat
npm run build
netlify dev --no-open
```

After Netlify reports that port 8888 is ready, manually open `http://localhost:8888`.

## Database

No Supabase SQL is required for this patch.
