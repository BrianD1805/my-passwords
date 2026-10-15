import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const main = fs.readFileSync(path.join(root, 'src/main.jsx'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
const checks = [];

function check(name, fn) {
  try {
    fn();
    checks.push({ name, pass: true });
  } catch (error) {
    checks.push({ name, pass: false, error });
  }
}

const settingsStepsStart = main.indexOf('const SETTINGS_GUIDED_TOUR_STEPS = [');
const settingsStepsEnd = main.indexOf('function guidedTourSteps', settingsStepsStart);
const settingsSteps = main.slice(settingsStepsStart, settingsStepsEnd);
const directoryTargets = [
  'directory-account',
  'directory-user-settings',
  'directory-subscription',
  'directory-safety',
  'directory-notifications',
  'directory-install',
  'directory-backup-codes',
  'directory-emergency-nominate',
  'directory-emergency-receive',
  'directory-settings-tour',
  'directory-faq'
];
const disclosureTargets = [
  'account-overview',
  'account-contacts',
  'account-devices',
  'account-profile',
  'account-delete',
  'account-secure-unlock',
  'subscription-overview',
  'subscription-usage',
  'subscription-options',
  'subscription-payments',
  'safety-status',
  'safety-backup',
  'safety-recovery',
  'emergency-history',
  'emergency-manage'
];

check('Settings has a separate tour with comprehensive steps', () => {
  assert.ok(settingsStepsStart > 0);
  assert.equal((settingsSteps.match(/chapter:/g) || []).length, 35);
  assert.equal((settingsSteps.match(/title:/g) || []).length, 35);
  assert.equal((settingsSteps.match(/body:/g) || []).length, 35);
});

check('every Settings directory choice is covered', () => {
  for (const target of directoryTargets) {
    assert.ok(settingsSteps.includes(`data-settings-tour="${target}"`), `missing tour step ${target}`);
    assert.ok(main.includes(`data-settings-tour="${target}"`), `missing directory target ${target}`);
  }
});

check('every internal Settings disclosure is covered and openable', () => {
  for (const target of disclosureTargets) {
    assert.ok(settingsSteps.includes(`disclosure: '${target}'`), `missing disclosure step ${target}`);
    assert.ok(main.includes(`data-settings-tour-disclosure="${target}"`), `missing disclosure target ${target}`);
  }
});

check('all main Settings pages receive plain-language detail coverage', () => {
  for (const section of ['overview', 'account', 'user-settings', 'subscription', 'safety', 'notifications', 'install', 'backup-codes', 'emergency-nominate', 'emergency-receive', 'faq']) {
    assert.ok(settingsSteps.includes(`section: '${section}'`), `missing section ${section}`);
  }
  for (const target of ['user-password-reminder', 'user-date-format', 'notifications-content', 'install-content', 'backup-codes-content', 'emergency-flow', 'emergency-receive-content', 'faq-content']) {
    assert.ok(main.includes(`data-settings-tour="${target}"`), `missing content target ${target}`);
  }
});

check('Settings tour automatically moves between pages and opens one disclosure', () => {
  assert.match(main, /guidedTour\.kind !== 'settings'/);
  assert.match(main, /setActivePage\('settings'\)/);
  assert.match(main, /setActiveSettingsSection\(step\.section\)/);
  assert.match(main, /node\.open = Boolean\(step\.disclosure && node\.dataset\.settingsTourDisclosure === step\.disclosure\)/);
});

check('tour preparation never triggers a Settings action', () => {
  const preparationStart = main.indexOf("if (!guidedTour.active || guidedTour.kind !== 'settings')");
  const preparationEnd = main.indexOf('useEffect(() => {', preparationStart + 20);
  const preparation = main.slice(preparationStart, preparationEnd);
  assert.equal(/save|delete|remove|enable|disable|generate|sendEmergency/i.test(preparation), false);
});

check('Settings tour is manually available and does not replace the vault tour', () => {
  assert.match(main, /<strong>Take the Settings tour<\/strong>/);
  assert.match(main, /onClick=\{startSettingsGuidedTour\}/);
  assert.match(main, /<strong>Take the guided tour<\/strong>/);
  assert.match(main, /startGuidedTour\(\{ manual: true \}\)/);
});

check('Settings completion stays separate from onboarding tour persistence', () => {
  assert.match(main, /if \(finishedKind === 'settings'\) \{[\s\S]*?return;[\s\S]*?\}\s*await saveGuidedTourStatus\(status\)/);
  assert.match(main, /Settings tour complete\. You can run it again from Settings at any time\./);
});

check('existing guided-tour look, navigation and mobile fallback are reused', () => {
  assert.match(main, /function GuidedTourOverlay\(\{ active, kind,/);
  assert.match(main, /guidedTourSteps\(kind\)/);
  assert.match(main, /This control is not visible at this screen size/);
  assert.match(styles, /\.guided-tour-layer\s*\{/);
  assert.match(styles, /\.guided-tour-card\s*\{/);
  assert.match(styles, /\.guided-tour-spotlight\s*\{/);
});

check('highlight uses one even outline instead of overlapping target rings', () => {
  assert.equal(main.includes("target.classList.add('guided-tour-target')"), false);
  assert.match(styles, /\.guided-tour-spotlight\s*\{[\s\S]*?border:\s*2px solid rgba\(255,255,255,0\.94\)/);
  assert.match(styles, /0 0 0 6px rgba\(49,93,126,0\.58\)/);
});

check('Settings introduction describes the English tour without language claims', () => {
  assert.match(settingsSteps, /This tour clearly explains every Settings section\./);
  assert.equal(/everyday language|all languages/i.test(settingsSteps.slice(0, settingsSteps.indexOf("title: 'My Account'"))), false);
});

const failed = checks.filter((item) => !item.pass);
for (const item of checks) {
  console.log(`${item.pass ? 'PASS' : 'FAIL'}  ${item.name}`);
  if (!item.pass) console.error(`      ${item.error.message}`);
}
if (failed.length) {
  console.error(`\n${failed.length} Settings guided-tour regression check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} Settings guided-tour regression checks passed.`);
