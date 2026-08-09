# Ver-0.054 Trusted Person Flow — staged live testing

Use a disposable/test customer where possible. Test one stage at a time and correct wording/behaviour before advancing.

## Test 1 — Reset to zero

Open Settings → Trusted Person Access. If an existing flow is present, choose `Reset to zero` from the action dropdown and confirm it.

Expected:
- trusted person fields return empty;
- invitation/request links disappear;
- current stage returns to Stage 1 — Add your trusted person;
- emergency package fields return to their defaults;
- Event history contains no prior flow events.

## Test 2 — Save onboarding sections

Enter trusted-person details and use `Save trusted person`. Configure the Emergency package and use `Save emergency package` separately.

Expected: each section saves independently and gives its own completion feedback.

## Test 3 — Send invitation

From Current stage & actions choose `Send invitation`.

Expected:
- current stage becomes Stage 2 — Waiting for your trusted person;
- Event history records the invitation event with a date/time;
- trusted person email explains Stage 1, serious emergency/incapacity purpose, that no vault data is currently available, acceptance/decline, and what happens after acceptance.

## Test 4 — Accept nomination

Open the trusted-person nomination link and accept it.

Expected:
- owner moves to Stage 3 — Trusted person accepted;
- trusted person receives a separate Request Access email;
- email clearly says no vault contents are available yet and explains that using Request Access starts the waiting period;
- Event history records acceptance.

## Test 5 — Request emergency access

Use the trusted person's Request Access link.

Expected:
- current stage becomes Stage 4 — Waiting period active;
- owner receives an email explaining the request, waiting period, no release yet, and how to cancel;
- Event history records request and owner notification.

## Test 6 — Cancel during waiting period

From owner Current stage & actions choose `Cancel emergency request`.

Expected: request is cancelled before release and Event history records it.

Repeat from Reset to zero if necessary for release testing.

## Test 7 — Release-ready stage

For testing use the existing short testing waiting period. Allow the scheduled release processor to run or trigger the existing test mechanism.

Expected:
- current stage becomes Stage 5 — Emergency package ready;
- trusted person receives the final-stage email;
- only the prepared emergency package is available;
- Event history records release-ready state.

## Test 8 — Admin hard delete (disposable account only)

Admin → Customers → disposable test account → Account operations → Delete account permanently.

Expected:
- Admin requires `DELETE` and a second confirmation;
- live Stripe subscription, if any, is cancelled before deletion;
- account disappears from Admin/customer sign-in;
- account holder receives the account-deleted email;
- no deletion reason is stated in the email.

Do not test this on the Founder account or a customer account containing data you need to preserve.
