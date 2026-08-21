import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const main = read('src/main.jsx');
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

check('Ver-1.013.01 versions align', pkg.version === '1.13.1' && pkgLock.version === '1.13.1' && /Password-Encrypt Ver-1\.013\.01/.test(main) && /Password-Encrypt Ver-1\.013\.01/.test(db) && /my-passwords-v1\.013\.01/.test(sw) && /Password-Encrypt Ver-1\.013\.01/.test(offline));
check('Onboarding recovery has a two-hour expiry', /ONBOARDING_RECOVERY_MAX_AGE_MS = 2 \* 60 \* 60 \* 1000/.test(main));
check('Onboarding checkpoint reads both session and local storage', /for \(const storageName of \['sessionStorage', 'localStorage'\]\)/.test(main) && /readFreshOnboardingRecord/.test(main));
check('Onboarding checkpoint writes both session and local storage', /writeOnboardingRecoveryRecord/.test(main) && /window\[storageName\]\.setItem\(key, encoded\)/.test(main));
check('Onboarding recovery cleanup removes both storage copies', /clearOnboardingRecoveryRecord/.test(main) && /window\[storageName\]\.removeItem\(key\)/.test(main));
check('OTP input and local test code are still cleared on resume', /input: '', testCode: ''/.test(main));
check('Master passwords are not added to onboarding recovery state', !/saveOnboardingFlowState\([\s\S]{0,1600}masterPassword/.test(main));
check('Previous setup popup exposes Continue setup for resumable onboarding', /<strong>Continue setup<\/strong>/.test(main) && /state\.hasPendingOnboarding && state\.canResume/.test(main));
check('Pending identity can be recognised as resumable without a flow checkpoint', /function recoverablePendingOnboardingIdentity/.test(main) && /accountStatus === 'pending_verification'/.test(main) && /planStatus === 'signup_pending'/.test(main));
check('Recovered mobile-verified onboarding resumes at email request', /const phoneVerified = Boolean/.test(main) && /setLandingOnboardingStep\(phoneVerified \? 8 : 6\)/.test(main));
check('Recovered mobile-unverified onboarding resumes at SMS request', /message: phoneVerified \? 'Mobile verified\. Continue with email verification\.' : 'Continue mobile verification/.test(main));
check('Recovered onboarding uses a fresh OTP challenge rather than persisting the entered PIN', /challengeId: ''[\s\S]{0,220}input: ''[\s\S]{0,220}testCode: ''/.test(main));
check('Normal saved-flow resume remains available', /startCreateAccountFlow\('', \{ resumeSavedFlow: true \}\)/.test(main));
check('No database migration is required for Ver-1.013.01', !fs.existsSync(path.join(root, 'db/migrations/2026-08-21_onboarding_firefox_recovery_ver_1_013_01.sql')));

if (failures) {
  console.error(`\n${failures} Ver-1.013.01 check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks}/${checks} Ver-1.013.01 Firefox onboarding recovery checks passed.`);
