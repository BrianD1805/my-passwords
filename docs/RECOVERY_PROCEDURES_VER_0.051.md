# My Passwords Ver-0.051 — Recovery Procedures

## Safety rule

Operational recovery must preserve the client-side encryption and vault privacy boundary. Do not request, copy, log or place into diagnostics any customer's master password, readable vault entry, decrypted document, OTP, recovery code, cookie, session token, encryption key or provider secret.

Use Admin > Health and the customer **Safe diagnostics report** first. Those tools are designed to expose metadata only.

## 1. Function failure

1. Open Admin > Health and identify the function/event type, error code, last-seen time and occurrence count.
2. Check whether Supabase, Stripe, Resend or a scheduled processor is also showing a warning/error.
3. Reproduce only with non-sensitive test data when possible.
4. Resolve the operational event only after the underlying function succeeds again or the cause is understood.
5. If the failure involves vault save/sync, do not advise the customer to overwrite local data until the sync/backup state is understood.

## 2. Stripe webhook failure

1. Treat an open Stripe webhook failure as billing-state uncertainty, not permission to change the customer's subscription manually.
2. Check Stripe's event/webhook delivery record and My Passwords Admin > Health.
3. If the Stripe subscription itself is correct but My Passwords looks stale, use **Stripe reconciliation**.
4. Choose the customer and run **Preview reconciliation**.
5. Verify the differences. The preview expires after 10 minutes.
6. Use **Apply local metadata reconciliation** only if the preview is expected.

The reconciliation tool reads the already-linked server-side Stripe subscription and updates local My Passwords billing metadata only. It cannot create, cancel, upgrade, downgrade or charge a subscription.

If `OPS_ALERT_EMAIL` is configured, unresolved Stripe webhook failures can also generate a throttled metadata-only alert email.

## 3. Resend delivery failure

1. Check Admin > Health and Admin > Automated Emails.
2. Confirm `RESEND_API_KEY` and `OTP_EMAIL_FROM` remain configured.
3. Review the provider result using the message ID/provider logs where available.
4. Retry through the existing email retry workflow where supported.
5. Emergency Access release-ready email failures remain visible and are retried by the existing scheduled processor; do not manually change Emergency Access release state just to force an email.

Operational events do not store email body content or recipient addresses.

## 4. Vault backup failure or sync conflict

1. Check Admin > Health and Sync Health for metadata such as device ID/type, item count and timestamps.
2. Do not open, request or decrypt the customer's vault to diagnose the issue.
3. For a blocked conflict, preserve both sides until the customer can identify which device has the expected current data.
4. Do not force a cloud overwrite merely to clear the warning.
5. After a successful safe sync/backup, confirm the latest success timestamp and resolve the operational alert if it has not auto-resolved.

## 5. Scheduled account/trial issue

The 30-minute account/trial check looks for trial states that are still active after the recorded trial end and Stripe subscriptions whose reconciliation timestamp is stale.

1. Open Admin > Health and inspect the warning count.
2. For a Stripe customer, use preview reconciliation before making any local correction.
3. For a non-Stripe expired trial, confirm the lifecycle processor has run and the account state is expected.
4. Never change a plan or subscription merely to make the health dashboard green.

## 6. Emergency Access scheduled check

The existing release processor remains scheduled every five minutes and now records check-run health.

1. A successful run should appear regularly under Admin > Health > Latest check runs.
2. If no successful run appears within the health threshold, treat it as urgent because a nominee may be waiting for a release window to complete.
3. Check the function failure and Resend sections before changing an Emergency Access request.
4. Do not shorten or bypass a waiting period to compensate for an operational failure.

## 7. Database backup verification

The app verifies two separate things:

- Supabase data-plane reachability; and
- when configured, the latest completed managed database backup reported by the Supabase Management API.

Required server-only environment variable: `SUPABASE_ACCESS_TOKEN`. `SUPABASE_PROJECT_REF` is optional because it can normally be derived from `SUPABASE_URL`.

A completed backup older than the 36-hour verification window produces a warning/failure status requiring investigation.

### Restore procedure

Database restore is deliberately **not automated inside My Passwords** because restore is destructive and should remain an explicit infrastructure operation.

Before restoring:

1. Confirm the incident and affected time range.
2. Record the current database/project state and stop avoidable writes if necessary.
3. Select the correct Supabase backup/PITR point using the Supabase dashboard or approved management process.
4. Restore according to the Supabase recovery procedure.
5. Validate tenant/account, billing, Emergency Access and operational tables before declaring recovery complete.
6. Validate encrypted vault snapshot metadata only; do not inspect decrypted customer vault contents.
7. Run Admin > Health after recovery and verify scheduled processors resume.

## 8. Customer support diagnostics

From Admin > Customers > customer detail, generate **Safe diagnostics report**.

The report may contain account identifiers, masked contact details, plan/status, session/device counts, backup/sync timestamps and counts, billing metadata, email failure counts, document count and operational event codes.

It explicitly excludes:

- passwords and master passwords;
- readable or decrypted vault values;
- encrypted vault payloads;
- document contents;
- OTPs and recovery codes;
- cookies/session tokens;
- encryption material;
- Stripe, Supabase, Resend or Twilio secrets.

If support needs data outside that report, first decide whether the request can be satisfied with additional metadata. Do not expand diagnostics to include vault content.

## 9. Operational history retention

The daily cleanup removes only expired operational events, old scheduled-check records and old Stripe reconciliation records. It must never be changed to target customer vault/snapshot/document tables as part of routine operational retention.

## 10. Post-recovery verification

After any incident:

1. Run Admin > Health manually.
2. Confirm Supabase, Stripe/webhooks, Resend and database-backup status.
3. Confirm the customer lifecycle and Emergency Access scheduled processors have recent successful runs.
4. Confirm new vault sync/backup metadata is healthy if the incident involved sync.
5. Leave an operational event unresolved until the recovery has actually been verified.
