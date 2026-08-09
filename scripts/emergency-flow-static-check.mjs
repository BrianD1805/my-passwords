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
  if (condition) {
    console.log(`PASS  ${name}`);
    passed += 1;
  } else {
    console.error(`FAIL  ${name}`);
    failed += 1;
  }
}

check('Ver-0.054 version is aligned', pkg.version === '0.0.54' && /Password-Encrypt Ver-0\.054/.test(main) && /my-passwords-v0\.054/.test(read('public/sw.js')));
check('Trusted Person UI presents one current-stage card', /emergencyCurrentStage/.test(main) && /Current stage & actions/.test(main) && /emergency-current-stage-card/.test(main));
check('Trusted Person actions use one dropdown selector', /placeholder="Choose an action"/.test(main) && /options=\{emergencyActionOptions\}/.test(main) && !/<div className="emergency-invite-action-row/.test(main));
check('Trusted person details have their own Save button', /Save trusted person/.test(main) && /Trusted person details saved\./.test(main));
check('Emergency package has its own Save button', /Save emergency package/.test(main) && /Emergency package saved and protected\./.test(main));
check('Optional event-history accordion shows dated flow events', /<strong>Event history<\/strong>/.test(main) && /new Date\(event\.occurredAt\)\.toLocaleString\(\)/.test(main));
check('Flow events are stored as metadata-only invitation history', /flow_events/.test(flow) && /slice\(0, 120\)/.test(flow) && /buildEmergencyFlowEvents/.test(flow));
check('Reset to zero removes current invitation/request flow and audit source', /reset_zero/.test(main) && /resetEmergencyFlowToZero/.test(invite) && /deleteRow\('emergency_access_invitations'/.test(flow) && /deleteRow\('emergency_requests'/.test(flow) && /deleteRow\('emergency_users'/.test(flow));
check('Reset to zero removes local encrypted Trusted Person plan metadata', /items\.filter\(\(item\) => !isEmergencyAccessMetaItem\(item\)\)/.test(main) && /setEmergencyFlowEvents\(\[\]\)/.test(main));
check('Invitation email explains nomination stage and what happens next', /Stage 1/.test(invite) && /waiting period/i.test(invite) && /Nothing from the vault/i.test(invite));
check('Accepted-stage email explains no vault release and request link', /Stage 2 complete/.test(response) && /No vault/i.test(response) && /Request Access/i.test(response));
check('Waiting-period owner email explains cancellation and no release yet', /waiting period started/i.test(request) && /No vault/i.test(request) && /cancel/i.test(request));
check('Final release email clearly identifies final stage', /Final stage/i.test(release) && /emergency package ready/i.test(release));
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
