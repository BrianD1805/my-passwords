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

check('Ver-1.004.01 package and service-worker versions align', pkg.version === '1.4.1' && /Password-Encrypt Ver-1\.004\.01/.test(main) && /my-passwords-v1\.004\.01/.test(sw));
check('Founder Plan Subscription overview shows current vault item total', /Founder access and current account usage/.test(main) && /Total vault items/.test(main) && /entitlements\?\.usage\?\.vaultItems/.test(main));
check('Founder Plan Subscription overview shows document count and storage MB without limits', /Encrypted documents/.test(main) && /Account storage used/.test(main) && /usedStorageMb\.toFixed\(2\).*MB/.test(main) && /does not expire, has no plan limits/.test(main));
check('Vault home favourite summary is a clickable button', /summary-action favourite-summary-pill/.test(main) && /Show all favourite items/.test(main) && /openVaultSection\(FAVOURITES_VIEW\)/.test(main));
check('Favourites view filters all visible vault items by favourite flag', /FAVOURITES_VIEW = '__favourites__'/.test(main) && /category === FAVOURITES_VIEW \? Boolean\(item\.favourite\)/.test(main));
check('Adding from favourites view falls back to a normal vault category', /!\['All', FAVOURITES_VIEW\]\.includes\(category\)/.test(main));
check('Stored-document popup includes Share beside the Documents pill', /category-pill document-share-pill/.test(main) && /<Share2 size=\{14\}/.test(main) && /shareStoredDocument\(viewedItem\)/.test(main));
check('Document share loads and decrypts the real stored file before invoking Web Share', /loadStoredDocumentDataUrl\(item\)/.test(main) && /new File\(\[bytes\]/.test(main) && /navigator\.share\(\{ files: \[shareFile\]/.test(main));
check('Document sharing checks file-share support and has a safe fallback', /navigator\.canShare/.test(main) && /Use Download instead/.test(main) && /AbortError/.test(main));
check('Founder usage, favourites and document sharing have responsive styling', /founder-usage-grid/.test(styles) && /favourite-summary-pill\.active/.test(styles) && /document-share-pill/.test(styles) && /@media \(max-width: 700px\)[\s\S]*?founder-usage-grid \{ grid-template-columns: 1fr; \}/.test(styles));

check('Emergency release removes the two obsolete waiting-period messages', !/This secure page is used after the waiting period has ended/.test(main) && !/The waiting period has ended\. The owner-prepared emergency package is ready if it has been saved\./.test(main));
check('Emergency release identifies the package owner by name', /This is the prepared release package that \${emergencyReleasePackage\?\.ownerName/.test(main) && /prepared for you\. Download it below\./.test(main));
check('Emergency release download actions are moved directly beneath ready message', /Emergency package ready/.test(main) && /emergency-package-download-card emergency-package-download-card-top/.test(main) && /Download full ZIP/.test(main));
check('Emergency release has ZIP extraction instructions', /How to open the full ZIP download/.test(main) && /Extract All/.test(main) && /Uncompress/.test(main));
check('Emergency release groups records into independent expandable folders', /buildEmergencyReleaseFolders/.test(main) && /<details className=\"emergency-release-folder\"/.test(main) && /emergency-release-folder-body/.test(main));
check('Documents folder is inserted first before sorted A-Z and numeric folder names', /name: DOCUMENTS_CATEGORY/.test(main) && /sortEmergencyFolderNames/.test(main) && /\^\[A-Za-z\]\$/.test(main) && /\^\[0-9\]\$/.test(main));
check('Full ZIP download works even when no released documents are present', /async function downloadEmergencyPackageZip/.test(main) && !/if \(!releasedDocuments\.length\) return/.test(main) && /Password-Encrypt-Emergency-Package\.zip/.test(main));

check('Mobile emergency release page uses 5px outer horizontal spacing and white background', /public-landing-page\.emergency-invite-page[\s\S]*padding:\s*12px 5px 22px[\s\S]*background:\s*#fff/.test(styles));
check('Mobile emergency release card and request content use 5px horizontal padding', /emergency-invite-page \.emergency-invite-card[\s\S]*padding:\s*18px 5px 20px/.test(styles) && /emergency-invite-page \.emergency-request-card[\s\S]*padding:\s*12px 5px/.test(styles));
check('Mobile released package viewer and folder body use 5px content padding', /emergency-invite-page \.emergency-package-viewer[\s\S]*padding:\s*5px/.test(styles) && /emergency-invite-page \.emergency-release-folder-body[\s\S]*padding:\s*5px/.test(styles));

check('Mobile Full Vault header has extra breathing room above and below', /emergency-invite-page \.emergency-package-viewer-head \{[\s\S]*?padding:\s*8px 3px 14px/.test(styles));
check('Mobile owner Full Access note has added spacing before the text block', /emergency-release-owner-note/.test(main) && /emergency-invite-page \.emergency-release-owner-note \{[\s\S]*?margin-top:\s*10px;[\s\S]*?padding-top:\s*4px/.test(styles));
check('Mobile Emergency Package footer centers copyright and Open My Vault', /emergency-invite-page \.emergency-invite-footer \{[\s\S]*?align-items:\s*center !important;[\s\S]*?justify-content:\s*center !important;[\s\S]*?text-align:\s*center !important/.test(styles) && /emergency-invite-footer span,[\s\S]*?emergency-invite-footer button[\s\S]*?text-align:\s*center/.test(styles));


check('Emergency Package source fingerprint is generated client-side', /buildEmergencyPackageSourceFingerprint/.test(main) && /sha256Hex/.test(main));
check('Vault saves schedule automatic Emergency Package maintenance', /scheduleEmergencyPackageMaintenance\(nextItems/.test(main) && /emergencyRefreshReason/.test(main));
check('Unlock or reconnect schedules Emergency Package refresh', /vault_open_or_online/.test(main));
check('Cloud restores schedule Emergency Package refresh', /cloud_restore/.test(main));
check('Emergency documents use source fingerprints to avoid unnecessary re-encryption', /buildEmergencyDocumentSourceFingerprint/.test(main) && /alreadyCurrent/.test(main));
check('Emergency document inventory supports freshness checks', /action: 'inventory'/.test(main) && /action === 'inventory'/.test(read('netlify/functions/emergency-access-document.js')));
check('Released Emergency Package is frozen server-side', /EMERGENCY_PACKAGE_FROZEN/.test(read('netlify/functions/emergency-access-invite.js')) && /packageFrozen/.test(read('netlify/functions/emergency-access-document.js')));
check('Automatic package refresh avoids duplicate package writes', /existingFingerprint === sourceFingerprint/.test(read('netlify/functions/emergency-access-invite.js')) && /unchanged: true/.test(read('netlify/functions/emergency-access-invite.js')));
check('Automatic package refresh does not flood flow audit events', /automaticRefresh/.test(read('netlify/functions/emergency-access-invite.js')));
check('Owner status exposes package freshness before release', /packageSummary: invitation\.metadata\?\.emergency_package_summary \|\| null/.test(read('netlify/functions/emergency-access-invite.js')));
check('Trusted Person settings explain automatic package freshness', /Prepared package stays up to date automatically/.test(main) && /The package is frozen when the waiting period completes/.test(main));
check('Emergency Access FAQ explains latest-vault behavior', /Will my trusted person receive the latest version of my vault\?/.test(main));
check('Emergency Access legal text explains refresh and frozen release snapshot', /latest successfully prepared package is frozen as the release snapshot/.test(read('src/LegalPages.jsx')));

check('Emergency stage saves collapse cleanly and keep the next stage visible', /nextStageId = section === 'trusted_person' \? 'emergency-stage-2' : section === 'package' \? 'emergency-stage-3'/.test(main) && /scrollIntoView\?\.\(\{ behavior: 'auto', block: 'nearest' \}\)/.test(main) && /settings-emergency-panel \.emergency-flow-roadmap[\s\S]*overflow-anchor:\s*none/.test(styles));
check('Push activation prompt offers Decide later, device suppression and activation choices', /Decide later/.test(main) && /Don't show again/.test(main) && /Activate notifications/.test(main) && /PUSH_PROMPT_SUPPRESSION_KEY/.test(main));
check('Push prompt suppression is remembered per account and device', /pushPromptSuppressionKey/.test(main) && /getSyncDeviceId\(\)/.test(main) && /isPushActivationPromptSuppressed\(customerSession\)/.test(main) && /suppressPushActivationPrompt\(customerSession\)/.test(main));
check('Verify-device popup no longer shows the redundant Email selector', !/device-verification-channel-switch email-only-verification/.test(main) && /device-verification-email-card/.test(main));
check('Emergency Stage 2 does not directly open device verification', (() => { const start = main.indexOf('async function saveEmergencyAccessPlan'); const end = main.indexOf('async function prepareEmergencyReleasedDocuments', start); return start >= 0 && end > start && !/openDeviceVerification\(/.test(main.slice(start, end)); })());
check('Trusted person nomination page includes Password-Encrypt information and landing-page link below FAQs', /emergencyStep === 'invite'[\s\S]*emergency-invite-about-card/.test(main) && /Learn more about Password-Encrypt/.test(main) && main.includes('href="/"'));
check('Admin customer status badges use a fixed aligned column', /admin-customer-directory-status \{[\s\S]*width:\s*190px;[\s\S]*justify-items:\s*start;[\s\S]*justify-self:\s*end/.test(styles) && /grid-template-columns:[^;]*190px auto/.test(styles));

if (failed) {
  console.error(`\n${failed} Ver-1.004.01 feature check(s) failed; ${passed} passed.`);
  process.exit(1);
}
console.log(`\nAll ${passed} Ver-1.004.01 feature checks passed.`);
