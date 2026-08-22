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
check('Server entitlements enforce item limit metadata', entitlements.includes('ENTITLEMENT_VERSION = 3') && sync.includes('ITEM_LIMIT_REACHED'));
check('Mobile plans stack vertically with the original layout restored', !css.includes('Swipe left to compare plans') && /Ver-0\.053F[\s\S]*?landing-plan-tier-grid\s*\{[\s\S]*?display:\s*grid\s*!important/.test(css));
check('Customer subscription shows plan usage meters with total account storage', main.includes('plan-usage-card') && main.includes('Encrypted documents') && main.includes('Total account storage'));
check('Total account storage counts encrypted vault backup plus encrypted documents', entitlements.includes('vaultStorageBytes') && entitlements.includes('documentStorageBytes') && entitlements.includes('pictureStorageBytes') && entitlements.includes('storageBytes: documentStorageBytes + pictureStorageBytes + vaultStorageBytes') && sync.includes('projectedStorageBytes'));
check('FAQ uses click-to-reveal disclosure rows', main.includes('landing-faq-accordion') && main.includes('<details>') && main.includes('<summary>') && css.includes('.landing-faq-accordion details[open]'));
check('Choose your plan is positioned after Simple setup', main.indexOf('landing-how-section') < main.indexOf('landing-plan-section'));
check('Standalone Privacy and security panel is removed and security guidance moved into FAQ', !main.includes('aria-label="Privacy and security"') && main.includes('How is my vault protected before it reaches the cloud?') && main.includes('What does verified-device protection mean?'));
check('Plan cards have increased 31px spacing without reintroducing a carousel', css.includes('.landing-plan-tier-grid {\n  gap: 31px;') && !/landing-plan-tier-grid\s*\{[\s\S]{0,500}overflow-x:\s*auto/.test(css));
check('Plans use viewport reveal motion with reduced-motion fallback', main.includes("new IntersectionObserver") && main.includes('landing-plan-reveal') && css.includes('@media (prefers-reduced-motion: reduce)'));
check('Plan item copy is concise without the parenthetical item-type list', main.includes('`${plan.itemLimit} vault items`') && !main.includes('vault items (passwords, cards, notes & more)'));
check('Landing FAQs use premium numbered disclosure styling', css.includes('counter-reset: landing-faq') && css.includes('counter(landing-faq, decimal-leading-zero)') && css.includes('.landing-faq-accordion details[open]'));
check('Account, subscription, Vault Safety and Trusted Person use multi-open Settings-style drill-down sections', main.includes('settings-drilldown-stack') && !main.includes('name="account-sections"') && !main.includes('name="subscription-sections"') && !main.includes('name="safety-sections"') && !main.includes('name="trusted-person-sections"') && css.includes('.settings-drilldown-stack'));

check('Ubuntu is locked across landing, vault and Admin using real Ubuntu weights', css.startsWith('@import url("https://fonts.googleapis.com/css?family=Ubuntu:300,400,500,700') && css.includes('font-synthesis: none') && css.includes('.admin-shell *') && css.includes('.app-shell h2') && main.includes('ensureUbuntuFontStylesheet') && !read('public/sw.js').includes("const isFontAsset = ['fonts.googleapis.com'"));
check('Landing hierarchy carries lighter weights throughout', css.includes('Carry the lighter hero/Next-of-Kin hierarchy through the whole landing page') && css.includes('.public-landing-page h3') && css.includes('font-weight: 500 !important;'));
check('Emergency package title can be fully cleared before retyping', main.includes("value={emergencyDraft.emergencyPackageTitle ?? ''}"));
check('Subscription overview no longer has the long introductory paragraph', !main.includes('See your current status, renewal and payment history here.'));
check('Cross-device check has visible busy and completion feedback', main.includes('cloudChangeCheckBusy') && main.includes('Checking for changes...') && main.includes('Check complete. This device already has the latest protected vault copy.'));
check('Vault Safety redundant device/backup/conflict explainer panels are removed', !main.includes('vault-safety-explainer-grid'));
check('Recovery point check has clearer label and working feedback', main.includes('Check recovery points') && main.includes('Checking recovery points...') && main.includes('recovery-check-status'));
check('Everything important appears before Next of Kin spotlight', main.indexOf('Everything important, neatly organised') < main.indexOf('Next of Kin / Trusted Person Access'));
check('Trial payment note no longer mentions Stripe Checkout', main.includes('You only enter payment details if you later choose to purchase a subscription.') && !main.includes('You only enter payment details if you later choose to purchase a subscription through Stripe Checkout.'));


check('Admin login no longer shows Return to Password-Encrypt', !admin.includes('href="/">Return to Password-Encrypt'));
check('Mobile landing has 5px more side padding', css.includes('width: min(calc(100% - 32px), 620px) !important;'));
check('Everything important remains before Next of Kin on mobile flow', main.indexOf('Everything important, neatly organised') < main.indexOf('Next of Kin / Trusted Person Access'));
check('Mobile hero hides CTA row and security highlight pills only at mobile breakpoint', css.includes('.landing-hero-copy .landing-cta-row,') && css.includes('.landing-hero-copy .landing-trust-strip') && css.includes('display: none !important;'));
check('FAQ has stronger blue premium treatment without drop shadows', css.includes('border-left: 4px solid #336699') && css.includes('background: #336699;') && !/Ver-0\.053I[\s\S]*?landing-faq-accordion[\s\S]{0,1200}box-shadow/.test(css));

check('Uploaded favicon artwork is wired into browser and Apple icon links', read('index.html').includes('/favicon.ico') && read('index.html').includes('/favicon-32x32.png') && read('index.html').includes('/apple-touch-icon.png'));
check('PWA manifest uses new 192, 512 and maskable PNG icons', read('public/manifest.webmanifest').includes('/icons/icon-192.png') && read('public/manifest.webmanifest').includes('/icons/icon-512.png') && read('public/manifest.webmanifest').includes('/icons/icon-maskable-512.png'));
check('Startup and offline splash keep a circular new icon', read('index.html').includes('/icons/splash-icon.png') && read('index.html').includes('border-radius:50%') && read('public/offline.html').includes('/icons/splash-icon.png'));
check('Open Graph and sharing metadata use the new favicon artwork', read('index.html').includes('property="og:image" content="https://password-encrypt.com/images/password-encrypt-og.png"') && read('index.html').includes('name="twitter:image" content="https://password-encrypt.com/images/password-encrypt-og.png"'));
check('Service worker precaches current favicon, PWA, splash and sharing assets', read('public/sw.js').includes('/icons/icon-512.png') && read('public/sw.js').includes('/icons/splash-icon.png') && read('public/sw.js').includes('/images/password-encrypt-og.png'));

if (process.exitCode) process.exit(1);
console.log(`\nAll ${passed} landing/plan UX static checks passed.`);
