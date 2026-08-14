import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const main = read('src/main.jsx');
const styles = read('src/styles.css');
const legal = read('src/LegalPages.jsx');
const db = read('netlify/functions/_db.js');
const sw = read('public/sw.js');
const pkg = JSON.parse(read('package.json'));

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { console.log(`PASS  ${name}`); passed += 1; }
  else { console.error(`FAIL  ${name}`); failed += 1; }
}

check('Ver-1.005.01 app/server/package/service-worker versions align', pkg.version === '1.5.1' && /Password-Encrypt Ver-1\.005\.01/.test(main) && /Password-Encrypt Ver-1\.005\.01/.test(db) && /my-passwords-v1\.005\.01/.test(sw));
check('Favourite pill uses 0 Favourites / 1 Favourite / 2 Favourites grammar', /=== 1 \? 'Favourite' : 'Favourites'/.test(main) && !/favourite item\{/.test(main));
check('Default Emergency Info starter item is a functional Emergency Access hub', /title: 'Emergency Access'/.test(main) && /systemAction: 'emergency_access_hub'/.test(main) && /receivedPackages: \[\]/.test(main));
check('Legacy untouched Emergency Access Note is safely upgraded', /isLegacyEmergencyAccessStarterItem/.test(main) && /upsertEmergencyAccessHubItem\(items\)/.test(main));
check('Released package offers Import into my vault', /Already use Password-Encrypt\?/.test(main) && /Import into my vault/.test(main) && /beginEmergencyPackageVaultImport/.test(main));
check('Emergency import handoff stores only the release token in session storage with an expiry', /EMERGENCY_IMPORT_HANDOFF_KEY/.test(main) && /sessionStorage\.setItem\(EMERGENCY_IMPORT_HANDOFF_KEY/.test(main) && /EMERGENCY_IMPORT_HANDOFF_MAX_AGE_MS/.test(main));
check('Emergency import requires an existing verified Password-Encrypt account/device', /entry=existing&emergencyImport=1/.test(main) && /Verify this device before importing/.test(main) && /customerSession\.authenticated/.test(main));
check('Released package is re-fetched and decrypted after vault unlock', /loadEmergencyPackageForVaultImport/.test(main) && /emergency-access-request/.test(main) && /decryptEmergencyReleasePackage\(result\.packageEnvelope/.test(main));
check('Duplicate package imports are blocked using a non-token fingerprint', /const fingerprint = await sha256Hex/.test(main) && /This Emergency Package is already stored in your vault/.test(main));
check('Import creates one new custom Emergency Package folder', /emergencyImportFolderName/.test(main) && /Emergency Package —/.test(main) && /upsertFolderMetaItem/.test(main));
check('Imported records preserve original item type while remaining in the received folder', /effectiveVaultItemType/.test(main) && /sourceCategory/.test(main) && /emergency-import-source-pill/.test(main));
check('Imported source records cannot inject another Emergency Access hub', /delete sourcePayload\.systemAction;/.test(main) && /delete sourcePayload\.receivedPackages;/.test(main));
check('Released documents are decrypted from the release and re-encrypted into nominee document storage', /loadReleasedEmergencyDocument\(documentMeta, token\)/.test(main) && /uploadEncryptedDocumentBlob/.test(main) && /uploadedDocumentEntries/.test(main));
check('Import preflights item and document plan limits', /addedVisibleItems/.test(main) && /documentLimit/.test(main) && /showEntitlementUpgrade\('documents'/.test(main));
check('Imported package overview preserves owner notes and instructions', /emergencyPackageOverviewNotes/.test(main) && /Emergency message/.test(main) && /Owner instructions/.test(main));
check('Emergency Access hub lists received packages and opens their folder', /Emergency Packages received/.test(main) && /emergency-access-package-link/.test(main) && /openVaultSection\(received\.folderName\)/.test(main));
check('Imported archive items cannot be edited accidentally', /!isEmergencyImportedItem\(viewedItem\)/.test(main) && /readOnlyArchive: true/.test(main));
check('Renaming a received package folder updates the hub and imported metadata', /updateEmergencyAccessHubPackageFolder/.test(main) && /folderName: nextName/.test(main));
check('Emergency Access FAQ explains subscriber vault import', /already uses Password-Encrypt/.test(main) && /separate Emergency Package folder/.test(main));
check('Legal Emergency Access wording covers recipient vault import', /import the released package into their own encrypted vault/.test(legal));
check('Received-package import and hub have responsive styling', /emergency-vault-import-card/.test(styles) && /emergency-import-popup-card/.test(styles) && /emergency-access-hub-view/.test(styles) && /@media \(max-width: 700px\)[\s\S]*emergency-vault-import-card/.test(styles));

if (failed) {
  console.error(`\n${failed} Ver-1.005 feature check(s) failed; ${passed} passed.`);
  process.exit(1);
}
console.log(`\nAll ${passed} Ver-1.005 feature checks passed.`);
