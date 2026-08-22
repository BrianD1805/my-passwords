# Password-Encrypt Ver-1.019.01 — Action Progress Popup Fix

This quick fix corrects the Ver-1.019 action-progress UI. The progress component existed and the check actions were calling it, but the component was only mounted in the public/landing render branch and was therefore not visible inside the unlocked vault where Settings checks are performed.

## Fix

- Mount `ActionProgressModal` in the unlocked vault render tree.
- Include `actionProgress.visible` in the global popup/body-scroll lock.
- Keep the existing animated working state, completed/warning/error result, and OK button.
- Keep the Ver-1.019 recovery retention limit and recovery wording unchanged.
- No Supabase SQL is required.
