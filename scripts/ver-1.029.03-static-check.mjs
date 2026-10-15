import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const main = read('src/main.jsx');
const styles = read('src/styles.css');
const retryPolicy = read('src/syncRetryPolicy.js');
const syncFunction = read('netlify/functions/sync-vault.js');
const clientErrorFunction = read('netlify/functions/client-error-report.js');
const db = read('netlify/functions/_db.js');
const sw = read('public/sw.js');
const offline = read('public/offline.html');
const pkg = JSON.parse(read('package.json'));
const brandLogo = fs.readFileSync(path.join(root, 'public/images/password-encrypt-brand.png'));
const tourLocatorStart = main.indexOf('const preferredTargetTop = window.innerWidth <= 860 ? 70 : 88');
const tourLocator = main.slice(tourLocatorStart - 500, tourLocatorStart + 900);

const checks = [
  ['version aligned', pkg.version === '1.29.3' && main.includes('Password-Encrypt Ver-1.029.03') && db.includes('Password-Encrypt Ver-1.029.03') && sw.includes('my-passwords-v1.029.03') && offline.includes('Password-Encrypt Ver-1.029.03')],
  ['brand logo is a complete PNG rather than a truncated partial image', brandLogo.length === 25728 && brandLogo.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && brandLogo.subarray(-12).equals(Buffer.from([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]))],
  ['Settings introduction has no language claim', main.includes('This tour clearly explains every Settings section.') && !main.includes('This tour explains every Settings section in everyday language.')],
  ['duplicate target outline is not activated', !main.includes("target.classList.add('guided-tour-target')")],
  ['spotlight outline is even and softer', /\.guided-tour-spotlight\s*\{[\s\S]*?border:\s*2px solid rgba\(255,255,255,0\.94\)/.test(styles) && /0 0 0 6px rgba\(49,93,126,0\.58\)/.test(styles) && /0 0 0 9999px rgba\(11,24,38,0\.5\)/.test(styles)],
  ['tour target is positioned near the top', main.includes('const preferredTargetTop = window.innerWidth <= 860 ? 70 : 88') && main.includes("window.scrollBy({ top: rect.top - preferredTargetTop, left: 0, behavior: 'smooth' })") && !tourLocator.includes("block: 'center'")],
  ['card is anchored below the measured highlight', main.includes('targetRect.top + targetRect.height + cardGap') && main.includes("'--guided-tour-card-top': `${cardTop}px`") && /\.guided-tour-target-layout \.guided-tour-card\s*\{[\s\S]*?top: var\(--guided-tour-card-top\)/.test(styles)],
  ['desktop and mobile use an intentional gap', main.includes('window.innerWidth <= 860 ? 18 : 24') && /max-height: calc\(100dvh - var\(--guided-tour-card-top\) - 18px\)/.test(styles) && /max-height: calc\(100dvh - var\(--guided-tour-card-top\) - 12px\)/.test(styles)],
  ['temporary tour scroll room is scoped and removable', main.includes("document.body.classList.add('guided-tour-active')") && main.includes("document.body.classList.remove('guided-tour-active')") && styles.includes('body.guided-tour-active #root')],
  ['separate Settings tour remains present', main.includes('const SETTINGS_GUIDED_TOUR_STEPS = [') && main.includes("kind: 'settings'") && main.includes('function startSettingsGuidedTour()')],
  ['Settings tour retains complete guided content', (main.slice(main.indexOf('const SETTINGS_GUIDED_TOUR_STEPS'), main.indexOf('function guidedTourSteps')).match(/chapter:/g) || []).length === 35],
  ['all Settings routes remain covered', ['overview', 'account', 'user-settings', 'subscription', 'safety', 'notifications', 'install', 'backup-codes', 'emergency-nominate', 'emergency-receive', 'faq'].every((section) => main.includes(`section: '${section}'`))],
  ['Settings disclosures still open automatically', main.includes("document.querySelectorAll('[data-settings-tour-disclosure]')") && main.includes('node.dataset.settingsTourDisclosure === step.disclosure')],
  ['both guided tours remain independently available', main.includes('<strong>Take the Settings tour</strong>') && main.includes('<strong>Take the guided tour</strong>')],
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
console.log(`\n${checks.length - failed}/${checks.length} Ver-1.029.03 checks passed.`);
if (failed) process.exit(1);
