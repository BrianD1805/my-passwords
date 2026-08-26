import fs from 'node:fs';

let checks = 0;
let failures = 0;
function check(label, condition) {
  checks += 1;
  if (condition) console.log(`PASS  ${label}`);
  else { failures += 1; console.error(`FAIL  ${label}`); }
}
function read(path) { return fs.readFileSync(path, 'utf8'); }

const main = read('src/main.jsx');
const css = read('src/styles.css');
const pkg = JSON.parse(read('package.json'));
const pkgLock = JSON.parse(read('package-lock.json'));
const db = read('netlify/functions/_db.js');
const sw = read('public/sw.js');
const offline = read('public/offline.html');
const admin = read('src/AdminApp.jsx');

check('Ver-1.022 versions align', pkg.version === '1.22.0' && pkgLock.version === '1.22.0' && /Password-Encrypt Ver-1\.022/.test(main) && /Password-Encrypt Ver-1\.022/.test(db) && /my-passwords-v1\.022/.test(sw) && /Password-Encrypt Ver-1\.022/.test(offline) && /Ver-1\.022/.test(admin));
check('Locked vault exposes one recovery entry link', /Vault access &amp; recovery/.test(main) && !/Clear local vault on this device<\/button>[\s\S]*Recover account access<\/button>[\s\S]*Use Emergency Backup Code<\/button>/.test(main));
check('Master-password home message is concise', /Your master password protects your encrypted vault\. Keep it safe\./.test(main));
check('Recovery hub contains all three choices', /Clear local vault/.test(main) && /Recover account access/.test(main) && /Use Emergency Backup Code/.test(main) && /vault-access-recovery-options/.test(main));
check('Recovery hub uses drill-in details before actions', /view === 'clear'/.test(main) && /view === 'account'/.test(main) && /view === 'backup-code'/.test(main) && /choose\('menu'\)/.test(main));
check('Clear local vault still routes through existing safety confirmation', /onClearLocal=\{resetLocalVaultOnDevice\}/.test(main) && /details: \{ action: 'clear-local'/.test(main));
check('Account recovery retains verified email recovery flow', /onRecoverAccount=\{openAccountRecovery\}/.test(main) && /Send recovery code/.test(main));
check('Emergency Backup Code recovery remains available', /onBackupCode=\{openEmergencyBackupRecovery\}/.test(main) && /Recover and open vault/.test(main));
check('Recovery hub participates in popup scroll lock', /vaultAccessRecoveryModal\.visible/.test(main) && /popupOpen/.test(main));
check('Recovery hub has mobile-aware styling', /vault-access-recovery-modal-card/.test(css) && /vault-access-recovery-options/.test(css) && /@media \(max-width: 680px\)/.test(css));

if (failures) { console.error(`\n${failures} Ver-1.022 check(s) failed.`); process.exit(1); }
console.log(`\n${checks}/${checks} Ver-1.022 Vault Home simplification checks passed.`);
