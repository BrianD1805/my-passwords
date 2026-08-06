# My Passwords Ver-0.047D — Back Navigation, Results and Folder Management

## Build summary

- Corrected mobile device Back handling so the first Back press on the unlocked Passwords home page opens the leave-app confirmation.
- The locked vault login page no longer opens the home-page confirmation; Back may leave the entry screen normally.
- Back still closes open dropdowns and popups first and returns Settings to the Passwords home page.
- Increased the green popup top accent to 9px, removed the pale top-edge line, and extended the right-side fade to approximately half the popup height.
- Replaced the heavy solid-blue password-result interaction with a subtle pale-blue focus/press treatment.
- Password and vault search results now sort alphabetically, with titles beginning with numbers or special characters placed after lettered titles.
- Added Manage folders access on desktop and mobile. Custom folders can be renamed or deleted.
- Deleting a custom folder never deletes its saved items; those items move safely to the built-in Passwords folder.
- No database migration is required.
- Vault encryption, master-password handling, SMS, account sessions and subscription logic are unchanged.
