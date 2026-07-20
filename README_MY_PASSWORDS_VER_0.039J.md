# My Passwords Ver-0.039J

## Calmer backup and verification UX

Ver-0.039J refines the Vault Sync Safety experience introduced in Ver-0.039H and Ver-0.039I.

### Changes

- Restores all normal toast notifications to light green.
- Uses light red toasts only when a problem or warning needs attention.
- Shortens the secure-device reminder toast to `Password check required.`
- Keeps the full password-check instructions on the vault login screen and in the guidance popup.
- Replaces automatic OTP email sending with a deliberate verification popup.
- The user now taps `Send email code`, enters the six-digit OTP, and taps `Verify device` inside the popup.
- Removes the OTP controls from My Account.
- `Fix now` and other verification actions open the OTP popup directly.
- After successful OTP verification, a pending backup is retried automatically.
- Prevents a pending-backup popup or banner from appearing while the original backup is still running.
- Cancels delayed stale popup timers after a backup succeeds.
- Reduces duplicate technical success messages after adding, editing, or deleting an item.
- Adds more space between the persistent warning banner and the next content panel.
- Improves popup footer button spacing and padding.
- Shows the full Vault Safety status button on mobile and keeps the complete top action row neatly aligned.

### Data and SQL

- No Supabase SQL is required.
- No encrypted vault data, snapshots, documents, accounts, subscriptions, or Emergency Access records are changed.

### Build

```text
my-passwords@0.0.39-j
```
