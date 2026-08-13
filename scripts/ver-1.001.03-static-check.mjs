import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const main = read('src/main.jsx');
const styles = read('src/styles.css');
const pkg = JSON.parse(read('package.json'));
const sw = read('public/sw.js');

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { console.log(`PASS  ${name}`); passed += 1; }
  else { console.error(`FAIL  ${name}`); failed += 1; }
}

check('Ver-1.001.03 package and service-worker versions align', pkg.version === '1.1.3' && /Password-Encrypt Ver-1\.001\.03/.test(main) && /my-passwords-v1\.001\.03/.test(sw));
check('Founder Plan Subscription overview shows current vault item total', /Founder access and current account usage/.test(main) && /Total vault items/.test(main) && /entitlements\?\.usage\?\.vaultItems/.test(main));
check('Founder Plan Subscription overview shows document count and storage MB without limits', /Encrypted documents/.test(main) && /Account storage used/.test(main) && /usedStorageMb\.toFixed\(2\).*MB/.test(main) && /does not expire, has no plan limits/.test(main));
check('Vault home favourite summary is a clickable button', /summary-action favourite-summary-pill/.test(main) && /Show all favourite items/.test(main) && /openVaultSection\(FAVOURITES_VIEW\)/.test(main));
check('Favourites view filters all visible vault items by favourite flag', /FAVOURITES_VIEW = '__favourites__'/.test(main) && /category === FAVOURITES_VIEW \? Boolean\(item\.favourite\)/.test(main));
check('Adding from favourites view falls back to a normal vault category', /!\['All', FAVOURITES_VIEW\]\.includes\(category\)/.test(main));
check('Stored-document popup includes Share beside the Documents pill', /category-pill document-share-pill/.test(main) && /<Share2 size=\{14\}/.test(main) && /shareStoredDocument\(viewedItem\)/.test(main));
check('Document share loads and decrypts the real stored file before invoking Web Share', /loadStoredDocumentDataUrl\(item\)/.test(main) && /new File\(\[bytes\]/.test(main) && /navigator\.share\(\{ files: \[shareFile\]/.test(main));
check('Document sharing checks file-share support and has a safe fallback', /navigator\.canShare/.test(main) && /Use Download instead/.test(main) && /AbortError/.test(main));
check('Founder usage, favourites and document sharing have responsive styling', /founder-usage-grid/.test(styles) && /favourite-summary-pill\.active/.test(styles) && /document-share-pill/.test(styles) && /@media \(max-width: 700px\)[\s\S]*?founder-usage-grid \{ grid-template-columns: 1fr; \}/.test(styles));

if (failed) {
  console.error(`\n${failed} Ver-1.001.03 feature check(s) failed; ${passed} passed.`);
  process.exit(1);
}
console.log(`\nAll ${passed} Ver-1.001.03 feature checks passed.`);
