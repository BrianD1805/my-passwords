import fs from 'node:fs';
const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const verify = fs.readFileSync(new URL('../netlify/functions/verify-otp-test.js', import.meta.url), 'utf8');
const bootstrap = fs.readFileSync(new URL('../netlify/functions/bootstrap-admin.js', import.meta.url), 'utf8');
const email = fs.readFileSync(new URL('../netlify/functions/request-email-otp-test.js', import.meta.url), 'utf8');
const complete = fs.readFileSync(new URL('../netlify/functions/onboarding-complete.js', import.meta.url), 'utf8');
const checks = [
 ['version bumped', main.includes("Password-Encrypt Ver-1.024.01")],
 ['sms request still lands on step 7', main.includes("setLandingOnboardingStep(channel === 'sms' ? 7 : 9)")],
 ['new signup email mode sent explicitly', main.includes("onboardingMode: landingSignup.existingAccount ? 'existing_account' : 'new_signup'")],
 ['verified route uses server onboarding mode', main.includes("const verifiedNewSignup = result.onboardingMode === 'new_signup'")],
 ['new signup cannot route existing after email success', main.includes('existingAccount: !verifiedNewSignup')],
 ['sms challenge marks new signup', fs.readFileSync(new URL('../netlify/functions/request-sms-otp.js', import.meta.url), 'utf8').includes("onboarding_mode: purpose === 'production_onboarding' ? 'new_signup' : ''")],
 ['email challenge persists onboarding mode', email.includes('onboarding_mode: onboardingMode')],
 ['verified contact is not onboarding completion', verify.includes("'master_password_setup_required'") && verify.includes('onboardingSetupPending')],
 ['bootstrap resumes master password pending as new signup', bootstrap.includes("'master_password_setup_required'")],
 ['vault creation finalises onboarding server-side', main.includes("/.netlify/functions/onboarding-complete") && complete.includes("last_onboarding_step: 'vault_created'")],
 ['tenant onboarding completion moved to vault creation', complete.includes('onboarding_completed_at: now')],
 ['pause retry protection retained', main.includes("Verification paused. Re-enter the code and tap Verify when you are ready.")],
 ['verify timeout retained', main.includes('ONBOARDING_VERIFY_TIMEOUT_MS = 15000')],
 ['non-json retry protection retained', main.includes("code: 'NON_JSON_RESPONSE'")]
];
let failed=0;
for (const [name, ok] of checks) { console.log(`${ok?'PASS':'FAIL'}  ${name}`); if(!ok) failed++; }
console.log(`\n${checks.length-failed}/${checks.length} Ver-1.024.01 checks passed.`);
if(failed) process.exit(1);
