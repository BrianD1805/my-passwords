import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const main = read('src/main.jsx');
const retryPolicy = read('src/syncRetryPolicy.js');
const syncFunction = read('netlify/functions/sync-vault.js');
const clientErrorFunction = read('netlify/functions/client-error-report.js');
const db = read('netlify/functions/_db.js');
const sw = read('public/sw.js');
const offline = read('public/offline.html');
const pkg = JSON.parse(read('package.json'));

const checks = [
  ['version aligned', pkg.version === '1.29.0' && main.includes('Password-Encrypt Ver-1.029') && db.includes('Password-Encrypt Ver-1.029') && sw.includes('my-passwords-v1.029') && offline.includes('Password-Encrypt Ver-1.029')],
  ['separate Settings tour is present', main.includes('const SETTINGS_GUIDED_TOUR_STEPS = [') && main.includes("kind: 'settings'") && main.includes('function startSettingsGuidedTour()')],
  ['Settings tour has complete guided content', (main.slice(main.indexOf('const SETTINGS_GUIDED_TOUR_STEPS'), main.indexOf('function guidedTourSteps')).match(/chapter:/g) || []).length === 35],
  ['all Settings routes are covered', ['overview', 'account', 'user-settings', 'subscription', 'safety', 'notifications', 'install', 'backup-codes', 'emergency-nominate', 'emergency-receive', 'faq'].every((section) => main.includes(`section: '${section}'`))],
  ['Settings disclosures open automatically', main.includes("document.querySelectorAll('[data-settings-tour-disclosure]')") && main.includes('node.dataset.settingsTourDisclosure === step.disclosure')],
  ['Settings tour can be started again', main.includes('<strong>Take the Settings tour</strong>') && main.includes('onClick={startSettingsGuidedTour}')],
  ['vault tour remains independently available', main.includes('<strong>Take the guided tour</strong>') && main.includes("kind: 'vault'")],
  ['stale Saving state remains normalised', retryPolicy.includes('normalisePersistedSyncSafetyState') && retryPolicy.includes("staleBackingUp ? 'backup-pending'")],
  ['Vault Status spinner remains live-only', !main.includes("syncing || syncSafety.state === 'backing-up'") && !main.includes("state: 'backing-up'")],
  ['finite retry policy remains present', retryPolicy.includes('30 * 1000') && retryPolicy.includes('2 * 60 * 1000') && retryPolicy.includes('10 * 60 * 1000') && retryPolicy.includes('return null')],
  ['backup failure diagnostic remains deduplicated', main.includes('recordBackupFailureOnce') && (main.match(/recordSyncEvent\('backup_failed'/g) || []).length === 1],
  ['server throttles remain present', syncFunction.includes("scope: 'vault_sync_backup'") && syncFunction.includes("scope: 'vault_sync_record_event'") && clientErrorFunction.includes("scope: 'client_error_report'")],
  ['onboarding flow structure remains present', main.includes('ONBOARDING_TOTAL_STEPS = 14') && main.includes('setLandingOnboardingStep(8)') && main.includes('setFinalOnboardingStep(13)') && main.includes('step === 14')]
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} Ver-1.029 checks passed.`);
if (failed) process.exit(1);
