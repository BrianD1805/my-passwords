import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
const check = (name, pass) => checks.push({ name, pass: Boolean(pass) });

const main = read('src/main.jsx');
const styles = read('src/styles.css');
const admin = read('src/AdminApp.jsx');
const entitlements = read('netlify/functions/_entitlements.js');
const documentBlob = read('netlify/functions/document-blob.js');
const emergencyFile = read('netlify/functions/emergency-access-document.js');
const adminData = read('netlify/functions/admin-data.js');
const publicPlans = read('netlify/functions/public-plans.js');
const bootstrapAdmin = read('netlify/functions/bootstrap-admin.js');
const dbHealth = read('netlify/functions/db-health.js');
const migration = read('db/migrations/2026-08-16_picture_uploads_ver_1_008.sql');
const pkg = JSON.parse(read('package.json'));
const sw = read('public/sw.js');
const offline = read('public/offline.html');
const db = read('netlify/functions/_db.js');

check('App version is Ver-1.008', /Password-Encrypt Ver-1\.008/.test(main));
check('npm version is 1.8.0', pkg.version === '1.8.0');
check('Server version is Ver-1.008', /Password-Encrypt Ver-1\.008/.test(db));
check('Service worker cache is Ver-1.008', /my-passwords-v1\.008/.test(sw));
check('Offline page is Ver-1.008', /Password-Encrypt Ver-1\.008/.test(offline));
check('Pictures are a built-in vault category', /PICTURES_CATEGORY = 'Pictures'/.test(main) && /BUILT_IN_CATEGORIES[\s\S]*'Pictures'/.test(main));
check('Picture upload is limited to 10 MB in the browser', /MAX_PICTURE_BYTES = 10 \* 1024 \* 1024/.test(main));
check('Picture formats include JPG PNG WEBP HEIC and HEIF', /ALLOWED_PICTURE_EXTENSIONS[\s\S]*'jpg'[\s\S]*'png'[\s\S]*'webp'[\s\S]*'heic'[\s\S]*'heif'/.test(main));
check('Picture picker and encrypted preview are present', /handlePictureFileChange/.test(main) && /Choose picture/.test(main) && /picture-selected/.test(styles));
check('Stored pictures can be viewed shared and downloaded', /previewStoredPicture/.test(main) && /shareStoredDocument/.test(main) && /stored-picture-preview/.test(styles));
check('Client entitlements include Picture limits and usage', /photoLimit/.test(main) && /usage:[\s\S]*pictures/.test(main));
check('Entitlement engine includes Pictures and photoLimit', /pictures: 'pictures'/.test(entitlements) && /photoLimit/.test(entitlements) && /PHOTO/.test(documentBlob));
check('Admin Subscriptions has Picture limit', /Picture limit/.test(admin) && /photoLimit/.test(admin));
check('Admin Subscriptions has Encrypted pictures feature toggle', /Encrypted pictures/.test(admin) && /featureFlags\.pictures/.test(admin));
check('Admin saves photo_limit', /photo_limit: toNonNegativeInt\(plan\.photoLimit\)/.test(adminData));
check('Published plans load photo_limit', /photo_limit/.test(publicPlans) && /photo_limit/.test(bootstrapAdmin));
check('Customer plan features show encrypted picture allowance', /encrypted picture/.test(main) && /plan\.photoLimit/.test(main));
check('Founder usage shows encrypted pictures', /Founder Plan/.test(main) && /Encrypted pictures/.test(main) && /usedPictures/.test(main));
check('Server enforces supported Picture types and 10 MB per encrypted file', /ALLOWED_PICTURE_EXTENSIONS/.test(documentBlob) && /PICTURE_TYPE_NOT_SUPPORTED/.test(documentBlob) && /MAX_UPLOAD_BYTES = 10 \* 1024 \* 1024/.test(documentBlob) && /UPLOAD_TOO_LARGE/.test(documentBlob));
check('Server enforces Picture plan limit', /PHOTO_LIMIT_REACHED/.test(documentBlob) && /photoLimit/.test(documentBlob));
check('Blob records distinguish documents from pictures', /blob_kind/.test(documentBlob) && /blob_kind/.test(migration));
check('Documents and Pictures use chunked encrypted transport', /init_chunked/.test(documentBlob) && /upload_chunk/.test(documentBlob) && /finalize_chunked/.test(documentBlob) && /document_blob_chunks/.test(migration));
check('Chunked file transport caps encrypted aggregate size server-side', /MAX_ENCRYPTED_BLOB_CHARACTERS/.test(documentBlob) && /projectedCharacters/.test(documentBlob) && /actualStorageBytes/.test(documentBlob));
check('Interrupted newly selected file uploads are cleaned up client-side', /removeStoredDocumentBlob\(\{ documentId, tenantId: bootstrap\.tenantId, userId: bootstrap\.userId \}/.test(main));
check('Emergency files support chunked encrypted transport', /init_chunked/.test(emergencyFile) && /open_chunk/.test(emergencyFile) && /emergency_access_document_chunks/.test(migration));
check('Full Emergency Package includes Pictures', /PICTURES_CATEGORY/.test(main) && /pictureCount/.test(main) && /sourceCategory === PICTURES_CATEGORY \? 'Pictures' : 'Documents'/.test(main));
check('Emergency import enforces Picture entitlement and limit', /featureIncluded\('pictures'\)/.test(main) && /photoLimit/.test(main) && /releasedPictures/.test(main));
check('Picture plan migration is additive and service-role protected', /add column if not exists photo_limit/.test(migration) && /create table if not exists public\.document_blob_chunks/.test(migration) && /grant select, insert, update, delete on public\.document_blob_chunks to service_role/.test(migration) && /revoke all on public\.document_blob_chunks from anon, authenticated/.test(migration));
check('Database health checks Ver-1.008 Picture schema', /photo_limit/.test(dbHealth) && /document_blob_chunks/.test(dbHealth) && /emergency_access_document_chunks/.test(dbHealth));
check('Landing page advertises important Pictures', /Photo IDs, passports and important images/.test(main));

const failed = checks.filter((item) => !item.pass);
for (const item of checks) console.log(`${item.pass ? 'PASS' : 'FAIL'}  ${item.name}`);
if (failed.length) {
  console.error(`\n${failed.length} Ver-1.008 feature check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks.length}/${checks.length} Ver-1.008 Picture Upload checks passed.`);
