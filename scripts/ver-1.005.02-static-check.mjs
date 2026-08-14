import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const main = read('src/main.jsx');
const styles = read('src/styles.css');
const requestFn = read('netlify/functions/emergency-access-request.js');
const documentFn = read('netlify/functions/emergency-access-document.js');
const inviteFn = read('netlify/functions/emergency-access-invite.js');
const migration = read('db/migrations/2026-08-14_emergency_import_code_ver_1_005_02.sql');
const db = read('netlify/functions/_db.js');
const sw = read('public/sw.js');
const offline = read('public/offline.html');
const pkg = JSON.parse(read('package.json'));

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { console.log(`PASS  ${name}`); passed += 1; }
  else { console.error(`FAIL  ${name}`); failed += 1; }
}

check('Ver-1.005.02 app/server/package/service-worker versions align', pkg.version === '1.5.2' && /Password-Encrypt Ver-1\.005\.02/.test(main) && /Password-Encrypt Ver-1\.005\.02/.test(db) && /my-passwords-v1\.005\.02/.test(sw) && /Password-Encrypt Ver-1\.005\.02/.test(offline));
check('Released package shows an Emergency Package Import Code', /Use Password-Encrypt\?/.test(main) && /Emergency Info → Emergency Access → Import Emergency Package/.test(main) && /emergency-import-code-display/.test(main));
check('Import code is 20 readable characters and formatted for copying', /EMERGENCY_IMPORT_CODE_LENGTH = 20/.test(main) && /EMERGENCY_IMPORT_CODE_ALPHABET/.test(main) && /match\(\/\.\{1,4\}\/g\)/.test(main));
check('Import code is deterministically derived from the secure invite token', /deriveEmergencyImportCode/.test(main) && /Password-Encrypt emergency import v1:/.test(main) && /crypto\.subtle\.digest\('SHA-256'/.test(main));
check('New Emergency Package envelopes are encrypted with the Import Code', /keyMode: 'emergency-import-code-v1'/.test(main) && /packageVersion: '2'/.test(main) && /deriveKey\(importCode, salt\)/.test(main));
check('Public release keeps backward compatibility with older invite-token envelopes', /emergencyReleaseCredential/.test(main) && /credentialType === 'import-code'/.test(main) && /return String\(credential \|\| ''\)/.test(main));
check('Owner saves only a hash of the import code to the server', /importCodeHash/.test(main) && /emergencyImportCodeHash/.test(main) && /emergency_import_code_hash/.test(inviteFn));
check('SQL adds only hashed import-code lookup to Emergency Access invitations', /add column if not exists emergency_import_code_hash text/.test(migration) && /unique index if not exists idx_emergency_access_invites_import_code_hash/.test(migration) && /revoke all on table public\.emergency_access_invitations from anon, authenticated/.test(migration));
check('No old public-page vault handoff remains', !/EMERGENCY_IMPORT_HANDOFF_KEY/.test(main) && !/entry=existing&emergencyImport=1/.test(main) && !/beginEmergencyPackageVaultImport/.test(main));
check('Emergency Access hub contains Import Emergency Package action', /Import Emergency Package/.test(main) && /openEmergencyImportCodeModal/.test(main) && /Enter code/.test(main));
check('Import modal accepts and checks the code inside the logged-in vault', /checkEmergencyPackageImportCode/.test(main) && /redeem_import_code/.test(main) && /Check code/.test(main));
check('Server requires a verified customer session and CSRF to redeem a code', /action === 'redeem_import_code'/.test(requestFn) && /getActiveCustomerSession/.test(requestFn) && /assertCsrf\(event, session, 'customer'\)/.test(requestFn));
check('Code redemption is rate limited', /scope: 'emergency_import_code'/.test(requestFn) && /limit: 12/.test(requestFn));
check('Code redemption matches the nominated email to the verified Password-Encrypt account', /email_verified/.test(requestFn) && /normaliseEmail\(recipientUser\.email\) !== normaliseEmail\(importInvitation\.contact_email\)/.test(requestFn) && /IMPORT_IDENTITY_MISMATCH/.test(requestFn));
check('Code redemption requires a released and unexpired package', /IMPORT_NOT_RELEASED/.test(requestFn) && /releaseWindowExpired\(importRequest\)/.test(requestFn) && /EMERGENCY_PACKAGE_EXPIRED/.test(requestFn));
check('Code redemption returns only a code-encrypted package envelope', /packageEnvelope/.test(requestFn) && /keyMode !== 'emergency-import-code-v1'/.test(requestFn) && !/invite_token_hash.*jsonResponse/.test(requestFn));
check('Emergency documents are refreshed into the Import Code encryption scope', /encryptionScope: encrypted\.encryptionScope/.test(main) && /emergency_import_code_v1/.test(main) && /existing\?\.metadata\?\.encryption_scope === 'emergency_import_code_v1'/.test(main));
check('Imported documents require verified code identity on the server', /action === 'open_import'/.test(documentFn) && /IMPORT_IDENTITY_MISMATCH/.test(documentFn) && /emergency_document_import_open/.test(documentFn));
check('Imported documents are decrypted with the Import Code and re-encrypted into nominee storage', /loadReleasedEmergencyDocumentForImport/.test(main) && /decryptDocumentData\(result\.document, cleanCode\)/.test(main) && /uploadEncryptedDocumentBlob/.test(main));
check('Duplicate package imports remain blocked by encrypted-envelope fingerprint', /const fingerprint = await sha256Hex\(JSON\.stringify\(result\.packageEnvelope\)\)/.test(main) && /This Emergency Package is already stored in your vault/.test(main));
check('Import still creates a separate Emergency Package folder', /emergencyImportFolderName/.test(main) && /Emergency Package —/.test(main) && /upsertFolderMetaItem/.test(main));
check('Received Emergency Packages remain listed in Emergency Access hub', /Emergency Packages received/.test(main) && /emergency-access-package-link/.test(main));
check('Import Code UI is responsive on mobile', /emergency-import-code-display/.test(styles) && /emergency-import-code-field/.test(styles) && /@media \(max-width: 700px\)[\s\S]*emergency-import-code-display/.test(styles));
check('Emergency Access FAQ describes the Import Code flow', /secure Import Code/.test(main) && /Emergency Info → Emergency Access/.test(main));

if (failed) {
  console.error(`\n${failed} Ver-1.005.02 feature check(s) failed; ${passed} passed.`);
  process.exit(1);
}
console.log(`\nAll ${passed} Ver-1.005.02 feature checks passed.`);
