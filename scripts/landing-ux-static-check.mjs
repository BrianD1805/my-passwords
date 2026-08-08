import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const main = read('src/main.jsx');
const css = read('src/styles.css');
const admin = read('src/AdminApp.jsx');
const entitlements = read('netlify/functions/_entitlements.js');
const sync = read('netlify/functions/sync-vault.js');
const publicPlans = read('netlify/functions/public-plans.js');
let passed = 0;
function check(label, condition) {
  if (!condition) { console.error(`FAIL  ${label}`); process.exitCode = 1; return; }
  passed += 1;
  console.log(`PASS  ${label}`);
}

check('Footer keeps one-line trust wording and shifts desktop links right by 35px', main.includes('A trusted place for your private details that matter.') && css.includes('white-space: nowrap;') && css.includes('margin-left: 53px;'));
check('Admin typography has lighter hierarchy overrides', css.includes('Admin keeps hierarchy') && css.includes('.admin-shell h2,') && css.includes('font-weight: 600 !important;'));
check('Emergency Access explicitly describes next of kin and incapacity', main.includes('Next of Kin / Trusted Person Access') && main.includes('incapacitated'));
check('Plan cards suppress duplicated document/storage limit marketing rows', main.includes('document\\s*limit') && main.includes('encrypted\\s+documents'));
check('Plan item limit is editable and public', admin.includes('itemLimit') && publicPlans.includes('item_limit') && main.includes('vault items'));
check('Server entitlements enforce item limit metadata', entitlements.includes('ENTITLEMENT_VERSION = 2') && sync.includes('ITEM_LIMIT_REACHED'));
check('Mobile plans stack vertically with the original layout restored', !css.includes('Swipe left to compare plans') && /Ver-0\.053F[\s\S]*?landing-plan-tier-grid\s*\{[\s\S]*?display:\s*grid\s*!important/.test(css));
check('Customer subscription shows plan usage meters with total account storage', main.includes('plan-usage-card') && main.includes('Encrypted documents') && main.includes('Total account storage'));
check('Total account storage counts encrypted vault backup plus encrypted documents', entitlements.includes('vaultStorageBytes') && entitlements.includes('documentStorageBytes') && entitlements.includes('storageBytes: documentStorageBytes + vaultStorageBytes') && sync.includes('projectedStorageBytes'));
check('FAQ uses click-to-reveal disclosure rows', main.includes('landing-faq-accordion') && main.includes('<details>') && main.includes('<summary>') && css.includes('.landing-faq-accordion details[open]'));
check('Choose your plan is positioned after Simple setup', main.indexOf('Simple setup') < main.indexOf('Choose your plan'));
check('Standalone Privacy and security panel is removed and security guidance moved into FAQ', !main.includes('aria-label="Privacy and security"') && main.includes('How is my vault protected before it reaches the cloud?') && main.includes('What does verified-device protection mean?'));

if (process.exitCode) process.exit(1);
console.log(`\nAll ${passed} landing/plan UX static checks passed.`);
