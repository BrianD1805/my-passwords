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
const backupFn = read('netlify/functions/emergency-backup-codes.js');
const syncFn = read('netlify/functions/sync-vault.js');
const legal = read('src/LegalPages.jsx');

check('Ver-1.023 versions align', pkg.version === '1.23.0' && pkgLock.version === '1.23.0' && /Password-Encrypt Ver-1\.023/.test(main) && /Password-Encrypt Ver-1\.023/.test(db) && /my-passwords-v1\.023/.test(sw) && /Password-Encrypt Ver-1\.023/.test(offline) && /Ver-1\.023/.test(admin));
check('Generated-code popup uses Done', /EmergencyBackupCodesModal/.test(main) && />Done<\/button>/.test(main) && !/I have saved them/.test(main));
check('Generated-code actions use a two-column grid', /emergency-backup-codes-modal-footer[\s\S]*grid-template-columns:\s*repeat\(2/.test(css));
check('Backup-code status preloads for verified sessions', /!customerSession\.authenticated \|\| emergencyBackupCodes\.loading \|\| emergencyBackupCodes\.loaded/.test(main) && /Preload once per verified session/.test(main));
check('Settings directory never falsely says Set up while loading', /!emergencyBackupCodes\.loaded \? 'Checking…'/.test(main));
check('Configured backup-code Settings view is compact', /emergency-backup-compact-card/.test(main) && /Generate new set/.test(main) && /Send reminder now/.test(main) && !/Refresh status/.test(main));
check('Emergency recovery requires a new master password', /EmergencyMasterPasswordResetModal/.test(main) && /Set a new master password/.test(main) && /setNewMasterPasswordAfterEmergencyRecovery/.test(main));
check('Recovered password is held only in memory ref', /emergencyRecoveredPasswordRef = useRef\(''\)/.test(main));
check('Password reset re-encrypts stored files under a fresh salt', /Re-securing encrypted file/.test(main) && /uploadEncryptedDocumentBlob\([\s\S]*newPassword, newSalt\)/.test(main) && /saltOverride/.test(main));
check('Password reset re-encrypts vault and syncs new recovery point', /encryptVault\(rekeyedItems, newPassword, bootstrap, \{ saltOverride: newSalt \}\)/.test(main) && /syncEncryptedVault\(\{ envelope: newEnvelope/.test(main));
check('Secure device unlock is cleared after master-password replacement', /localStorage\.removeItem\(BIOMETRIC_UNLOCK_KEY\)/.test(main) && /deleteBiometricDeviceKey\(\)/.test(main));
check('Previous backup-code set can be revoked server-side', /action === 'revoke_all'/.test(backupFn) && /emergency_backup_codes_revoked/.test(backupFn));
check('Old encrypted recovery points can be removed after password change', /action \|\| ''\) === 'reset_snapshot_history'/.test(syncFn) && /vault_snapshot_history_reset_after_password_change/.test(syncFn));
check('Fresh backup-code set is prepared for the new password', /createEmergencyBackupCodeSetForPassword\(newPassword/.test(main) && /freshCodeSet/.test(main));
check('Legal wording explains post-code password replacement', /requires you to set a new master password before continuing/.test(legal) && /invalidates the previous recovery-code set/.test(legal));

if (failures) { console.error(`\n${failures} Ver-1.023 check(s) failed.`); process.exit(1); }
console.log(`\n${checks}/${checks} Ver-1.023 Emergency Backup Codes UX and recovery checks passed.`);
