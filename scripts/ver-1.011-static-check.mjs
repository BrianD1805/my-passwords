import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const main = read('src/main.jsx');
const css = read('src/styles.css');
const bootstrap = read('netlify/functions/bootstrap-admin.js');
const db = read('netlify/functions/_db.js');
const sw = read('public/sw.js');
const offline = read('public/offline.html');
const pkg = JSON.parse(read('package.json'));
const pkgLock = JSON.parse(read('package-lock.json'));
let failures = 0;
let checks = 0;
function check(label, condition) {
  checks += 1;
  if (condition) console.log(`PASS  ${label}`);
  else { failures += 1; console.error(`FAIL  ${label}`); }
}

check('Ver-1.011 versions align', pkg.version === '1.11.0' && pkgLock.version === '1.11.0' && /Password-Encrypt Ver-1\.011/.test(main) && /Password-Encrypt Ver-1\.011/.test(db) && /my-passwords-v1\.011/.test(sw) && /Password-Encrypt Ver-1\.011/.test(offline));
check('Onboarding is now twelve steps', /ONBOARDING_TOTAL_STEPS = 12/.test(main) && /Step 12 of \{ONBOARDING_TOTAL_STEPS\}/.test(main));
check('Normal onboarding no longer contains a plan-choice step', !/onboarding-plan-step/.test(main) && !/step === 4[\s\S]{0,800}Choose your plan/.test(main));
check('Normal free trial defaults to Personal plan', /DEFAULT_TRIAL_PLAN_CODE = 'personal'/.test(main) && /requestedPlanCode \|\| DEFAULT_TRIAL_PLAN_CODE/.test(main));
check('Generic Start free trial does not pass a plan code', /onClick=\{\(\) => openCreateAccountPopup\(\)\}/.test(main));
check('Landing plan cards deliberately pass their plan code', /onClick=\{\(\) => openCreateAccountPopup\(plan\.code\)\}/.test(main));
check('Client records whether plan came from a landing plan card', /planSelectionSource/.test(main) && /landing_plan_card/.test(main) && /default_trial/.test(main));
check('Server silently forces generic trials to Personal', /planSelectionSource === 'landing_plan_card'/.test(bootstrap) && /: 'personal';/.test(bootstrap));
check('Server only honours requested plan for explicit landing-plan selection', /planSelectionSource === 'landing_plan_card'[\s\S]{0,180}requestedPlan\(body\.planCode/.test(bootstrap));
check('Previous device/setup state opens a first-party reset popup', /function OnboardingResetModal/.test(main) && /Previous setup found/.test(main) && /onboardingResetModal/.test(main));
check('Previous setup detection covers saved flow, pending signup, stored account, local vault and live session', /savedFlow\?\.active \|\| pendingOnboarding \|\| storedIdentity \|\| localVaultPresent \|\| customerSession\.authenticated/.test(main));
check('User can resume a valid current onboarding flow', /Continue previous onboarding/.test(main) && /resumePreviousOnboarding/.test(main) && /flowVersion/.test(main));
check('User with an existing local vault can retry installation without clearing it', /Retry the app installation/.test(main) && /window\.location\.assign\('\/vault\?entry=install'\)/.test(main));
check('Fresh onboarding warns before removing an existing local encrypted vault', /Starting fresh removes the encrypted vault copy stored in this browser/.test(main) && /local-only contents cannot be recovered/.test(main));
check('Fresh reset ends the old server session before clearing local identity', /fetch\('\/.netlify\/functions\/session-status'/.test(main) && /action: 'logout'/.test(main));
check('Fresh reset clears Password-Encrypt local state selectively rather than all localStorage', /localStorage\.removeItem\(key\)/.test(main) && !/localStorage\.clear\(\)/.test(main));
check('Fresh reset clears stale Password-Encrypt caches', /clearPasswordEncryptCaches/.test(main) && /window\.caches\.delete/.test(main));
check('Fresh reset clears saved onboarding and pending signup state', /clearPendingOnboardingAccount\(\)/.test(main) && /clearOnboardingFlowState\(\)/.test(main));
check('Fresh onboarding reload uses an explicit one-shot query marker', /FRESH_ONBOARDING_QUERY_KEY = 'freshOnboarding'/.test(main) && /params\.set\(FRESH_ONBOARDING_QUERY_KEY, '1'\)/.test(main));
check('Explicit landing-plan choice survives a fresh reset', /if \(requestedPlanCode\) params\.set\('plan', requestedPlanCode\)/.test(main));
check('Saved onboarding flow is version-gated so stale flow shapes are not auto-opened', /ONBOARDING_FLOW_VERSION = 2/.test(main) && /Number\(initialOnboardingFlowRef\.current\?\.flowVersion \|\| 0\) === ONBOARDING_FLOW_VERSION/.test(main));
check('Reset popup follows Password-Encrypt popup layout', /item-popup-layer onboarding-reset-popup-layer/.test(main) && /item-popup-header/.test(main) && /item-popup-footer onboarding-reset-popup-footer/.test(main));
check('Reset popup has mobile-safe styling', /onboarding-reset-popup-card/.test(css) && /width: calc\(100vw - 50px\)/.test(css));
check('Plan-selection source is included in signup audit metadata', /plan_selection_source: planSelectionSource/.test(bootstrap));

if (failures) {
  console.error(`\n${failures} Ver-1.011 check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks}/${checks} Ver-1.011 Session Clear and Trial Onboarding checks passed.`);
