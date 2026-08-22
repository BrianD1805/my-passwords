# Password-Encrypt Ver-1.018 — Onboarding Flow Popup

## Change
- Removed the automatic Guided Tour welcome popup from normal vault startup.
- Onboarding Step 14 remains the only automatic onboarding decision point for the Guided Tour.
- Choosing **Start tour** at Step 14 opens the vault and starts the guided overlay directly, without a second welcome popup appearing behind it.
- The Guided Tour remains available manually from **Settings → Help and support → Take the guided tour**.
- Existing Guided Tour status persistence and new-account default Home-folder setup remain intact.
- Push-notification prompting no longer waits for the obsolete Guided Tour auto-offer state.

No Supabase SQL or database migration is required for Ver-1.018.
