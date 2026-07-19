# My Passwords Ver-0.039D

## Master-password typing regression fix

- Corrects the Ver-0.039C regression where each new master-password character replaced the previous character.
- The master-password field is still protected from background autofill while untouched.
- The field is armed once when the user deliberately focuses or taps it, then accepts normal continuous typing.
- Existing Ver-0.039B Add Item autofill isolation remains unchanged.
- No database changes are required.
