import fs from 'node:fs';
const main=fs.readFileSync('src/main.jsx','utf8');
const acct=fs.readFileSync('netlify/functions/account-security.js','utf8');
const sms=fs.readFileSync('netlify/functions/_sms.js','utf8');
const otp=fs.readFileSync('netlify/functions/_account-otp.js','utf8');
const health=fs.readFileSync('netlify/functions/health.js','utf8');
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));
const sw=fs.readFileSync('public/sw.js','utf8');
const offline=fs.readFileSync('public/offline.html','utf8');
const db=fs.readFileSync('netlify/functions/_db.js','utf8');
const checks=[
['App version',main.includes('Password-Encrypt Ver-1.007')],
['npm version',pkg.version==='1.7.0'],
['SW cache',sw.includes('my-passwords-v1.007')],
['Offline version',offline.includes('Password-Encrypt Ver-1.007')],
['Server version',db.includes('Password-Encrypt Ver-1.007')],
['Contact SMS enabled',main.includes('SMS_MOBILE_CONTACT_VERIFICATION_ENABLED = true')],
['Other SMS auth stays disabled',main.includes('SMS_AUTH_VERIFICATION_UI_ENABLED = false')],
['Mobile Verify/Change action',main.includes("accountSecurity.user?.phoneVerified === false ? 'Verify' : accountSecurity.user?.phoneE164 ? 'Change' : 'Add'")],
['Verified status visible',main.includes("'Verified mobile number' : 'Verification required'")],
['Verification popup copy',main.includes("'Verify mobile number'")&&main.includes('confirm the number belongs to you')],
['Twilio Verify start',sms.includes('/Verifications')&&sms.includes("Channel: 'sms'")],
['Twilio Verify check',sms.includes('/VerificationCheck')&&sms.includes('VerificationSid')],
['OTP purpose scoped',acct.includes("purpose: 'change_phone'")&&otp.includes('challenge.purpose !== purpose')],
['Verify-only path detected',acct.includes("change.change_type === 'phone_verification'")],
['Verify-only audit',acct.includes("account_phone_verified")],
['Actual phone change revokes sessions',acct.includes("revoked_reason: 'phone_changed'")],
['Health reports provider',health.includes('providerMode: smsMode')],
['Production test code protected',otp.includes("testOtpCode: !delivery.sent && testMode ? code : ''")],
['10-minute expiry',otp.includes('10 * 60 * 1000')],
['Five attempt lock',otp.includes('attempts >= 5')]
];
let pass=0;for(const [n,ok] of checks){console.log(`${ok?'PASS':'FAIL'}  ${n}`);if(ok)pass++;}
console.log(`\n${pass}/${checks.length} Ver-1.007 SMS mobile verification checks passed.`);if(pass!==checks.length)process.exit(1);
