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

check('Footer uses new one-line trust wording', main.includes('A trusted place for your private details that matter.') && css.includes('.landing-footer-copy {') && css.includes('white-space: nowrap;'));
check('Admin typography has lighter hierarchy overrides', css.includes('Admin keeps hierarchy') && css.includes('.admin-shell h2,') && css.includes('font-weight: 600 !important;'));
check('Emergency Access explicitly describes next of kin and incapacity', main.includes('Next of Kin / Trusted Person Access') && main.includes('incapacitated'));
check('Plan cards suppress duplicated document/storage limit marketing rows', main.includes('document\\s*limit') && main.includes('encrypted\\s+documents'));
check('Plan item limit is editable and public', admin.includes('itemLimit') && publicPlans.includes('item_limit') && main.includes('vault items'));
check('Server entitlements enforce item limit metadata', entitlements.includes('ENTITLEMENT_VERSION = 2') && sync.includes('ITEM_LIMIT_REACHED'));
check('Mobile plans use horizontal swipe scroll snap', css.includes('scroll-snap-type:x mandatory') && css.includes('Swipe left to compare plans'));
check('Customer subscription shows plan usage meters', main.includes('plan-usage-card') && main.includes('Encrypted documents') && main.includes('Encrypted document storage'));

if (process.exitCode) process.exit(1);
console.log(`\nAll ${passed} landing/plan UX static checks passed.`);
