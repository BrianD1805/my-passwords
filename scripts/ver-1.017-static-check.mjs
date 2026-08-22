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

check('Ver-1.017 versions align', pkg.version === '1.17.0' && pkgLock.version === '1.17.0' && /Password-Encrypt Ver-1\.017/.test(main) && /Password-Encrypt Ver-1\.017/.test(db) && /my-passwords-v1\.017/.test(sw));
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
check('No database migration is required by this build', !fs.readdirSync(path.join(root, 'db/migrations')).some((name) => /1[_-]017/i.test(name)));
check('Reminder modal has mobile-friendly footer hook', /contact-verification-reminder-footer/.test(main));
check('Onboarding now contains fourteen steps', /ONBOARDING_TOTAL_STEPS = 14/.test(main));
check('Mobile number field keeps a clean clipped rounded outline', /\.onboarding-phone-combo\s*\{[\s\S]*?overflow:\s*hidden\s*!important/.test(styles) && /\.onboarding-phone-combo \.country-picker-trigger\s*\{[\s\S]*?border-radius:\s*14px 0 0 14px\s*!important/.test(styles));
check('SMS request and delivery screens explain that delivery can take time', /Your SMS has been requested/.test(main) && /Mobile networks can sometimes take a little while to deliver the message/.test(main));
check('Successful SMS verification continues to email step 8 instead of skipping ahead', /landingOtp\.channel === 'sms'[\s\S]*?setLandingOnboardingStep\(8\)[\s\S]*?return;/.test(main));
check('Master-password onboarding has separate show-hide controls', /showOnboardingMasterPassword/.test(main) && /showOnboardingConfirmPassword/.test(main) && /onboarding-password-toggle/.test(main));
check('Password mismatch is a prominent alert', /onboarding-password-mismatch/.test(main) && /Passwords do not match/.test(main) && /role="alert"/.test(main));
check('Push Notifications is onboarding step 13', /step === 13[\s\S]*?Push notifications[\s\S]*?Stay informed/.test(main));
check('Guided Tour is final onboarding step 14', /step === 14[\s\S]*?Final step[\s\S]*?Welcome to Password-Encrypt/.test(main));
check('Final guided-tour wording is generic', /We’ll show you the main areas and where to find the controls you’ll use most/.test(main) && !/Would you like a quick guided tour\?[\s\S]{0,180}three-dot button/.test(main));
check('Vault opens only after the final Guided Tour choice', /finishGuidedTourOnboarding/.test(main) && /openVaultAfterFinalOnboarding/.test(main) && /window\.history\.replaceState\(\{\}, '', '\/vault'\)/.test(main));
check('Final onboarding gates are armed before the vault unlocks', /if \(options\.afterCreateOnboardingInstall\) \{[\s\S]*?setShowInstallOnboarding\(true\)[\s\S]*?setOnboardingPushGate\(true\)[\s\S]*?setGuidedTourPromptOpen\(false\)[\s\S]*?setLocked\(false\)/.test(main));
check('Accepted installation explains background download and allows Continue', /setInstallStatus\('installing'\)/.test(main) && /finish downloading and installing in the background/.test(main) && /installCanContinue/.test(main));
check('Guided Tour overlay blocks background interaction', /\.guided-tour-layer\s*\{[\s\S]*?pointer-events:\s*auto/.test(styles));
check('Highlighted Guided Tour targets cannot be clicked', /\.guided-tour-target\s*\{[\s\S]*?pointer-events:\s*none\s*!important/.test(styles));

if (failures) {
  console.error(`\n${failures} Ver-1.017 check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks}/${checks} Ver-1.017 onboarding bug-fix checks passed.`);
