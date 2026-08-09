import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const main = read('src/main.jsx');
const admin = read('src/AdminCustomerDetail.jsx');
const invite = read('netlify/functions/emergency-access-invite.js');
const request = read('netlify/functions/emergency-access-request.js');
const response = read('netlify/functions/emergency-access-response.js');
const release = read('netlify/functions/emergency-access-release-process.js');
const flow = read('netlify/functions/_emergency-flow.js');
const detail = read('netlify/functions/admin-customer-detail.js');
const adminEmail = read('netlify/functions/_admin-email.js');
const pkg = JSON.parse(read('package.json'));

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { console.log(`PASS  ${name}`); passed += 1; }
  else { console.error(`FAIL  ${name}`); failed += 1; }
}

check('Ver-0.054A version is aligned', pkg.version === '0.0.54-a' && /Password-Encrypt Ver-0\.054A/.test(main) && /my-passwords-v0\.054A/.test(read('public/sw.js')));
check('Current Trusted Person stage is visible at a glance', /emergency-current-stage-glance/.test(main) && /emergencyCurrentStage\.step/.test(main) && /emergencyCurrentStage\.title/.test(main));
check('Trusted Person actions remain in one dropdown selector', /<strong>Actions<\/strong>/.test(main) && /placeholder="Choose an action"/.test(main) && /options=\{emergencyActionOptions\}/.test(main));
check('Trusted person details have their own Save button', /Save trusted person/.test(main) && /Trusted person details saved\./.test(main));
check('Emergency package has its own Save button', /Save emergency package/.test(main) && /Emergency package saved and protected\./.test(main));
check('Optional event-history accordion shows dated flow events', /<strong>Event history<\/strong>/.test(main) && /new Date\(event\.occurredAt\)\.toLocaleString\(\)/.test(main));
check('Flow events remain metadata-only invitation history', /flow_events/.test(flow) && /slice\(0, 120\)/.test(flow) && /buildEmergencyFlowEvents/.test(flow));
check('Reset to zero removes current flow and audit source', /reset_zero/.test(main) && /resetEmergencyFlowToZero/.test(invite) && /deleteRow\('emergency_access_invitations'/.test(flow));
check('Reset to zero removes local encrypted Trusted Person plan metadata', /items\.filter\(\(item\) => !isEmergencyAccessMetaItem\(item\)\)/.test(main) && /setEmergencyFlowEvents\(\[\]\)/.test(main));
check('Stage 1 recipient email has no internal stage label', /You've been chosen as a trusted person for Password-Encrypt/.test(invite) && !/Stage 1/.test(invite));
check('Stage 1 email explains Password-Encrypt and identifies owner', /secure encrypted vault used to store important private information/.test(invite) && /The person who selected you/.test(invite) && /owner_email/.test(invite) && /owner_phone/.test(invite));
check('Stage 1 email includes public landing-page link', /Learn more about Password-Encrypt/.test(invite) && /publicLandingUrlFromLink/.test(invite));
check('Accepted invitation page is confirmation-only', /acceptedInvitePage/.test(main) && /\(isRequestStep \|\| isOpenStep\)/.test(main) && /A separate secure Request Emergency Access link has been emailed/.test(main));
check('Stage 2 email is searchable and has no internal numbering', /Password-Encrypt Emergency Access — Keep this link safe/.test(response) && /Keep this email somewhere safe/.test(response) && !/Stage 2/.test(response));
check('Stage 2 resend email uses the same searchable subject', /Password-Encrypt Emergency Access — Keep this link safe/.test(invite) && /You may not need it for a long time/.test(invite));
check('Waiting-period owner email explains cancellation and no release yet', /waiting period started/i.test(request) && /No vault/i.test(request) && /cancel/i.test(request));
check('Release email removes internal final-stage wording', /Password-Encrypt Emergency Access — Your emergency package is ready/.test(release) && !/Final stage/.test(release));
check('Release email explains the 30-day availability window', /this link is available for 30 days/i.test(release) && /Secure link available until/.test(release));
check('Release-ready requests store a 30-day expiry', /EMERGENCY_PACKAGE_ACCESS_MS = 30/.test(request) && /release_expires_at/.test(request) && /release_expires_at/.test(release));
check('Expired final links are rejected server-side', /EMERGENCY_PACKAGE_EXPIRED/.test(request) && /expired 30 days after the package became available/.test(request));
check('Final package page shows expiry and focused FAQ before package', /This secure link is available for 30 days/.test(main) && /emergency-final-qa/.test(main) && /How long will this link work\?/.test(main));
check('Stale FAQ is hidden after final package release', /!\(isOpenStep && emergencyRequestState\.status === 'release-ready'\)/.test(main));
check('Released records are sorted alphanumerically', /sortEmergencyReleasedItems/.test(main) && /localeCompare\(titleB/.test(main));
check('Emergency package supports TXT download', /downloadEmergencyText/.test(main) && /Download TXT/.test(main));
check('Emergency package supports DOCX download without external package', /downloadEmergencyDocx/.test(main) && /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/.test(main) && /Download DOCX/.test(main));
check('Downloaded package warns that exported data is readable and sensitive', /Downloaded files contain sensitive information in readable form/.test(main));
check('Admin customer detail includes explicit permanent-delete action', /hard_delete_account/.test(admin) && /Delete account permanently/.test(admin) && /confirmText: 'DELETE'/.test(admin));
check('Admin hard delete blocks Founder account and safely ends active Stripe subscription', /Founder account cannot be hard deleted/.test(detail) && /stripeRequest\(`subscriptions\//.test(detail) && /method: 'DELETE'/.test(detail));
check('Admin hard delete removes tenant and tenant-scoped residual rows', /deleteRow\('tenants'/.test(detail) && /stripe_reconciliation_runs/.test(detail) && /operational_events/.test(detail));
check('Deleted-account email exists and gives no deletion reason', /account_deleted/.test(adminEmail) && /account has been deleted/i.test(adminEmail) && !/reason for deletion/i.test(adminEmail));
check('Hard-delete audit does not retain deleted tenant id', /admin_customer_hard_deleted/.test(detail) && /A customer account was permanently deleted from Admin for testing/.test(detail));

if (failed) {
  console.error(`\n${failed} Trusted Person / emergency-flow static check(s) failed; ${passed} passed.`);
  process.exit(1);
}
console.log(`\nAll ${passed} Trusted Person / emergency-flow static checks passed.`);
