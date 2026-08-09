import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
function check(name, pass) { checks.push({ name, pass: Boolean(pass) }); }

const migration = read('db/migrations/2026-08-07_reliability_monitoring_recovery_ver_0_051.sql');
const operations = read('netlify/functions/_operations.js');
const health = read('netlify/functions/admin-health.js');
const backup = read('netlify/functions/_database-backup.js');
const healthCheck = read('netlify/functions/operations-health-check.js');
const accountTrial = read('netlify/functions/account-trial-check.js');
const emergency = read('netlify/functions/emergency-access-release-process.js');
const customerLifecycle = read('netlify/functions/customer-lifecycle-email-process.js');
const sync = read('netlify/functions/sync-vault.js');
const webhook = read('netlify/functions/stripe-webhook.js');
const email = read('netlify/functions/_customer-email.js');
const diagnostics = read('netlify/functions/admin-customer-detail.js');
const clientErrors = read('netlify/functions/client-error-report.js');
const main = read('src/main.jsx');
const netlify = read('netlify.toml');
const retention = read('netlify/functions/operational-retention-cleanup.js');
const pkg = JSON.parse(read('package.json'));

check('Ver-0.053J version and cache are aligned', pkg.version === '0.0.53-j' && /Password-Encrypt Ver-0\.053J/.test(main) && /my-passwords-v0\.053J/.test(read('public/sw.js')));
check('Operational monitoring tables use RLS and service-role-only grants', /create table if not exists public\.operational_events/.test(migration) && /create table if not exists public\.scheduled_check_runs/.test(migration) && /create table if not exists public\.stripe_reconciliation_runs/.test(migration) && /enable row level security/.test(migration) && /revoke all on table public\.operational_events[\s\S]*from anon, authenticated/.test(migration) && /grant select, insert, update, delete on public\.operational_events to service_role/.test(migration));
check('Operational metadata has a sensitive-key denylist and text redaction', /SENSITIVE_KEY/.test(operations) && /encrypted_blob/.test(operations) && /master_password/.test(operations) && /recovery_code/.test(operations) && /provider-key-redacted/.test(operations));
check('Failed functions create sanitised operational events', /queueFunctionFailureResponse/.test(read('netlify/functions/_db.js')) && /eventType: 'function_failure'/.test(read('netlify/functions/_db.js')) && /recordFunctionFailure/.test(operations));
check('Stripe webhook failures create critical operational alerts', /stripe_webhook_processing_failure/.test(webhook) && /stripe_webhook_failure_alert/.test(healthCheck) && /recordFunctionFailure\('stripe-webhook'/.test(webhook));
check('Resend failures are tracked without storing recipient addresses in operational events', /resend_delivery_failure/.test(email) && /emailType/.test(email) && /recordOperationalEvent/.test(email));
check('Vault backup failures and sync conflicts feed operational monitoring', /eventType: 'backup_failure'/.test(sync) && /eventType: 'sync_conflict'/.test(sync) && /backup_conflict_blocked/.test(sync));
check('Account/trial and Emergency Access checks have scheduled run history', /startScheduledCheck\('account_trial_lifecycle'/.test(accountTrial) && /startScheduledCheck\('emergency_access_release'/.test(emergency) && /startScheduledCheck\('customer_lifecycle_email'/.test(customerLifecycle));
check('Database backup verification uses the Supabase Management API and never returns the access token', /api\.supabase\.com\/v1\/projects/.test(backup) && /SUPABASE_ACCESS_TOKEN/.test(backup) && !/accessToken\s*[:,]\s*accessToken/.test(backup));
check('Backup verification treats unavailable managed backups as non-failing and recognises physical backup dates', /status: 'not_available'/.test(backup) && /latest_physical_backup_date_unix/.test(backup) && /managedBackupUnavailable/.test(backup));
check('Backup verification detects the Supabase organization Free plan before judging backup rows', /supabaseOrganizationPlan/.test(backup) && /v1\/projects\/\$\{encodeURIComponent\(ref\)\}/.test(backup) && /v1\/organizations\/\$\{encodeURIComponent\(organizationSlug\)\}/.test(backup) && /organizationPlan/.test(backup) && /freePlan/.test(backup));
check('Health dashboard is admin-session protected and mutating actions require CSRF', /validateAdminSession\(event/.test(health) && /assertBrowserAction\(event, \{ session, kind: 'admin', csrf: true \}/.test(health) && /run_health_check/.test(health));
check('Stripe reconciliation is preview-first, expires, and refreshes only the existing linked subscription', /status: 'preview'/.test(health) && /10 \* 60000/.test(health) && /provider_subscription_id/.test(health) && /refreshStripeSubscriptionForTenant\(run\.tenant_id\)/.test(health) && !/stripeRequest\([^\n]*method: 'DELETE'/.test(health));
check('Stripe reconciliation compares CurrentPeriodEnd as an instant, not raw timestamp text', /reconciliationValuesEqual/.test(health) && /field === 'currentPeriodEnd'/.test(health) && /localMs === providerMs/.test(health));
check('Customer support diagnostics query metadata only', /generate_diagnostics/.test(diagnostics) && /select=id,created_at&tenant_id/.test(diagnostics) && /containsVaultContents: false/.test(diagnostics) && /containsDocumentContents: false/.test(diagnostics) && /ownerEmailMasked/.test(diagnostics));
check('Browser error reporting excludes exception messages and stacks', /client-error-report/.test(main) && /without exception text or vault content/.test(clientErrors) && !/body\.message/.test(clientErrors) && !/body\.stack/.test(clientErrors));
check('Monitoring and cleanup schedules are configured', /operations-health-check"\]\n\s*schedule = "\*\/15 \* \* \* \*"/.test(netlify) && /account-trial-check"\]\n\s*schedule = "\*\/30 \* \* \* \*"/.test(netlify) && /database-backup-verify"\]\n\s*schedule = "30 5 \* \* \*"/.test(netlify) && /operational-retention-cleanup"\]\n\s*schedule = "10 4 \* \* \*"/.test(netlify));
check('Operational retention rules do not delete customer vault data', /operational_events\?retention_until/.test(retention) && /scheduled_check_runs\?created_at/.test(retention) && /stripe_reconciliation_runs\?created_at/.test(retention) && !/vault_snapshots\?/.test(retention) && !/document_blobs\?/.test(retention));
check('Resolved sync-conflict alerts create an acknowledgement checkpoint and are not reopened by the same historical rows', /latestSyncConflictWindowStart/.test(healthCheck) && /status=eq\.resolved/.test(healthCheck) && /event_type=eq\.sync_conflicts/.test(healthCheck) && /created_at=\$\{gt\(syncConflictWindowStart\)\}/.test(healthCheck) && /incrementOccurrenceOnDedupe: alert\.type !== 'sync_conflicts'/.test(healthCheck));
check('Operations health covers database, Stripe, email, backup, sync, functions and scheduled processors', /databaseReachable/.test(healthCheck) && /failedStripeWebhooks/.test(healthCheck) && /resendFailures24h/.test(healthCheck) && /backupFailures24h/.test(healthCheck) && /syncConflicts24h/.test(healthCheck) && /functionFailures24h/.test(healthCheck) && /emergencyProcessorStale/.test(healthCheck));

const failed = checks.filter((item) => !item.pass);
for (const item of checks) console.log(`${item.pass ? 'PASS' : 'FAIL'}  ${item.name}`);
if (failed.length) {
  console.error(`\n${failed.length} reliability static check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} reliability static checks passed.`);
