# Password-Encrypt Ver-1.005.05 — Emergency Access Settings Menu Correction

Under **Settings → Protection and recovery**, Emergency Access now appears as two separate Settings panels:

- **Emergency Access** — Nominate a trusted person to receive your prepared Emergency Package.
- **Emergency Access** — Receive an Emergency Package released to you.

Each panel opens its own dedicated Settings page. The nomination/management flow and package-receiving flow are no longer combined on the same page.

Existing Emergency Access owner links and push-notification deep links continue to open the nomination/management page.

No new Supabase SQL is required.
No new Netlify environment variables are required.
Existing VAPID keys remain unchanged.

Version alignment:
- App: Password-Encrypt Ver-1.005.05
- npm: 1.5.5
- Service worker cache: my-passwords-v1.005.05
- Server APP_VERSION: Password-Encrypt Ver-1.005.05
