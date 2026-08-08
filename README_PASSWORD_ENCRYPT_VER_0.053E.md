# Password-Encrypt Ver-0.053E — Urgent Mobile Landing Scroll Fix

Targeted regression patch over Ver-0.053D.

## Fix
- Removed page/root overflow containment introduced in Ver-0.053D.
- Rebuilt the mobile plan chooser as an isolated native horizontal swipe row.
- Removed the negative carousel margin, mandatory scroll snapping and forced snap stops.
- Preserved normal vertical document scrolling even when a gesture begins over the plan row.
- Retained all Ver-0.053C/0.053D FAQ, account-storage, landing flow and type-size improvements.

No database SQL or environment-variable changes are required.
