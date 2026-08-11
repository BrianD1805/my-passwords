import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const main = read('src/main.jsx');
const pkg = JSON.parse(read('package.json'));
const sw = read('public/sw.js');
let failures = 0;

function check(label, condition) {
  if (condition) console.log(`PASS  ${label}`);
  else { console.error(`FAIL  ${label}`); failures += 1; }
}

check('Ver-0.055 app/package/service-worker versions align', pkg.version === '0.0.55' && /Password-Encrypt Ver-0\.055/.test(main) && /my-passwords-v0\.055/.test(sw));
check('Landing Open My Vault opens an existing/new customer choice', /function openVaultApp\(\)[\s\S]*isPublicLandingRoute[\s\S]*setIsOpenVaultChoicePopupOpen\(true\)/.test(main));
check('Choice clearly separates existing customer from new customer', /Yes — I’m an existing customer/.test(main) && /No — I’m new to Password-Encrypt/.test(main));
check('Existing customer route carries explicit existing-entry intent', /window\.location\.assign\('\/vault\?entry=existing'\)/.test(main) && /vaultEntryMode === 'existing'/.test(main));
check('Existing-customer vault screen exposes Open Existing Vault without Create Vault in that branch', /\) : existingCustomerEntry \? \([\s\S]*Open Existing Vault[\s\S]*\) : \([\s\S]*Create Vault/.test(main));
check('Existing-customer restore failure cannot switch into create mode', /if \(!createMode\) \{[\s\S]*if \(existingCustomerEntry\)[\s\S]*No new vault was created[\s\S]*return;[\s\S]*setCreateMode\(true\)/.test(main));
check('Existing account discovered during signup finishes through existing-customer route', /window\.location\.assign\(landingSignup\.existingAccount \? '\/vault\?entry=existing' : '\/vault'\)/.test(main));
check('New-customer signup still finishes through normal secure vault setup', /landingSignup\.existingAccount \? '\/vault\?entry=existing' : '\/vault'/.test(main) && /Continue to secure vault setup/.test(main));
check('Existing vault popup wording does not describe new vault creation', /Open your existing vault/.test(main) && /This does not create a new vault or a new account/.test(main));

if (failures) {
  console.error(`\n${failures} onboarding flow static check(s) failed.`);
  process.exit(1);
}
console.log('\nAll 9 onboarding flow static checks passed.');
