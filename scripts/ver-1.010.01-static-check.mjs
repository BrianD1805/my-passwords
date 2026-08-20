import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const main = read('src/main.jsx');
const db = read('netlify/functions/_db.js');
const sw = read('public/sw.js');
const offline = read('public/offline.html');
const pkg = JSON.parse(read('package.json'));
const checks = [];
const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });

const landingOtpLine = main.split('\n').find((line) => line.includes('const [landingOtp, setLandingOtp]')) || '';

check('App version is Ver-1.010.01', /Password-Encrypt Ver-1\.010\.01/.test(main));
check('npm version is 1.10.1', pkg.version === '1.10.1');
check('Server version is Ver-1.010.01', /Password-Encrypt Ver-1\.010\.01/.test(db));
check('Service-worker cache is Ver-1.010.01', /my-passwords-v1\.010\.01/.test(sw));
check('Offline page is Ver-1.010.01', /Password-Encrypt Ver-1\.010\.01/.test(offline));
check('landingOtp initializer contains one input key', (landingOtpLine.match(/\binput\s*:/g) || []).length === 1);
check('landingOtp initializer contains one testCode key', (landingOtpLine.match(/\btestCode\s*:/g) || []).length === 1);
check('Restored onboarding state is applied before fresh OTP fields', landingOtpLine.includes('...(initialOnboardingFlowRef.current?.otp || {})') && landingOtpLine.indexOf('...(initialOnboardingFlowRef.current?.otp || {})') < landingOtpLine.lastIndexOf("input: ''") && landingOtpLine.indexOf('...(initialOnboardingFlowRef.current?.otp || {})') < landingOtpLine.lastIndexOf("testCode: ''"));

const failed = checks.filter((c) => !c.pass);
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}`);
if (failed.length) {
  console.error(`\n${failed.length} Ver-1.010.01 feature check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length}/${checks.length} Ver-1.010.01 Onboarding Build Warning Fix checks passed.`);
