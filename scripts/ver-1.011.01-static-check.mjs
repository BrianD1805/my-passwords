import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const main = read('src/main.jsx');
const css = read('src/styles.css');
const email = read('netlify/functions/_customer-email.js');
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

check('Ver-1.011.01 versions align', pkg.version === '1.11.1' && pkgLock.version === '1.11.1' && /Password-Encrypt Ver-1\.011\.01/.test(main) && /Password-Encrypt Ver-1\.011\.01/.test(db) && /my-passwords-v1\.011\.01/.test(sw) && /Password-Encrypt Ver-1\.011\.01/.test(offline));
check('Desktop onboarding width is reduced by about ten percent', /width: min\(46\.8vw, 684px\)/.test(css) && /min-width: 504px/.test(css));
check('Desktop onboarding height is reduced and viewport-safe', /height: min\(72dvh, 684px\)/.test(css) && /max-height: calc\(100dvh - 32px\)/.test(css));
check('Onboarding input text is enlarged', /font-size: 18px !important/.test(css) && /font-size: 19px !important/.test(css));
check('OTP input remains deliberately larger than normal fields', /onboarding-code-field > input \{[\s\S]{0,80}font-size: 32px !important/.test(css));
check('Progress bar has left and right inset spacing', /width: calc\(100% - 44px\)/.test(css) && /margin: 7px 22px 2px/.test(css));
check('Progress bar uses rounded premium styling', /border-radius: 999px/.test(css) && /linear-gradient\(90deg, #285f91/.test(css) && /box-shadow: inset 0 1px 2px/.test(css));
check('Onboarding phone country divider is removed', /onboarding-phone-combo \.country-picker,[\s\S]{0,100}border-right: 0 !important/.test(css));
check('Onboarding push race is blocked before vault unlock render', /afterCreateOnboardingInstall\) pushActivationPromptDeferredThisDocumentRef\.current = true/.test(main));
check('Onboarding has an explicit push decision gate before install interaction', /onboardingPushGate/.test(main) && /completeOnboardingPushGate/.test(main) && /visible=\{onboardingPushGate && pushActivationPromptOpen\}/.test(main));
check('Push enable during onboarding waits for the enable action', /async function activatePushDuringOnboarding\(\)[\s\S]{0,120}await enablePushNotifications\(\)/.test(main));
check('Push activation returns explicit completion status', /async function enablePushNotifications\(\)/.test(main) && /return true;/.test(main) && /return false;/.test(main));
check('Install onboarding footer explains the notification gate or later retry', /Choose how to handle notifications, then continue to installation/.test(main) && /Settings → Install Password-Encrypt/.test(main));
check('Settings contains a dedicated Install Password-Encrypt row', /openSettingsSection\('install'\)/.test(main) && /Install or retry adding Password-Encrypt as an app/.test(main));
check('Settings contains a dedicated install page', /activeSettingsSection === 'install'/.test(main) && /Try to install app/.test(main));
check('Settings install page provides manual browser guidance', /Manual install/.test(main) && /Chrome, Edge, Safari or Samsung Internet/.test(main));
check('Welcome trial email no longer tells user to create a master password next', !/Next, create your encrypted vault and choose the master password/.test(email));
check('Welcome email reflects completed account verification', /Your account verification is complete/.test(email));
check('Welcome email still preserves the master-password security warning', /master password remains private to you/.test(email) && /cannot be recovered or reset/.test(email));
check('No database migration is introduced by this UI patch', !fs.existsSync(path.join(root, 'db/migrations/2026-08-21_onboarding_ux_ver_1_011_01.sql')));

if (failures) {
  console.error(`\n${failures} Ver-1.011.01 check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks}/${checks} Ver-1.011.01 Onboarding UX checks passed.`);
