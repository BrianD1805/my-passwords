import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');
const main = read('src/main.jsx');
const css = read('src/styles.css');
const emailRequest = read('netlify/functions/request-email-otp-test.js');
const smsRequest = read('netlify/functions/request-sms-otp.js');
const verify = read('netlify/functions/verify-otp-test.js');
const account = read('netlify/functions/account-security.js');
const sms = read('netlify/functions/_sms.js');
const db = read('netlify/functions/_db.js');
const sw = read('public/sw.js');
const offline = read('public/offline.html');
const pkg = JSON.parse(read('package.json'));

const checks = [
  ['App version', main.includes('Password-Encrypt Ver-1.007.01')],
  ['npm version', pkg.version === '1.7.1'],
  ['Server version', db.includes('Password-Encrypt Ver-1.007.01')],
  ['Service-worker cache version', sw.includes('my-passwords-v1.007.01')],
  ['Offline version', offline.includes('Password-Encrypt Ver-1.007.01')],
  ['Normal device SMS auth remains disabled', main.includes('SMS_AUTH_VERIFICATION_UI_ENABLED = false')],
  ['My Account mobile verification remains enabled', main.includes('SMS_MOBILE_CONTACT_VERIFICATION_ENABLED = true')],
  ['Onboarding begins with email', main.includes("channel: 'email'") && main.includes('Send email code')],
  ['Onboarding email retries are available', main.includes('Resend email code')],
  ['Email endpoint counts onboarding sends over ten minutes', emailRequest.includes('onboardingEmailSendCount') && emailRequest.includes('10 * 60 * 1000')],
  ['SMS fallback becomes eligible only after two email sends', emailRequest.includes('recentOnboardingEmailSends >= 2')],
  ['Email response tells UI whether SMS fallback is eligible', emailRequest.includes('smsFallbackEligible') && emailRequest.includes('onboardingEmailSendCount')],
  ['Onboarding UI shows SMS only when eligible', main.includes("landingOtp.smsFallbackEligible && landingOtp.channel === 'email'") && main.includes('Use SMS backup')],
  ['Onboarding SMS uses production onboarding purpose', main.includes("purpose: 'production_onboarding'")],
  ['SMS endpoint independently enforces two email attempts', smsRequest.includes("(emailAttempts || []).length < 2") && smsRequest.includes('SMS_FALLBACK_NOT_AVAILABLE')],
  ['SMS fallback has a dedicated cost rate limit', smsRequest.includes("scope: 'onboarding_sms_fallback'") && smsRequest.includes('limit: 2')],
  ['Twilio Verify is used for SMS', sms.includes('/Verifications') && sms.includes('/VerificationCheck')],
  ['SMS onboarding verifies phone without falsely verifying email', verify.includes('emailVerifiedAfter = isEmail ? true : Boolean(user.email_verified)') && verify.includes('phoneVerifiedAfter = isEmail ? Boolean(user.phone_verified) : true')],
  ['Verification response exposes verified channel and contact states', verify.includes("verifiedChannel: isEmail ? 'email' : 'sms'") && verify.includes('emailVerified: emailVerifiedAfter') && verify.includes('phoneVerified: phoneVerifiedAfter')],
  ['SMS fallback copy explains email remains separate', main.includes('It does not mark the email address as verified.')],
  ['SMS activation message explains pending email when applicable', verify.includes('Your email address is still awaiting verification.')],
  ['Mobile change request stores pending change before user update', account.includes("change_type: verifyingExistingPhone ? 'phone_verification' : 'phone'") && account.includes("status: 'pending_verification'")],
  ['Mobile number is written to users only after OTP confirmation', /if \(action === 'confirm_phone_change'\)[\s\S]*verifyAccountOtp[\s\S]*updateRow\('users'/.test(account)],
  ['New mobile number OTP is scoped to change_phone', account.includes("purpose: 'change_phone'")],
  ['Changing number revokes other sessions only after verification', /confirm_phone_change[\s\S]*revoked_reason: 'phone_changed'/.test(account)],
  ['Verifying existing number does not revoke sessions', account.includes('if (verificationOnly)') && account.includes("'account_phone_verified'")],
  ['SMS UI has mobile layout support', css.includes('.onboarding-sms-fallback') && css.includes('.onboarding-sms-backup-note')],
  ['Five-attempt OTP lock remains enforced', read('netlify/functions/_account-otp.js').includes('attempts >= 5')]
];

let pass = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (ok) pass += 1;
}
console.log(`\n${pass}/${checks.length} Ver-1.007.01 SMS onboarding fallback checks passed.`);
if (pass !== checks.length) process.exit(1);
