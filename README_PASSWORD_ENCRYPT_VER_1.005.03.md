# Password-Encrypt Ver-1.005.03 — Emergency Package Import in Settings

## Changes
- Moves Emergency Package import out of the Emergency Info vault folder and into Settings → Emergency Access.
- Adds a dedicated Import Emergency Package section with Enter Import Code.
- Shows previously imported Emergency Packages in the same Settings section.
- Importing does not depend on the user retaining the default Emergency Info folder or starter item.
- New vaults no longer create the old Emergency Access starter/hub item.
- Existing system Emergency Access hub/starter items are removed automatically after vault unlock; imported package folders remain intact.
- The owner-side Trusted Person planning flow remains in the same Emergency Access Settings page.
- Public release and FAQ instructions now point to Settings → Emergency Access → Import Emergency Package.

## Database / environment
No new SQL is required beyond the Ver-1.005.02 Emergency Import Code migration. No new environment variables are required.
