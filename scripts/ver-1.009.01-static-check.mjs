import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const main = read('src/main.jsx');
const adminEmails = read('src/AdminAutomatedEmails.jsx');
const css = read('src/styles.css');
const db = read('netlify/functions/_db.js');
const helper = read('netlify/functions/_admin-notification.js');
const automated = read('netlify/functions/admin-automated-emails.js');
const verifyOtp = read('netlify/functions/verify-otp-test.js');
const stripeWebhook = read('netlify/functions/stripe-webhook.js');
const accountSecurity = read('netlify/functions/account-security.js');
const trialRequest = read('netlify/functions/trial-extension-request.js');
const adminData = read('netlify/functions/admin-data.js');
const migration = read('db/migrations/2026-08-20_admin_email_notifications_ver_1_009.sql');
const dbHealth = read('netlify/functions/db-health.js');
const sw = read('public/sw.js');
const offline = read('public/offline.html');
const pkg = JSON.parse(read('package.json'));

const checks = [];
function check(name, condition) { checks.push({ name, ok: Boolean(condition) }); }

check('App version is Ver-1.009.01', /Password-Encrypt Ver-1\.009\.01/.test(main));
check('npm version is 1.9.1', pkg.version === '1.9.1');
check('Server version is Ver-1.009.01', /Password-Encrypt Ver-1\.009\.01/.test(db));
check('Service worker cache is Ver-1.009.01', /my-passwords-v1\.009\.01/.test(sw));
check('Offline page is Ver-1.009.01', /Password-Encrypt Ver-1\.009\.01/.test(offline));
check('Admin notification settings table exists in migration', /admin_notification_settings/.test(migration));
check('Admin notification log has unique idempotency key', /idempotency_key text not null unique/.test(migration));
check('Trial extension requests table exists', /trial_extension_requests/.test(migration));
check('Browser roles are revoked from Admin notification settings', /revoke all on table public\.admin_notification_settings from anon, authenticated/.test(migration));
check('Service role receives explicit grants', /grant select, insert, update, delete on public\.admin_notification_log to service_role/.test(migration));
check('Admin recipient defaults to requested address', /bdh1805@gmail\.com/.test(migration) && /bdh1805@gmail\.com/.test(helper));
check('Admin UI exposes recipient and event toggles', /Admin email notifications/.test(adminEmails) && /new_client_onboarded/.test(automated));
check('Admin Save is disabled when there are no changes', /!adminNotificationsDirty/.test(adminEmails));
check('Admin can send safe test notification', /send_admin_notification_test/.test(automated) && /admin_test/.test(helper));
check('Onboarding completion triggers one Admin notification', /new_client_onboarded/.test(verifyOtp) && /new_client_onboarded:\$\{tenant\.id\}/.test(verifyOtp));
check('New paid subscription triggers Admin notification', /new_subscription_purchased/.test(stripeWebhook));
check('Payment failure triggers Admin notification', /payment_failed_admin/.test(stripeWebhook));
check('Subscription cancellation triggers Admin notification', /subscription_cancelled_admin/.test(stripeWebhook));
check('Account deletion request triggers Admin notification', /account_deletion_requested_admin/.test(accountSecurity));
check('Customer can request a trial extension', /trial-extension-request/.test(main) && /trial_extension_requested/.test(trialRequest));
check('Trial request requires authenticated customer session', /validateCustomerSession/.test(trialRequest) && /assertBrowserAction/.test(trialRequest));
check('Trial request is rate limited', /trial_extension_request_ip/.test(trialRequest) && /trial_extension_request_user/.test(trialRequest));
check('Only one pending trial request per tenant', /idx_trial_extension_requests_one_pending/.test(migration));
check('Admin extension resolves pending request', /trial_extension_requests/.test(adminData) && /status: 'approved'/.test(adminData));
check('Admin notification email excludes vault content by design', /No vault contents or encryption secrets/.test(helper));
check('Database health checks Ver-1.009 schema', /admin_notification_settings/.test(dbHealth) && /trial_extension_requests/.test(dbHealth));
check('Responsive styles exist for Admin email controls', /admin-owner-event-grid/.test(css) && /trial-extension-request-card/.test(css));
check('Admin owner controls use compact switch UX', /admin-owner-switch/.test(css) && /Automatic Admin emails/.test(adminEmails));
check('Notification events use balanced card grid', /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/.test(css) && /admin-owner-event-icon/.test(adminEmails));
check('Admin notification actions have compact labels', /Send test/.test(adminEmails) && /Save changes/.test(adminEmails));
check('Recent Admin emails have a dedicated section', /Recent Admin emails/.test(adminEmails) && /admin-owner-history-heading/.test(css));

for (const item of checks) console.log(`${item.ok ? 'PASS' : 'FAIL'}  ${item.name}`);
const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`\n${failed.length} Ver-1.009.01 feature check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length}/${checks.length} Ver-1.009.01 Admin Email UX checks passed.`);
