import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
const main = read('src/main.jsx');
const admin = read('src/AdminPushNotifications.jsx');
const css = read('src/styles.css');
const sw = read('public/sw.js');
const db = read('netlify/functions/_db.js');
const helper = read('netlify/functions/_push.js');
const subscription = read('netlify/functions/push-subscription.js');
const adminFn = read('netlify/functions/admin-push-notifications.js');
const response = read('netlify/functions/emergency-access-response.js');
const request = read('netlify/functions/emergency-access-request.js');
const release = read('netlify/functions/emergency-access-release-process.js');
const reminder = read('netlify/functions/trusted-person-reminder-confirm.js');
const migration = read('db/migrations/2026-08-12_push_notifications_ver_1_001.sql');
const accountSecurity = read('netlify/functions/account-security.js');
const sessionStatus = read('netlify/functions/session-status.js');
const retention = read('netlify/functions/operational-retention-cleanup.js');

let failed = 0;
function check(label, condition) {
  if (condition) console.log(`PASS  ${label}`);
  else { failed += 1; console.error(`FAIL  ${label}`); }
}

check('Ver-1.013 app/server/package/service-worker versions align', pkg.version === '1.13.0' && /Password-Encrypt Ver-1\.013/.test(main) && /Password-Encrypt Ver-1\.013/.test(db) && /my-passwords-v1\.013/.test(sw));
check('Push subscriptions are bound to validated customer sessions', /validateCustomerSession/.test(subscription) && /session\.tenantId/.test(subscription) && /session\.userId/.test(subscription) && /assertBrowserAction/.test(subscription));
check('Push subscription writes require CSRF browser action protection', /kind: 'customer', csrf: true/.test(subscription));
check('VAPID private key remains server-side', /PUSH_VAPID_PRIVATE_KEY/.test(helper) && !/PUSH_VAPID_PRIVATE_KEY/.test(main));
check('Push payload encryption uses ECDH, HKDF and AES-128-GCM', /createECDH\('prime256v1'\)/.test(helper) && /hkdfSync/.test(helper) && /aes-128-gcm/.test(helper) && /aes128gcm/.test(helper));
check('Expired push endpoints are disabled automatically', /status === 404 \|\| status === 410/.test(helper) && /status: gone \? 'disabled'/.test(helper));
check('Service worker handles push and notification click', /addEventListener\('push'/.test(sw) && /showNotification/.test(sw) && /addEventListener\('notificationclick'/.test(sw) && /openWindow/.test(sw));
check('Notification clicks are restricted to same-origin targets', /candidate\.origin === self\.location\.origin/.test(sw));
check('Customer UI requires an explicit notification permission action', /Notification\.requestPermission\(\)/.test(main) && /Enable push notifications/.test(main));
check('Trusted Person settings promote owner push alerts', /Emergency push alerts are active/.test(main) && /Emergency Access warnings/.test(main));
check('Admin push controls require validated Admin session and CSRF', /validateAdminSession/.test(adminFn) && /kind: 'admin', csrf: true/.test(adminFn));
check('Admin can edit automatic push text', /save_template/.test(adminFn) && /Automatic notification text/.test(admin));
check('Admin can send one broadcast to all active subscriptions', /send_broadcast/.test(adminFn) && /sendPushToAll/.test(adminFn) && /Send push to all users/.test(admin));
check('Trusted Person acceptance and decline trigger owner push', /trusted_person_accepted/.test(response) && /trusted_person_declined/.test(response));
check('Emergency Access request triggers high-priority owner push', /emergency_access_requested/.test(request) && /urgency: 'high'/.test(request) && /requireInteraction: true/.test(request));
check('Emergency package release triggers owner push once', /emergency_package_released/.test(release) && /owner_release_push_processed_at/.test(release));
check('Trusted Person reminder confirmation triggers owner push', /trusted_person_reminder_confirmed/.test(reminder));
check('Push database tables use RLS and service-role grants', /create table if not exists public\.push_subscriptions/.test(migration) && /create table if not exists public\.push_notification_templates/.test(migration) && /create table if not exists public\.push_notification_log/.test(migration) && /enable row level security/.test(migration) && /grant select, insert, update, delete on public\.push_subscriptions to service_role/.test(migration));
check('Automatic notification templates are seeded for Trusted Person owner control', /trusted_person_accepted/.test(migration) && /trusted_person_declined/.test(migration) && /emergency_access_requested/.test(migration) && /emergency_package_released/.test(migration) && /trusted_person_reminder_confirmed/.test(migration));
check('Push UI states that vault contents never enter notification text', /Push notifications contain status messages only/.test(main));
check('Push subscriptions are locally bound to the signed-in account', /PUSH_BINDING_KEY/.test(main) && /bindingMatches/.test(main) && /savePushBinding\(customerSession\.tenantId, customerSession\.userId\)/.test(main));
check('Browser subscriptions are never silently rebound to another account', /Never auto-rebind/.test(main) && /linkedToAnotherAccount/.test(main));
check('Ending sessions or removing devices disables their push subscriptions', /push_subscriptions/.test(sessionStatus) && /Account session ended on this device/.test(sessionStatus) && /Verified device removed by customer/.test(accountSecurity) && /All account sessions ended by customer/.test(accountSecurity));
check('Push delivery logs have retention and scheduled cleanup', /retention_until timestamptz not null default/.test(migration) && /push_notification_log\?retention_until=lt/.test(retention));
check('App opening automatically prompts when push is available but inactive', /pushActivationPromptShownRef/.test(main) && /!pushNotifications\.enabledThisDevice/.test(main) && /setPushActivationPromptOpen\(true\)/.test(main) && /Activate notifications/.test(main) && main.lastIndexOf('<PushActivationPromptModal') > main.indexOf('const inviteStatusText'));
check('Blocked browser notification permission routes user to review settings', /permission === 'denied'/.test(main) && /Review settings/.test(main) && /openSettingsSection\('notifications'\)/.test(main));
check('Admin notification types use a single dropdown selector', /admin-push-template-picker/.test(admin) && /Choose push notification type/.test(admin) && /selectedDraft/.test(admin));
check('Admin broadcast appears before automatic notification editor', admin.indexOf('Send to all enabled users') >= 0 && admin.indexOf('Send to all enabled users') < admin.indexOf('Automatic notification text'));
check('Admin template Save stays disabled until content changes', /selectedHasChanges/.test(admin) && /disabled=\{Boolean\(busyKey\) \|\| !selectedHasChanges\}/.test(admin));
check('Admin broadcast confirmation uses Password-Encrypt popup instead of browser confirm', /broadcastConfirmOpen/.test(admin) && /admin-push-confirm-window/.test(admin) && /Send notification to all enabled users\?/.test(admin) && !/window\.confirm/.test(admin));
check('Push activation prompt uses generic account and Admin message wording', /Activate push notifications on this device\./.test(main) && /Password-Encrypt account and Admin messages/.test(main) && !/if your trusted person starts Emergency Access, even when you are not actively using the app/.test(main));
check('Push activation popup buttons have explicit spacing on mobile', /\.push-activation-prompt-footer \{[\s\S]*?display:\s*flex;[\s\S]*?gap:\s*12px;/.test(css) && /@media \(max-width: 720px\) \{[\s\S]*?\.push-activation-prompt-footer \{[\s\S]*?gap:\s*10px;/.test(css));

if (failed) {
  console.error(`\n${failed} push notification static check(s) failed.`);
  process.exit(1);
}
console.log('\nAll 32 push notification static checks passed.');
