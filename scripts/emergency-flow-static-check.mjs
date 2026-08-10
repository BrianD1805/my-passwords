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
const reminderProcess = read('netlify/functions/trusted-person-reminder-process.js');
const reminderConfirm = read('netlify/functions/trusted-person-reminder-confirm.js');
const reminderToken = read('netlify/functions/_trusted-person-reminder-token.js');
const flow = read('netlify/functions/_emergency-flow.js');
const detail = read('netlify/functions/admin-customer-detail.js');
const adminEmail = read('netlify/functions/_admin-email.js');
const pkg = JSON.parse(read('package.json'));
const styles = read('src/styles.css');
const netlify = read('netlify.toml');

let passed = 0;
let failed = 0;
function check(name, condition) {
  if (condition) { console.log(`PASS  ${name}`); passed += 1; }
  else { console.error(`FAIL  ${name}`); failed += 1; }
}

check('Ver-0.054F version is aligned', pkg.version === '0.0.54-f' && /Password-Encrypt Ver-0\.054F/.test(main) && /my-passwords-v0\.054F/.test(read('public/sw.js')));
check('Current Trusted Person stage is visible at a glance', /emergency-current-stage-glance/.test(main) && /emergencyCurrentStage\.step/.test(main) && /emergencyCurrentStage\.title/.test(main));
check('Current stage card is explicitly marked as progress information', /emergency-current-progress-label/.test(main) && /Current progress/.test(main) && /aria-label="Trusted Person flow progress"/.test(main));
check('Serious-emergency explanation is kept inside the existing Trusted Person help section', !/emergency-help-disclosure/.test(main) && /<strong>How Emergency Access works<\/strong>/.test(main) && /Designed for serious emergencies/.test(main) && /emergency-help-inline-copy/.test(main));
check('Current stage blue rail tapers softly at both ends', /emergency-flow-stage\.current::before/.test(styles) && /linear-gradient\(180deg/.test(styles) && /rgba\(51,102,153,0\)/.test(styles) && /width: 3px/.test(styles) && !/border: 3px solid #336699/.test(styles));
check('Owner Trusted Person stage auto-checks every 30 seconds while the page is open', /setInterval\(checkCurrentEmergencyStage, 30000\)/.test(main) && /visibilitychange/.test(main) && /automatic: true/.test(main));
check('Automatic status checks only save encrypted plan metadata when the server state changed', /const statusChanged = statusFields\.some/.test(main) && /if \(statusChanged\) \{[\s\S]*?saveItems\(next/.test(main));
check('Stage 4 tells the owner acceptance is checked automatically', /This page checks automatically while open/.test(main));
check('Final package release remains on the scheduled five-minute processor', /runEmergencyAccessReleaseProcessor/.test(release) && /release_ready_email/.test(release) && /\[functions\."emergency-access-release-process"\][\s\S]*?schedule = "\*\/5 \* \* \* \*"/.test(netlify));
check('Trusted Person reminder processor runs daily and sends only when three calendar months are due', /trusted-person-reminder-process/.test(netlify) && /schedule = "15 7 \* \* \*"/.test(netlify) && /addCalendarMonths\(anchor, 3\)/.test(reminderProcess) && /status=eq.accepted/.test(reminderProcess));
check('Quarterly reminder email is searchable and asks for confirmation', /Password-Encrypt Trusted Person reminder — Please confirm/.test(reminderProcess) && /Yes, I’m still the trusted person/.test(reminderProcess) && /three-month reminder/.test(reminderProcess));
check('Trusted Person help explains the quarterly reminder without implying access', /Will my trusted person be reminded/.test(main) && /reminder every three months/.test(main) && /does not request Emergency Access or reveal any vault information/.test(main));
check('Reminder confirmation uses a signed expiring token and a second deliberate browser action', /createHmac\('sha256'/.test(reminderToken) && /timingSafeEqual/.test(reminderToken) && /TOKEN_TTL_MS = 30/.test(reminderToken) && /trusted-person-confirm/.test(main) && /confirmTrustedPersonReminder/.test(main));
check('Reminder confirmation never starts Emergency Access and is recorded in flow history', /No Emergency Access request has been started/.test(reminderConfirm) && /trusted_person_reminder_confirmed/.test(reminderConfirm) && /trusted_person_reminder_sent/.test(reminderProcess));
check('Quarterly reminders pause while an Emergency Access request is active', /status=in\.\(requested,waiting,owner_notified,release_ready\)/.test(reminderProcess) && /skippedActiveEmergency/.test(reminderProcess));
check('Desktop vault login product title is reduced by about five pixels only on desktop', /@media \(min-width: 761px\)/.test(styles) && /#vault-access-card > h1/.test(styles) && /calc\(5vw - 5px\)/.test(styles));
check('Trusted Person journey is explicitly numbered from 1 to 6', /Complete each step in order/.test(main) && /emergency-flow-step-number\">1</.test(main) && /emergency-flow-step-number\">6</.test(main));
check('Trusted person details are Step 1 with their own Save button', /Add your trusted person/.test(main) && /Save Step 1/.test(main) && /trusted_person/.test(main));
check('Emergency package is Step 2 with its own Save button', /Prepare the emergency package/.test(main) && /Save Step 2/.test(main) && /'package'/.test(main));
check('Invitation cannot be sent until Steps 1 and 2 are saved', /Complete and save Steps 1 and 2 before sending the invitation/.test(main) && /disabled=\{!emergencyTrustedPersonComplete \|\| !emergencyPackageComplete/.test(main));
check('Primary invitation action sits directly on Step 3', /<strong>Send the invitation<\/strong>/.test(main) && /Send invitation/.test(main));
check('Invitation follow-up actions sit on Step 4 dropdown', /placeholder="Invitation actions"/.test(main) && /options=\{emergencyInvitationStageOptions\}/.test(main));
check('Emergency-link actions sit on Step 5 dropdown', /placeholder="Emergency link actions"/.test(main) && /options=\{emergencyAcceptedStageOptions\}/.test(main));
check('Waiting-period actions sit on Step 6 dropdown', /placeholder="Waiting-period actions"/.test(main) && /options=\{emergencyWaitingStageOptions\}/.test(main));
check('Completed stages have a large tick status', /emergency-flow-stage-status/.test(main) && /<Check size=\{29\} strokeWidth=\{3\}/.test(main));
check('Reset to zero remains in a maintenance dropdown, not the main route', /Manage or reset this flow/.test(main) && /placeholder="Manage flow"/.test(main) && /options=\{emergencyManagementOptions\}/.test(main));
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
