import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const main = read('src/main.jsx');
const pkg = JSON.parse(read('package.json'));
const db = read('netlify/functions/_db.js');
const sw = read('public/sw.js');
const offline = read('public/offline.html');
const checks = [];
const check = (name, ok) => { checks.push({ name, ok: Boolean(ok) }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); };

check('App version is Ver-1.010.02', /Password-Encrypt Ver-1\.010\.02/.test(main));
check('npm version is 1.10.2', pkg.version === '1.10.2');
check('Server version is Ver-1.010.02', /Password-Encrypt Ver-1\.010\.02/.test(db));
check('Service-worker cache is Ver-1.010.02', /my-passwords-v1\.010\.02/.test(sw));
check('Offline page is Ver-1.010.02', /Password-Encrypt Ver-1\.010\.02/.test(offline));

const installDecl = main.indexOf('const onboardingInstallEntry =');
const pushEffectUse = main.indexOf('showInstallOnboarding || onboardingInstallEntry');
check('Onboarding install route is declared before startup push effect reads it', installDecl >= 0 && pushEffectUse >= 0 && installDecl < pushEffectUse);

const newEntryDecl = main.indexOf('const newCustomerOnboardingEntry =');
const routeLayoutUse = main.indexOf('if (!newCustomerOnboardingEntry && !onboardingInstallEntry) return;');
check('New-customer onboarding route is declared before layout effect reads it', newEntryDecl >= 0 && routeLayoutUse >= 0 && newEntryDecl < routeLayoutUse);

check('Onboarding OTP object does not reintroduce duplicate input/testCode defaults', !/input:\s*''[^\n]*\.\.\.\(initialOnboardingFlowRef\.current\?\.otp[^\n]*input:\s*''/.test(main));

const failed = checks.filter((item) => !item.ok);
if (failed.length) {
  console.error(`\n${failed.length} Ver-1.010.02 feature check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length}/${checks.length} Ver-1.010.02 Startup Runtime Fix checks passed.`);
