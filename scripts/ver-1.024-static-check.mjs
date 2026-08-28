import fs from 'node:fs';
let checks = 0, failures = 0;
function check(label, condition) { checks += 1; if (condition) console.log(`PASS  ${label}`); else { failures += 1; console.error(`FAIL  ${label}`); } }
function read(path) { return fs.readFileSync(path, 'utf8'); }
const main = read('src/main.jsx');
const pkg = JSON.parse(read('package.json'));
const pkgLock = JSON.parse(read('package-lock.json'));
const db = read('netlify/functions/_db.js');
const sw = read('public/sw.js');
const offline = read('public/offline.html');
const verify = read('netlify/functions/verify-otp-test.js');
const otp = read('netlify/functions/_account-otp.js');
const sms = read('netlify/functions/_sms.js');
const email = read('netlify/functions/request-email-otp-test.js');
const postVerify = read('netlify/functions/post-verification-notifications.js');
check('Ver-1.024 versions align', pkg.version === '1.24.0' && pkgLock.version === '1.24.0' && /Password-Encrypt Ver-1\.024/.test(main) && /Password-Encrypt Ver-1\.024/.test(db) && /my-passwords-v1\.024/.test(sw) && /Password-Encrypt Ver-1\.024/.test(offline));
check('OTP verification has a hard client timeout', /ONBOARDING_VERIFY_TIMEOUT_MS = 15000/.test(main) && /beginOnboardingNetworkRequest\(ONBOARDING_VERIFY_TIMEOUT_MS\)/.test(main));
check('Both OTP screens can stop a verification check', (main.match(/Stop checking/g) || []).length >= 2 && /cancelOnboardingVerification/.test(main));
check('Paused onboarding aborts live network work', /abort\?\.\('paused'\)/.test(main) && /Verification paused/.test(main));
check('Reloaded verifying state is recoverable', /state\.status === 'verifying'/.test(main) && /previous verification check was interrupted/.test(main));
check('Non-JSON function output is converted to a friendly retry response', /NON_JSON_RESPONSE/.test(main) && !/Function returned a non-JSON response\./.test(main));
check('Verification retry is idempotent for same challenge and code', /verified_code_hash_stored/.test(otp) && /idempotent: true/.test(otp));
check('Successful provider-managed SMS code is rehashed for safe retry', /otp_hash: hashOtp\(challengeId/.test(otp) && /verified_code_hash_version: 1/.test(otp));
check('OTP verify critical path no longer sends emails', !/sendCustomerLifecycleEmail/.test(verify) && !/sendAdminNotification/.test(verify) && /postVerificationNotificationsRequired: true/.test(verify));
check('Follow-up notifications run in separate authenticated function', /validateCustomerSession/.test(postVerify) && /sendCustomerLifecycleEmail/.test(postVerify) && /sendAdminNotification/.test(postVerify));
check('Browser dispatches follow-up notifications without blocking verification', /post-verification-notifications/.test(main) && /keepalive: true/.test(main));
check('Twilio calls have an 8 second provider timeout', /setTimeout\(\(\) => controller\.abort\(\), 8000\)/.test(sms) && /TWILIO_TIMEOUT/.test(sms));
check('Onboarding email delivery has an 8 second provider timeout', /setTimeout\(\(\) => controller\.abort\(\), 8000\)/.test(email) && /Email delivery took too long/.test(email));
check('Supabase REST calls have a server-side timeout', /options\.timeoutMs \|\| 10000/.test(db) && /SUPABASE_TIMEOUT/.test(db));
check('Package feature check points to Ver-1.024', pkg.scripts['feature:check'] === 'node scripts/ver-1.024-static-check.mjs' && pkgLock.packages[''].scripts['feature:check'] === 'node scripts/ver-1.024-static-check.mjs');
if (failures) { console.error(`\n${failures} Ver-1.024 check(s) failed.`); process.exit(1); }
console.log(`\n${checks}/${checks} Ver-1.024 onboarding verification reliability checks passed.`);
