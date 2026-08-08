# Password-Encrypt Ver-0.053D — Urgent Mobile Regression Fix

This patch is based on Ver-0.053C and fixes a mobile-only viewport/text autosizing regression that could make the landing page render dramatically oversized.

## Fix
- Pins mobile browser text autosizing to 100%.
- Constrains the landing page, sections and child layout boxes to the device viewport.
- Prevents page-level horizontal overflow.
- Keeps intentional horizontal scrolling isolated to the mobile plan carousel.
- Adds bounded mobile heading sizes using `clamp()`.
- Preserves all Ver-0.053C FAQ, account-wide storage and landing-flow changes.

No database or environment changes are required.
