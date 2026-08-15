import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const main = read('src/main.jsx');
const styles = read('src/styles.css');
const pkg = JSON.parse(read('package.json'));
const sw = read('public/sw.js');
const db = read('netlify/functions/_db.js');
const accountSession = read('netlify/functions/_account-session.js');

const checks = [];
function check(name, condition) { checks.push({ name, pass: Boolean(condition) }); }

check('Ver-1.006 app/server/package/service-worker versions align', pkg.version === '1.6.0' && /Password-Encrypt Ver-1\.006/.test(main) && /Password-Encrypt Ver-1\.006/.test(db) && /my-passwords-v1\.006/.test(sw));
check('Vault Status includes live device verification state before up-to-date state', /vaultVerificationRequired/.test(main) && /vaultSessionCheckFailed/.test(main) && /'Verify device'/.test(main) && /'Check needed'/.test(main));
check('Both Vault Status controls use the same repair action', (main.match(/onClick=\{openVaultStatusDetails\}/g) || []).length >= 2);
check('Verified-device requirement opens the verification popup directly', /if \(vaultVerificationRequired\) \{[\s\S]*?openDeviceVerification\(\)/.test(main));
check('Backup pending status opens the backup repair popup', /mode: syncSafety\.sessionRequired \? 'verification-required' : 'backup-failed'/.test(main));
check('Unknown status has an in-popup Check now action', /mode: 'status-check'/.test(main) && /Check now/.test(main) && /handleVaultStatusCheck/.test(main));
check('Conflict status can reopen or re-check the actual conflict popup', /if \(syncSafety\.conflict\)/.test(main) && /syncSafetyModal\.details\?\.latest\?\.snapshot/.test(main) && /refreshVaultAndBackup\(\)/.test(main));
check('Large red sync warning banner is no longer rendered', !/<section className=\{`sync-warning-banner/.test(main));
check('Routine sync problems no longer trigger a delayed automatic popup', /Vault Status is the single repair entry point/.test(main) && !/setTimeout\(\(\) => \{[\s\S]*?Vault sync needs your attention/.test(main));
check('Conflict copy panels are fully clickable actions', /className=\{`sync-conflict-choice/.test(main) && /onClick=\{onKeepDevice\}/.test(main) && /onClick=\{onUseCloud\}/.test(main));
check('Conflict popup marks newer recorded copy as Recommended', /recommendedCopy/.test(main) && /Recommended/.test(main) && /newer recorded change time/.test(main));
check('Conflict panels stack cleanly on mobile', /@media \(max-width: 640px\)[\s\S]*?\.sync-conflict-choice-grid[\s\S]*?grid-template-columns: 1fr/.test(styles));
check('Session status checks are single-flight and debounced', /sessionCheckPromise/.test(main) && /lastSessionCheckStartedAt/.test(main) && /Date\.now\(\) - lastSessionCheckStartedAt < 1200/.test(main));
check('Transient session-status failures preserve last known verification state', /temporary function\/database failure/.test(main) && /setCustomerSession\(\(current\) => \(\{[\s\S]*?\.\.\.current,[\s\S]*?SESSION_CHECK_FAILED/.test(main));
check('Server recovers recently rotated sessions to avoid unnecessary OTP verification', /ROTATION_RECOVERY_MINUTES/.test(accountSession) && /recoveredRotation/.test(accountSession) && /rotated_from/.test(accountSession) && /issueCustomerSession/.test(accountSession));
check('Session lifecycle metadata carries the current version', (accountSession.match(/app_version: '1\.006'/g) || []).length >= 2);
check('Vault Safety settings no longer show Up to date while verification is required', /vaultVerificationRequired \? 'Device verification required'/.test(main) && /vaultVerificationRequired \? 'Verify device'/.test(main));
check('Verification/check-needed Vault Status gets a visible risk style', /\.topbar-sync-button\.verification/.test(styles) && /\.topbar-sync-button\.check-failed/.test(styles));

const failed = checks.filter((item) => !item.pass);
for (const item of checks) console.log(`${item.pass ? 'PASS' : 'FAIL'}  ${item.name}`);
if (failed.length) {
  console.error(`\n${failed.length} Ver-1.006 static check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} Ver-1.006 static checks passed.`);
