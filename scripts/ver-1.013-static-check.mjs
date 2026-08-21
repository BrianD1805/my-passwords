import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const main = read('src/main.jsx');
const admin = read('src/AdminApp.jsx');
const css = read('src/styles.css');
const bootstrap = read('netlify/functions/bootstrap-admin.js');
const sms = read('netlify/functions/request-sms-otp.js');
const accountOtp = read('netlify/functions/_account-otp.js');
const db = read('netlify/functions/_db.js');
const sw = read('public/sw.js');
const offline = read('public/offline.html');
const pkg = JSON.parse(read('package.json'));
const pkgLock = JSON.parse(read('package-lock.json'));
let failures = 0;
let checks = 0;
function check(label, condition) {
  checks += 1;
  if (condition) console.log(`PASS  ${label}`);
  else { failures += 1; console.error(`FAIL  ${label}`); }
}

check('Ver-1.013 versions align', pkg.version === '1.13.0' && pkgLock.version === '1.13.0' && /Password-Encrypt Ver-1\.013/.test(main) && /Password-Encrypt Ver-1\.013/.test(db) && /my-passwords-v1\.013/.test(sw) && /Password-Encrypt Ver-1\.013/.test(offline));
check('Generic trial onboarding resolves Plan 1 from published Admin ordering', /function loadDefaultTrialPlan/.test(bootstrap) && /order=display_order\.asc,display_name\.asc/.test(bootstrap));
check('Default onboarding does not trust a hard-coded client plan code', /planSelectionSource === 'landing_plan_card'[\s\S]*loadDefaultTrialPlan/.test(bootstrap));
check('Explicit landing plan selection is still preserved', /planSelectionSource === 'landing_plan_card'[\s\S]*loadPlan\(requestedPlanCode\)/.test(bootstrap));
check('Plan availability is validated before signup limits are consumed', bootstrap.indexOf('const requestedSignupPlan = await resolveSignupPlan') < bootstrap.indexOf("scope: 'signup_ip_v1013'"));
check('Broken pre-1.013 CTA attempts do not keep customers locked out', /signup_ip_v1013/.test(bootstrap) && /signup_email_v1013/.test(bootstrap));
check('Obsolete Personal launch-plan error text is absent', !/Personal is the available launch plan/.test(main + bootstrap));
check('CTA onboarding uses first loaded public plan when available', /requestedPlanCode \|\| publicPlans\[0\]\?\.code \|\| DEFAULT_TRIAL_PLAN_CODE/.test(main));
check('Clean onboarding draft refreshes default Plan 1 from public plans', /const defaultTrialPlanCode = publicPlans\[0\]\?\.code \|\| DEFAULT_TRIAL_PLAN_CODE/.test(main));
check('Saved obsolete default-plan error is scrubbed on resume', /function sanitiseOnboardingSignupState/.test(main) && /staleDefaultPlanError/.test(main));
check('SMS retry does not repeat account bootstrap after pending account exists', /function startOrResendPrimaryOnboardingSms/.test(main) && /landingSignup\.tenantId && landingSignup\.userId/.test(main) && /await sendLandingOnboardingOtp\('sms'\)/.test(main));
check('SMS card uses the guarded start-or-resend handler', /onClick=\{startOrResendPrimaryOnboardingSms\}/.test(main));
check('OTP database limiter exposes a distinct code and retry time', /OTP_RATE_LIMITED/.test(accountOtp) && /retryAfter = 15 \* 60/.test(accountOtp));
check('SMS endpoint returns useful rate-limit guidance', /SMS verification is temporarily limited after repeated requests/.test(sms) && /retryAfterSeconds/.test(sms));
check('Admin actions are ordered Refresh, Logout, Admin menu', admin.indexOf('> Refresh</button>') < admin.indexOf('> Logout</button>') && admin.indexOf('> Logout</button>') < admin.indexOf('> Admin menu <'));
check('Admin menu is an overlay mega menu rather than expanding header', /\.admin-header-menu\{[\s\S]*position:absolute/.test(css) && /grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/.test(css));
check('Admin mega menu is aligned to the right', /\.admin-header-menu\{[\s\S]*right:0/.test(css));
check('Admin mega menu contains only section buttons', /<nav className="admin-header-menu"/.test(admin) && !/<nav className="admin-tabs admin-header-menu"/.test(admin));
check('Admin menu closes on outside click and Escape', /event\.key === 'Escape'/.test(admin) && /pointerdown/.test(admin) && /closest\?\.\('\.admin-header'\)/.test(admin));
check('Admin subtitle includes current version number', /Single-site SaaS administration · \{shortVersion\}/.test(admin) && /Ver-1\.013/.test(admin));
check('No database migration is required for Ver-1.013', !fs.existsSync(path.join(root, 'db/migrations/2026-08-21_onboarding_admin_ver_1_013.sql')));

if (failures) {
  console.error(`\n${failures} Ver-1.013 check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks}/${checks} Ver-1.013 Onboarding/Admin checks passed.`);
