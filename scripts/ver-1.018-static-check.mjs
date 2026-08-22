import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const main = read('src/main.jsx');
const db = read('netlify/functions/_db.js');
const sw = read('public/sw.js');
const offline = read('public/offline.html');
const admin = read('src/AdminApp.jsx');
const pkg = JSON.parse(read('package.json'));
const pkgLock = JSON.parse(read('package-lock.json'));

let failures = 0;
let checks = 0;
function check(name, condition) {
  checks += 1;
  if (condition) console.log(`PASS  ${name}`);
  else { failures += 1; console.error(`FAIL  ${name}`); }
}

check('Ver-1.018 versions align', pkg.version === '1.18.0' && pkgLock.version === '1.18.0' && /Password-Encrypt Ver-1\.018/.test(main) && /Password-Encrypt Ver-1\.018/.test(db) && /my-passwords-v1\.018/.test(sw) && /Password-Encrypt Ver-1\.018/.test(offline) && /Ver-1\.018/.test(admin));
check('Onboarding Step 14 still offers Start tour', /step === 14[\s\S]*?Start tour/.test(main) && /finishGuidedTourOnboarding\('start'\)/.test(main));
check('Step 14 Start tour opens the vault then starts the overlay', /openVaultAfterFinalOnboarding\(\{ startTour: true \}\)/.test(main) && /if \(startTour\) window\.setTimeout\(\(\) => startGuidedTour\(\), 80\)/.test(main));
check('Guided Tour welcome popup has been removed from the vault code', !/function GuidedTourWelcomeModal/.test(main) && !/<GuidedTourWelcomeModal[\s>]/.test(main));
check('Startup status loader never auto-opens Guided Tour popup', !/setGuidedTourPromptOpen\(true\)/.test(main));
check('Delayed Guided Tour auto-offer logic has been removed', !/GUIDED_TOUR_LATER_DELAY_MS/.test(main) && !/guidedTourAutoOfferPending/.test(main) && !/laterReady/.test(main));
check('Help section still provides manual Guided Tour', /Take the guided tour/.test(main) && /onClick=\{\(\) => startGuidedTour\(\{ manual: true \}\)\}/.test(main));
check('Guided Tour status still loads for persistence/default-folder logic', /fetch\('\/.netlify\/functions\/guided-tour'/.test(main) && /setGuidedTourState\(nextState\)/.test(main));
check('Push prompt no longer waits for obsolete Guided Tour auto-offer', !/guidedTourAutoOfferPending/.test(main));
check('No database migration is required by this build', !fs.readdirSync(path.join(root, 'db/migrations')).some((name) => /1[_-]018/i.test(name)));

if (failures) {
  console.error(`\n${failures} Ver-1.018 check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks}/${checks} Ver-1.018 Guided Tour popup checks passed.`);
