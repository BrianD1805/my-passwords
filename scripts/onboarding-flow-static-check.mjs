import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const main = read('src/main.jsx');
const admin = read('src/AdminApp.jsx');
const customerDetail = read('src/AdminCustomerDetail.jsx');
const css = read('src/styles.css');
const pkg = JSON.parse(read('package.json'));
const sw = read('public/sw.js');
let failures = 0;

function check(label, condition) {
  if (condition) console.log(`PASS  ${label}`);
  else { console.error(`FAIL  ${label}`); failures += 1; }
}

check('Ver-0.055a app/package/service-worker versions align', pkg.version === '0.0.55-a' && /Password-Encrypt Ver-0\.055a/.test(main) && /my-passwords-v0\.055a/.test(sw));
check('Landing Open My Vault opens an existing/new customer choice', /function openVaultApp\(\)[\s\S]*isPublicLandingRoute[\s\S]*setIsOpenVaultChoicePopupOpen\(true\)/.test(main));
check('Choice clearly separates existing customer from new customer', /Yes — I’m an existing customer/.test(main) && /No — I’m new to Password-Encrypt/.test(main));
check('Existing customer route carries explicit existing-entry intent', /window\.location\.assign\('\/vault\?entry=existing'\)/.test(main) && /vaultEntryMode === 'existing'/.test(main));
check('Existing-customer restore failure cannot switch into create mode', /if \(!createMode\) \{[\s\S]*if \(existingCustomerEntry\)[\s\S]*No new vault was created[\s\S]*return;[\s\S]*setCreateMode\(true\)/.test(main));
check('Generic no-local-vault screen no longer offers Create Vault', /This vault access screen is for existing Password-Encrypt customers/.test(main) && !/create-vault-entry-actions[\s\S]{0,500}> Create Vault</.test(main));
check('Existing account discovered during signup finishes through existing-customer route', /landingSignup\.existingAccount \? '\/vault\?entry=existing' : '\/vault\?entry=onboarding'/.test(main));
check('New signup finishes through dedicated onboarding vault route', /vaultEntryMode === 'onboarding'/.test(main) && /Step 2 of 2 · Vault setup/.test(main));
check('Dedicated onboarding vault screen collects email, mobile and master password', /vault-onboarding-screen/.test(main) && /Confirm your account details/.test(main) && /Email address/.test(main) && /Mobile number/.test(main) && /Create your master password/.test(main));
check('Dedicated onboarding screen requires active verified customer session', /newCustomerOnboardingEntry && customerSession\.authenticated/.test(main) && /Your account verification session is no longer active/.test(main));
check('Dedicated onboarding refuses to overwrite an existing local vault', /This device already contains a local encrypted vault/.test(main) && /New-account onboarding will not overwrite it/.test(main));
check('Create Account explains the two-part account then vault journey', /Step 1 of 2 · Account setup/.test(main) && /Set up account/.test(main) && /Set up vault/.test(main) && /Continue to Step 2 — Create vault/.test(main));
check('Create Account popup resets scroll position when its stage changes', /createAccountPopupBodyRef/.test(main) && /body\.scrollTop = 0/.test(main) && /\[isCreateAccountPopupOpen, landingOnboardingStep\]/.test(main));
check('Welcome-email sent notice is removed from customer UI', !/A welcome email has been sent\./.test(main));
check('SMS verification UI is disabled while implementation remains available', /const SMS_VERIFICATION_UI_ENABLED = false/.test(main) && /requestSmsOtp/.test(main) && !/> SMS<\//.test(main));
check('Admin verification presentation no longer depends on mobile SMS verification', /customer\.verification\?\.emailVerified/.test(admin) && /Mobile number on file/.test(customerDetail) && !/Mobile not verified/.test(customerDetail));
check('Dedicated onboarding layout has desktop and mobile styling', /\.vault-onboarding-screen/.test(css) && /\.two-step-onboarding-guide/.test(css) && /@media \(max-width: 680px\)[\s\S]*\.vault-onboarding-screen/.test(css));

if (failures) {
  console.error(`\n${failures} onboarding flow static check(s) failed.`);
  process.exit(1);
}
console.log('\nAll 17 onboarding flow static checks passed.');
