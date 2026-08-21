import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const main = read('src/main.jsx');
const styles = read('src/styles.css');
const db = read('netlify/functions/_db.js');
const sw = read('public/sw.js');
const pkg = JSON.parse(read('package.json'));
const pkgLock = JSON.parse(read('package-lock.json'));
const requestEmail = read('netlify/functions/request-email-otp-test.js');
const verifyOtp = read('netlify/functions/verify-otp-test.js');
const accountSecurity = read('netlify/functions/account-security.js');

let failures = 0;
let checks = 0;
function check(name, condition) {
  checks += 1;
  if (condition) console.log(`PASS  ${name}`);
  else { failures += 1; console.error(`FAIL  ${name}`); }
}

check('Ver-1.015 versions align', pkg.version === '1.15.0' && pkgLock.version === '1.15.0' && /Password-Encrypt Ver-1\.015/.test(main) && /Password-Encrypt Ver-1\.015/.test(db) && /my-passwords-v1\.015/.test(sw));
check('SMS send has twenty-second request timeout', /ONBOARDING_NETWORK_TIMEOUT_MS = 20000/.test(main) && /controller\.abort\('timeout'\)/.test(main));
check('SMS send can be manually cancelled', /Cancel sending/.test(main) && /cancelOnboardingNetworkRequest/.test(main));
check('Stale persisted SMS sending state auto-recovers after reload', /function sanitiseOnboardingOtpState/.test(main) && /sanitiseOnboardingOtpState\(initialOnboardingFlowRef\.current\?\.otp \|\| \{\}\)/.test(main) && /sanitiseOnboardingOtpState\(savedFlow\.otp \|\| \{\}\)/.test(main));
check('SMS timeout returns retry instead of permanent sending state', /Retry SMS/.test(main) && /sending stopped after/.test(main));
check('SMS can be deferred to email verification', /Do this later — verify email instead/.test(main) && /smsDeferred: true/.test(main));
check('Email onboarding request permits an unverified phone', !/MOBILE_VERIFICATION_REQUIRED/.test(requestEmail));
check('OTP verification no longer has partial onboarding branch', !/partialOnboarding: true/.test(verifyOtp) && !/account_activation_deferred/.test(verifyOtp));
check('Either channel records the other as pending when required', /pendingVerificationChannel/.test(verifyOtp) && /email_verification_required/.test(verifyOtp) && /phone_verification_required/.test(verifyOtp));
check('Verified onboarding still creates a secure customer session', /createVerifiedCustomerSession\(event/.test(verifyOtp));
check('Missing contact verification reminder is shown on future authenticated vault sessions', /ContactVerificationReminderModal/.test(main) && /CONTACT_VERIFICATION_REMINDER_KEY/.test(main));
check('Reminder can open existing email or mobile verification', /verifyMissingContactNow/.test(main) && /verifyExisting: true/.test(main));
check('Completing missing email can clear onboarding pending state', /onboarding_status: user\.phone_verified \? 'onboarding_complete' : 'phone_verification_required'/.test(accountSecurity));
check('Completing missing mobile can clear onboarding pending state', /onboarding_status: user\.email_verified \? 'onboarding_complete' : 'email_verification_required'/.test(accountSecurity));
check('No database migration is required by this build', !fs.existsSync(path.join(root, 'db/migrations/2026-08-21_onboarding_verification_recovery_ver_1_015.sql')));
check('Reminder modal has mobile-friendly footer hook', /contact-verification-reminder-footer/.test(main));

if (failures) {
  console.error(`\n${failures} Ver-1.015 check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks}/${checks} Ver-1.015 onboarding verification recovery checks passed.`);
