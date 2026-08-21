import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const admin = read('src/AdminApp.jsx');
const detail = read('src/AdminCustomerDetail.jsx');
const detailFn = read('netlify/functions/admin-customer-detail.js');
const css = read('src/styles.css');
const main = read('src/main.jsx');
const db = read('netlify/functions/_db.js');
const sw = read('public/sw.js');
const offline = read('public/offline.html');
const pkg = JSON.parse(read('package.json'));
const pkgLock = JSON.parse(read('package-lock.json'));
let failures = 0;
let checks = 0;
function check(label, condition) {
  checks += 1;
  if (condition) console.log(`PASS  ${label}`);
  else { failures += 1; console.error(`FAIL  ${label}`); }
}

check('Ver-1.012 versions align', pkg.version === '1.12.0' && pkgLock.version === '1.12.0' && /Password-Encrypt Ver-1\.012/.test(main) && /Password-Encrypt Ver-1\.012/.test(db) && /my-passwords-v1\.012/.test(sw) && /Password-Encrypt Ver-1\.012/.test(offline));
check('Customer selection opens standalone customer page', /if \(selectedCustomerId\)[\s\S]*admin-customer-standalone-shell/.test(admin));
check('Customer page has dedicated Back to customers action', /Back to customers/.test(detail) && /onBack=\{returnToCustomers\}/.test(admin));
check('Customer page scrolls to top on customer change', /window\.scrollTo\(\{ top: 0, left: 0, behavior: 'auto' \}\)/.test(detail) && /function openCustomer/.test(admin));
check('Customer sort defaults to newest first', /useState\('newest'\)/.test(admin) && /Newest first/.test(admin));
check('Customer sort has multiple useful options', /Oldest first/.test(admin) && /Name A–Z/.test(admin) && /Most recent sign-in/.test(admin) && /Most recent backup/.test(admin));
check('Customer detail is reorganised into clear groups', /Account and subscription/.test(detail) && /Admin controls and support/.test(detail) && /History and operational records/.test(detail));
check('Large customer panels use accordion disclosures', /function DetailAccordion/.test(detail) && /admin-detail-accordion/.test(css) && /<details/.test(detail));
check('Backup metric explains snapshot item count', /vault item\(s\) in snapshot/.test(detail) && /backupItemCountIncludesFileEntries/.test(detailFn));
check('Admin customer detail loads current document and picture counts', /document_blobs/.test(detailFn) && /storedDocumentCount/.test(detailFn) && /storedPictureCount/.test(detailFn));
check('Backup explanation says files are included rather than double-counted', /includes document and picture entries/.test(detail) && /not added to the total a second time/.test(detail));
check('Email and mobile verification use matching status rows', /admin-verification-line/.test(detail) && /Email verified/.test(detail) && /Mobile verified/.test(detail));
check('Verified ticks use green treatment', /admin-verification-line\.verified/.test(css) && /#2f7b57/.test(css));
check('Admin heading is reduced substantially', /admin-header h1[\s\S]{0,100}font-size:1\.05rem/.test(css));
check('Overview stat cards are clickable', /admin-stat-card/.test(admin) && /setSelectedOverviewStat/.test(admin));
check('Overview stat selection renders underlying data', /admin-overview-stat-detail/.test(admin) && /admin-overview-detail-list/.test(css));
check('All ten overview stats have detail selectors', ['total_accounts','active_accounts','active_trials','pending_signups','expired_trials','published_plans','paid_subscriptions','payment_problems','sync_issues','admin_actions'].every((key) => admin.includes(`setSelectedOverviewStat('${key}')`)));
check('Admin header contains one expandable Admin menu', /Admin menu/.test(admin) && /adminMenuOpen/.test(admin) && /admin-header-menu/.test(admin));
check('Main admin tabs are contained inside expanded header', !/\n\s*<nav className="admin-tabs">/.test(admin) && /<nav className="admin-tabs admin-header-menu">/.test(admin));
check('Customer metric panels are clickable shortcuts', /admin-detail-metric/.test(detail) && /openSection\('account'\)/.test(detail) && /openSection\('billing'\)/.test(detail) && /openSection\('sync'\)/.test(detail));
check('No Supabase migration is required by this Admin UX patch', !fs.existsSync(path.join(root, 'db/migrations/2026-08-21_admin_ux_ver_1_012.sql')));

if (failures) {
  console.error(`\n${failures} Ver-1.012 check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks}/${checks} Ver-1.012 Admin UX checks passed.`);
