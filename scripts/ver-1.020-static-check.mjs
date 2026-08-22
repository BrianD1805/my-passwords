import fs from 'node:fs';
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const pkgLock = JSON.parse(read('package-lock.json'));
const main = read('src/main.jsx');
const adminCustomer = read('src/AdminCustomerDetail.jsx');
const adminServer = read('netlify/functions/admin-customer-detail.js');
const dateFormat = read('src/dateFormat.js');
const userSettingsServer = read('netlify/functions/user-settings.js');
const userSettingsSql = read('SUPABASE_VER_1.020_USER_SETTINGS.sql');
const sw = read('public/sw.js');
const offline = read('public/offline.html');
const admin = read('src/AdminApp.jsx');
const db = read('netlify/functions/_db.js');
let checks = 0;
let failures = 0;
function check(label, condition) {
  checks += 1;
  if (condition) console.log(`PASS  ${label}`);
  else { failures += 1; console.error(`FAIL  ${label}`); }
}
check('Ver-1.020 versions align', pkg.version === '1.20.0' && pkgLock.version === '1.20.0' && /Password-Encrypt Ver-1\.020/.test(main) && /Password-Encrypt Ver-1\.020/.test(db) && /my-passwords-v1\.020/.test(sw) && /Password-Encrypt Ver-1\.020/.test(offline) && /Ver-1\.020/.test(admin));
check('Admin permanent delete uses an in-app modal', /admin-delete-confirm-window/.test(adminCustomer) && /createPortal/.test(adminCustomer) && !/window\.prompt\('Permanent testing action/.test(adminCustomer));
check('Delete account is no longer labelled as testing', !/Testing tool/.test(adminCustomer) && !/permanently deleted from Admin for testing/.test(adminServer));
check('Permanent delete still requires DELETE confirmation', /Type <strong>DELETE<\/strong> to confirm/.test(adminCustomer) && /confirmText: 'DELETE'/.test(adminCustomer));
check('Admin delete popup locks background scrolling', /deleteConfirm\.visible/.test(adminCustomer) && /document\.body\.style\.overflow = 'hidden'/.test(adminCustomer));
check('Skipping SMS prepares the account before email verification', /async function deferOnboardingSms/.test(main) && /prepareLandingOnboarding\(\{ deferSms: true \}\)/.test(main));
check('Deferred SMS bootstrap goes directly to email verification', /deferSms \? 'email' : 'sms'/.test(main) && /else if \(deferSms\)/.test(main) && /setLandingOnboardingStep\(8\)/.test(main));
check('User Settings section exists', /<strong>User Settings<\/strong>/.test(main) && /activeSettingsSection === 'user-settings'/.test(main));
check('User Settings load and save through validated account session', /fetch\('\/.netlify\/functions\/user-settings'/.test(main) && /postJson\('\/.netlify\/functions\/user-settings'/.test(main) && /validateCustomerSession/.test(userSettingsServer) && /assertBrowserAction/.test(userSettingsServer));
check('User Settings table is RLS protected and service-role only', /create table if not exists public\.user_settings/.test(userSettingsSql) && /enable row level security/.test(userSettingsSql) && /revoke all on table public\.user_settings from anon, authenticated/.test(userSettingsSql) && /grant select, insert, update, delete on public\.user_settings to service_role/.test(userSettingsSql));
check('Vault-open password count is user configurable', /secureDeviceUnlockCount/.test(main) && /Vault opens before password is required/.test(main));
check('Never Force Password Again setting exists', /neverForcePasswordAgain/.test(main) && /Never Force Password Again/.test(main));
check('Never-force setting bypasses periodic reminder', /if \(settings\.neverForcePasswordAgain\) return ''/.test(main));
check('Date format options match requested choices', /05\/06\/2026/.test(main) && /06\/05\/2026/.test(main) && /05\/Jun\/2026/.test(main));
check('Text month date remains the default', /dateFormat: APP_DATE_FORMATS\.DMY_TEXT/.test(main));
check('Date formatter supports DMY, MDY and text-month formats', /DMY_NUMERIC/.test(dateFormat) && /MDY_NUMERIC/.test(dateFormat) && /DMY_TEXT/.test(dateFormat));
check('User-facing vault dates use the selected preference', /function formatUserDate/.test(main) && /readUserSettings\(\)\.dateFormat/.test(main));
if (failures) {
  console.error(`\n${failures} Ver-1.020 check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks}/${checks} Ver-1.020 Small Bug Fixes and User Settings checks passed.`);
