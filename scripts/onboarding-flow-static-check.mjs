import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const main = read('src/main.jsx');
const admin = read('src/AdminApp.jsx');
const customerDetail = read('src/AdminCustomerDetail.jsx');
const css = read('src/styles.css');
const customerEmail = read('netlify/functions/_customer-email.js');
const verifyOtp = read('netlify/functions/verify-otp-test.js');
const pkg = JSON.parse(read('package.json'));
const sw = read('public/sw.js');
let failures = 0;

function check(label, condition) {
  if (condition) console.log(`PASS  ${label}`);
  else { console.error(`FAIL  ${label}`); failures += 1; }
}

check('Ver-0.055C app/package/service-worker versions align', pkg.version === '0.0.55-c' && /Password-Encrypt Ver-0\.055C/.test(main) && /my-passwords-v0\.055C/.test(sw));
check('Landing Open My Vault opens an existing/new customer choice', /function openVaultApp\(\)[\s\S]*isPublicLandingRoute[\s\S]*setIsOpenVaultChoicePopupOpen\(true\)/.test(main));
check('Choice clearly separates existing customer from new customer', /Yes — I’m an existing customer/.test(main) && /No — I’m new to Password-Encrypt/.test(main));
check('Existing customer route carries explicit existing-entry intent', /window\.location\.assign\('\/vault\?entry=existing'\)/.test(main) && /vaultEntryMode === 'existing'/.test(main));
check('Existing-customer restore failure cannot switch into create mode', /if \(!createMode\) \{[\s\S]*if \(existingCustomerEntry\)[\s\S]*No new vault was created[\s\S]*return;[\s\S]*setCreateMode\(true\)/.test(main));
check('Generic no-local-vault screen no longer offers Create Vault', /This vault access screen is for existing Password-Encrypt customers/.test(main) && !/create-vault-entry-actions[\s\S]{0,500}> Create Vault</.test(main));
check('Existing account discovered during signup finishes through existing-customer route', /const target = landingSignup\.existingAccount \? '\/vault\?entry=existing' : '\/vault\?entry=onboarding'/.test(main));
check('New signup finishes through dedicated onboarding vault route', /vaultEntryMode === 'onboarding'/.test(main) && /Step 2 of 3 · Vault setup/.test(main));
check('Dedicated onboarding vault screen collects email, mobile and master password', /vault-onboarding-screen/.test(main) && /Confirm your account details/.test(main) && /Email address/.test(main) && /Mobile number/.test(main) && /Create your master password/.test(main));
check('Dedicated onboarding screen requires active verified customer session', /newCustomerOnboardingEntry && customerSession\.authenticated/.test(main) && /Your account verification session is no longer active/.test(main));
check('Dedicated onboarding refuses to overwrite an existing local vault', /This device already contains a local encrypted vault/.test(main) && /New-account onboarding will not overwrite it/.test(main));
check('Create Account explains the three-step onboarding journey', /Step 1 of 3 · Account setup/.test(main) && /Set up account/.test(main) && /Set up vault/.test(main) && /Install app/.test(main) && /Continue to Step 2 — Create vault/.test(main));
check('Create Account popup resets scroll position when its internal stage changes', /createAccountPopupBodyRef/.test(main) && /body\.scrollTop = 0/.test(main) && /\[isCreateAccountPopupOpen, landingOnboardingStep\]/.test(main));
check('Dedicated Vault Setup route explicitly resets document scroll to the top', /if \(!newCustomerOnboardingEntry && !onboardingInstallEntry\) return;[\s\S]*document\.documentElement\.scrollTop = 0;[\s\S]*window\.scrollTo\(\{ top: 0, left: 0, behavior: 'auto' \}\)/.test(main));
check('Redundant email-channel selector is hidden during email-only onboarding', !/onboarding-verification-channel email-only-verification/.test(main) && /Send email code/.test(main));
check('Step 2 wording is concise and references three-step onboarding', /Step 2 of 3 is next: create your encrypted vault and choose the master password only you know\./.test(main) && !/separate vault-setup screen/.test(main));
check('Step 1 to Step 2 transition changes SPA route before closing popup', /window\.history\.replaceState\(\{ onboarding: true \}, '', target\);[\s\S]*setIsCreateAccountPopupOpen\(false\)/.test(main));
check('Step 1 to Step 2 transition does not navigate through the landing page', !/finishLandingOnboarding\(\)[\s\S]{0,900}window\.location\.assign/.test(main));
check('Master-password fields no longer request browser-generated new-password suggestions', /name="vault-onboarding-secret-entry" type="password" autoComplete="off"/.test(main) && /name="vault-onboarding-secret-confirmation-entry" type="password" autoComplete="off"/.test(main) && !/vault-onboarding[^\n]{0,300}autoComplete="new-password"/.test(main));
check('Master-password fields retain password-manager ignore hints', /vault-onboarding-secret-entry[^>]*data-lpignore="true"[^>]*data-1p-ignore="true"[^>]*data-form-type="other"/.test(main) && /vault-onboarding-secret-confirmation-entry[^>]*data-lpignore="true"[^>]*data-1p-ignore="true"[^>]*data-form-type="other"/.test(main));
check('Creating the new vault advances to Step 3 install onboarding', /openVaultWithPassword\(masterPassword, \{ afterCreateOnboardingInstall: true \}\)/.test(main) && /entry=install/.test(main) && /Step 3 of 3 · Install app/.test(main));
check('Install onboarding explains why installing is recommended', /Why install Password-Encrypt\?/.test(main) && /home screen, Start menu or app launcher/.test(main) && /cleaner app-style window/.test(main));
check('PWA install prompt is captured and invoked where supported', /beforeinstallprompt/.test(main) && /installPromptRef/.test(main) && /await promptEvent\.prompt\(\)/.test(main) && /await promptEvent\.userChoice/.test(main));
check('Installed-app state is detected and appinstalled is handled', /display-mode: standalone/.test(main) && /navigator\.standalone/.test(main) && /appinstalled/.test(main));
check('Install onboarding provides manual platform instructions when native prompt is unavailable', /Add to Home Screen/.test(main) && /Install app or Add to Home screen/.test(main) && /browser address bar/.test(main));
check('Install onboarding can continue into the vault without forcing installation', /Continue in browser/.test(main) && /function finishInstallOnboarding\(\)/.test(main) && /replaceState\(\{\}, '', '\/vault'\)/.test(main));
check('Welcome-email sent notice is removed from customer UI', !/A welcome email has been sent\./.test(main));
check('Welcome trial wording says the trial will end on the date', /trial has started\$\{trialEnd \? ` and will end on \$\{escapeHtml\(trialEnd\)\}` : ''\}/.test(customerEmail));
check('Welcome email contains account email, mobile, vault name and plan details', /Your Password-Encrypt account details/.test(customerEmail) && /Login email:/.test(customerEmail) && /Mobile number:/.test(customerEmail) && /Vault name:/.test(customerEmail) && /Plan:/.test(customerEmail));
check('Welcome email explicitly excludes the master password', /Your master password is never included in email/.test(customerEmail));
check('Welcome email receives the stored account phone and email', /phone_e164/.test(verifyOtp) && /accountEmail: user\.email/.test(verifyOtp) && /accountPhone: user\.phone_e164/.test(verifyOtp));
check('SMS verification UI is disabled while implementation remains available', /const SMS_VERIFICATION_UI_ENABLED = false/.test(main) && /requestSmsOtp/.test(main) && !/> SMS<\//.test(main));
check('Admin verification presentation no longer depends on mobile SMS verification', /customer\.verification\?\.emailVerified/.test(admin) && /Mobile number on file/.test(customerDetail) && !/Mobile not verified/.test(customerDetail));
check('Three-step onboarding has desktop and mobile styling', /\.vault-onboarding-screen/.test(css) && /\.three-step-onboarding-guide/.test(css) && /\.onboarding-three-part-roadmap/.test(css) && /install-onboarding-content/.test(css) && /@media \(max-width: 680px\)[\s\S]*\.vault-onboarding-screen/.test(css));

if (failures) {
  console.error(`\n${failures} onboarding flow static check(s) failed.`);
  process.exit(1);
}
console.log('\nAll 34 onboarding flow static checks passed.');
