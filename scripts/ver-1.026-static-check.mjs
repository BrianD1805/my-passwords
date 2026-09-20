import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const netlify = read('netlify.toml');
const emergency = read('netlify/functions/emergency-access-release-process.js');
const health = read('netlify/functions/operations-health-check.js');
const emailAdmin = read('netlify/functions/admin-automated-emails.js');
const emailAdminUi = read('src/AdminAutomatedEmails.jsx');
const main = read('src/main.jsx');
const db = read('netlify/functions/_db.js');
const sw = read('public/sw.js');
const offline = read('public/offline.html');
const pkg = JSON.parse(read('package.json'));

const checks = [
  ['version aligned', pkg.version === '1.26.0' && main.includes('Password-Encrypt Ver-1.026') && db.includes('Password-Encrypt Ver-1.026') && sw.includes('my-passwords-v1.026') && offline.includes('Password-Encrypt Ver-1.026')],
  ['Emergency Access schedule is every 15 minutes', /emergency-access-release-process"\]\n\s*schedule = "\*\/15 \* \* \* \*"/.test(netlify)],
  ['operations health schedule is every 30 minutes', /operations-health-check"\]\n\s*schedule = "\*\/30 \* \* \* \*"/.test(netlify)],
  ['account trial watchdog schedule is every four hours', /account-trial-check"\]\n\s*schedule = "0 \*\/4 \* \* \*"/.test(netlify)],
  ['customer lifecycle remains hourly', /customer-lifecycle-email-process"\]\n\s*schedule = "0 \* \* \* \*"/.test(netlify)],
  ['five daily jobs remain daily', (netlify.match(/schedule = "(?:\d{1,2} ){2}\* \* \*"/g) || []).length === 5],
  ['Emergency Access checks due work before creating a processor record', emergency.indexOf("selectRows('emergency_access_requests'") < emergency.indexOf("startProcessorRun('emergency_access_release'")],
  ['Emergency Access no-work path records a lightweight heartbeat', emergency.includes('if (!due?.length)') && emergency.includes("finishScheduledCheck(checkRun, { status: 'success', itemsChecked: 0")],
  ['Emergency Access work path retains email and push processing', emergency.includes('sendReleaseReadyEmail') && emergency.includes('sendTemplatePushToUser') && emergency.includes('release_ready_email_sent')],
  ['health monitor reads the Emergency Access heartbeat', health.includes("selectRows('scheduled_check_runs'") && health.includes("row.check_type === 'emergency_access_release'")],
  ['Emergency Access stale tolerance is 45 minutes', health.includes('45 * 60000') && health.includes('forty-five-minute window')],
  ['health monitor resolves only known open events', health.includes('openHealthEventKeys') && health.includes("event_type=in.(database_unreachable")],
  ['Admin reports the 15-minute schedule and heartbeat', emailAdmin.includes("schedule: 'Every 15 minutes'") && emailAdmin.includes('lastEmergencyCheck') && emailAdminUi.includes("'Every 15 minutes'")],
  ['onboarding flow structure remains present', main.includes('ONBOARDING_TOTAL_STEPS = 14') && main.includes('setLandingOnboardingStep(8)') && main.includes('setFinalOnboardingStep(13)') && main.includes('step === 14')]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} Ver-1.026 checks passed.`);
if (failed) process.exit(1);
