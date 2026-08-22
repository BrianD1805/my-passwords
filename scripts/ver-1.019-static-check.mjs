import fs from 'node:fs';
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const pkgLock = JSON.parse(read('package-lock.json'));
const main = read('src/main.jsx');
const css = read('src/styles.css');
const server = read('netlify/functions/sync-vault.js');
const db = read('netlify/functions/_db.js');
const sw = read('public/sw.js');
const offline = read('public/offline.html');
const admin = read('src/AdminApp.jsx');
let checks = 0;
let failures = 0;
function check(label, condition) {
  checks += 1;
  if (condition) console.log(`PASS  ${label}`);
  else { failures += 1; console.error(`FAIL  ${label}`); }
}
check('Ver-1.019 versions align', pkg.version === '1.19.0' && pkgLock.version === '1.19.0' && /Password-Encrypt Ver-1\.019/.test(main) && /Password-Encrypt Ver-1\.019/.test(db) && /my-passwords-v1\.019/.test(sw) && /Password-Encrypt Ver-1\.019/.test(offline) && /Ver-1\.019/.test(admin));
check('Recovery history is capped at 30 points', /MAX_RECOVERY_POINTS = 30/.test(server) && /pruneVaultRecoveryPoints/.test(server) && /prune_snapshot_history/.test(server));
check('Old recovery points are pruned after successful backup', /await pruneVaultRecoveryPoints\(tenantId, userId\)/.test(server));
check('Recovery check prunes existing history', /pruneBeforeLoad/.test(main) && /action: 'prune_snapshot_history'/.test(main));
check('Recovery status reports latest secured backup not total backups', /Your latest secured cloud backup contains/.test(main) && !/backup\(s\) found\./.test(main));
check('Recovery tools has explicit desktop/mobile padding', /advanced-recovery-card\.settings-inner-card[\s\S]*padding: 18px/.test(css) && /@media \(max-width: 680px\)[\s\S]*advanced-recovery-card\.settings-inner-card[\s\S]*padding: 16px/.test(css));
check('Generic action progress popup exists', /function ActionProgressModal/.test(main) && /vault-action-progress-icon/.test(main) && /className="primary-button" onClick=\{onClose\}>OK/.test(main));
check('Recovery point check uses action progress popup', /function checkRecoveryPointsWithProgress/.test(main) && /onClick=\{checkRecoveryPointsWithProgress\}/.test(main));
check('Check and backup uses action progress popup', /function checkAndBackupWithProgress/.test(main) && /onClick=\{checkAndBackupWithProgress\}/.test(main));
check('Cross-device change check uses action progress popup', /function checkOtherDevicesWithProgress/.test(main) && /onClick=\{checkOtherDevicesWithProgress\}/.test(main));
check('Manual backup avoids duplicate success toast', /syncEncryptedVault\(\{ envelope: getLocalEnvelope\(\), nextItems: items, silent: true/.test(main) && /suppressToast/.test(main));
check('Recovery wording is singular clean status', /No secured cloud backup has been created yet\./.test(main) && !/encrypted recovery point\(s\) are available/.test(main));
if (failures) {
  console.error(`\n${failures} Ver-1.019 check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks}/${checks} Ver-1.019 Settings Cleanup UX checks passed.`);
