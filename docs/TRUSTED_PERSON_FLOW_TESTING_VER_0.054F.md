# Password-Encrypt Ver-0.054F — Trusted Person reminder testing

## UX checks

- Current-stage blue rail remains 3px and fades/tapers at both ends.
- Desktop vault login `Password-Encrypt` heading is visibly about 5px smaller.
- Mobile vault login heading remains unchanged.

## Quarterly reminder behaviour

- Only accepted Trusted Person nominations are eligible.
- First reminder becomes due three calendar months after acceptance.
- Later reminders become due three calendar months after the previous successfully sent reminder.
- A daily scheduled processor checks due dates; it must not email the same nomination every day.
- If an Emergency Access request/release is active, quarterly reminders pause.
- Reminder email clearly states that it does not start Emergency Access or reveal vault data.
- Reminder email tells the nominee to keep the original `Password-Encrypt Emergency Access — Keep this link safe` email.
- Reminder email contains `Yes, I’m still the trusted person`.
- The email button opens Password-Encrypt; confirmation requires a deliberate second click on the confirmation page so automated mail scanners cannot confirm.
- Confirmation appears in the owner's optional Trusted Person Event history with a date/time.
- Confirmation does not alter the Emergency Access request status.
- Confirmation link expires after 30 days.
- A superseded old reminder link cannot confirm a newer quarterly reminder.

## No schema change

Reminder sent/confirmed metadata and audit events use the existing `emergency_access_invitations.metadata` record and existing metadata-only flow event history.
