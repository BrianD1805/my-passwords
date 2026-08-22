import fs from 'node:fs';
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const pkgLock = JSON.parse(read('package-lock.json'));
const main = read('src/main.jsx');
const sw = read('public/sw.js');
const offline = read('public/offline.html');
const admin = read('src/AdminApp.jsx');
const db = read('netlify/functions/_db.js');
let checks = 0;
let failures = 0;
function check(label, condition) {
  checks += 1;
  if (condition) console.log(`PASS  ${label}`);
  else { failures += 1; console.error(`FAIL  ${label}`); }
}
check('Ver-1.019.01 versions align', pkg.version === '1.19.1' && pkgLock.version === '1.19.1' && /Password-Encrypt Ver-1\.019\.01/.test(main) && /Password-Encrypt Ver-1\.019\.01/.test(db) && /my-passwords-v1\.019\.01/.test(sw) && /Password-Encrypt Ver-1\.019\.01/.test(offline) && /Ver-1\.019\.01/.test(admin));
check('Action progress state exists', /const \[actionProgress, setActionProgress\]/.test(main));
check('Action progress modal component exists', /function ActionProgressModal/.test(main) && /className="primary-button" onClick=\{onClose\}>OK/.test(main));
check('Vault app renders action progress modal', (main.match(/<ActionProgressModal state=\{actionProgress\} onClose=\{closeActionProgress\} \/>/g) || []).length >= 2);
check('Action progress locks background scrolling', /deviceVerificationModal\.visible \|\| actionProgress\.visible \|\| subscriptionActionModal\.visible/.test(main));
check('Action progress visibility is a popup-lock dependency', /deviceVerificationModal\.visible, actionProgress\.visible, subscriptionActionModal\.visible/.test(main));
check('Recovery point action uses progress modal', /beginActionProgress\('Checking recovery points'/.test(main) && /finishActionProgress\('success', 'Recovery points checked'/.test(main));
check('Backup action uses progress modal', /beginActionProgress\('Check and back up now'/.test(main) && /finishActionProgress\('success', 'Backup complete'/.test(main));
check('Cross-device action uses progress modal', /beginActionProgress\('Checking for changes'/.test(main) && /finishActionProgress\('success', 'Check complete'/.test(main));
check('Vault Status action uses progress modal', /beginActionProgress\('Checking Vault Status'/.test(main) && /finishActionProgress\('success', 'Vault Status checked'/.test(main));
if (failures) {
  console.error(`\n${failures} Ver-1.019.01 check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks}/${checks} Ver-1.019.01 action progress popup checks passed.`);
