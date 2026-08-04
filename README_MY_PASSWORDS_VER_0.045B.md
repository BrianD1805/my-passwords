# My Passwords Ver-0.045B — Shared Custom Dropdown System

## What changed

- Added one reusable custom dropdown component for My Passwords.
- Replaced the remaining native browser dropdowns in the vault, subscription settings, Emergency Access, and Admin entitlement overrides.
- Matched the dropdown trigger, menu, selected state, disabled state, focus ring, spacing, and colours to the existing My Passwords design.
- Added keyboard support for Arrow Up, Arrow Down, Home, End, Enter, Space, Escape, and Tab.
- Added click-outside closing, automatic upward/downward opening, viewport-safe positioning, and internal menu scrolling.
- Preserved all existing form values, save logic, subscription logic, Emergency Access logic, and Admin entitlement logic.

## Files added

- `src/CustomSelect.jsx`

## Files updated

- `src/main.jsx`
- `src/AdminApp.jsx`
- `src/styles.css`
- `package.json`
- `package-lock.json`
- `public/sw.js`
- `public/offline.html`
- `netlify/functions/_db.js`

## Database

No Supabase SQL is required for Ver-0.045B.
