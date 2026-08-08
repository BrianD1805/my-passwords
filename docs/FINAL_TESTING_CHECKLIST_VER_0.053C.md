# Password-Encrypt Ver-0.053C — Final Testing Checklist

Ver-0.053C is part of the final pre-launch fixes/improvements/testing series before Version 1.000. UX fixes can continue within the 0.053 lettered series until the product is ready for the final full regression pass.

## Targeted checks for Ver-0.053C

1. Confirm `Password-Encrypt Ver-0.053C` is visible after deploy.
2. Desktop footer: confirm the tagline reads `A trusted place for your private details that matter.` on one line, with lighter weight, and the link row has balanced spacing clear of the Back to top button.
3. Admin: browse Dashboard, Customers, Plans, Emails and Health and confirm normal body/label text is visibly lighter while headings, statuses and action buttons retain enough emphasis.
4. Landing and app Emergency Access: confirm the wording clearly describes next of kin / trusted-person access for incapacity, serious illness or another situation where the owner cannot access the vault.
5. Plan cards: confirm each document allowance appears only once. There must not be both `Document Limit - N` and `N encrypted documents`.
6. Admin → Plans: confirm every launch plan has an editable `Vault item limit`. For existing numbered tiers, verify the SQL migration populated the intended value; correct it in Admin if the tier name is not the intended allowance.
7. Landing plans: confirm the vault item allowance displays clearly on every plan.
8. Mobile landing page: swipe the plan row left/right and confirm cards use horizontal snap rather than vertical stacking.
9. Customer → Plan & Billing / My Subscription: confirm the Plan usage card reports vault items, encrypted documents and total account storage (encrypted cloud vault + encrypted documents), including the amount remaining where a limit applies.
10. Add vault items up to a test plan limit and confirm another new item is blocked with an upgrade/review-plan message while existing items remain accessible.
11. Confirm a vault edit/save still syncs normally when the item count is at or below the allowance.
12. Re-run the static suites and normal build before the final Version 1.000 regression pass.

## Important implementation note

The new password allowance is implemented as a **vault item limit**, not a server-side count of decrypted password records. Password-Encrypt intentionally does not decrypt vault records on the server. The allowance therefore counts normal encrypted vault records such as passwords, cards, notes and checklists while preserving the existing encrypted-vault design.
