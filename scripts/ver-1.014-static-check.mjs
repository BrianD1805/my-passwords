import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const main = read('src/main.jsx');
const styles = read('src/styles.css');
const db = read('netlify/functions/_db.js');
const sw = read('public/sw.js');
const pkg = JSON.parse(read('package.json'));
const pkgLock = JSON.parse(read('package-lock.json'));
const guided = read('netlify/functions/guided-tour.js');
const signup = read('netlify/functions/bootstrap-admin.js');
const migration = read('db/migrations/2026-08-21_guided_tour_ver_1_014.sql');

let failures = 0;
let checks = 0;
function check(name, condition) {
  checks += 1;
  if (condition) console.log(`PASS  ${name}`);
  else { failures += 1; console.error(`FAIL  ${name}`); }
}

check('Ver-1.014 versions align', pkg.version === '1.14.0' && pkgLock.version === '1.14.0' && /Password-Encrypt Ver-1\.014/.test(main) && /Password-Encrypt Ver-1\.014/.test(db) && /my-passwords-v1\.014/.test(sw));
check('Guided tour has eight interactive steps', /const GUIDED_TOUR_STEPS = \[/.test(main) && (main.match(/title: '/g) || []).length >= 8);
check('Folder three-dot button is explained', /The folder three-dot button/.test(main) && /premium-more-folder-button/.test(main));
check('New accounts receive account-level tour state', /guided_tour_status: 'not_started'/.test(signup) && /guided_tour_version: 1/.test(signup));
check('Tour status uses authenticated server endpoint', /validateCustomerSession/.test(guided) && /assertBrowserAction/.test(guided) && /guided_tour_status/.test(guided));
check('Tour supports later skipped and completed states', /not_started/.test(guided) && /later/.test(guided) && /skipped/.test(guided) && /completed/.test(guided));
check('Tour can be relaunched from Settings', /Take the guided tour/.test(main) && /startGuidedTour\(\{ manual: true \}\)/.test(main));
check('New vaults have default Home folders', /DEFAULT_HOME_FOLDERS = \['Passwords', 'Cards', 'Bank Details', 'Notes', 'Documents'\]/.test(main) && /homeDefaultsApplied: true/.test(main));
check('New custom folder offers Add to Home', /Add to Home\?/.test(main) && /setHomeFolderPrompt\(\{ visible: true, folderName/.test(main));
check('Home folders can expand on mobile', /Show \{hiddenHomeFolderCount\} more Home folder/.test(main) && /show-all-home-folders/.test(styles));
check('Migration adds tour columns', /add column if not exists guided_tour_status/.test(migration) && /guided_tour_updated_at/.test(migration));
check('Migration keeps service-role grant explicit', /grant select, insert, update, delete on public\.users to service_role/.test(migration));

if (failures) {
  console.error(`\n${failures} Ver-1.014 check(s) failed.`);
  process.exit(1);
}
console.log(`\n${checks}/${checks} Ver-1.014 guided help checks passed.`);
