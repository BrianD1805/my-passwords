import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const offline = fs.readFileSync(new URL('../public/offline.html', import.meta.url), 'utf8');
const db = fs.readFileSync(new URL('../netlify/functions/_db.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const nominateAt = main.indexOf('id="emergency-nominate-title">Nominate a Trusted Person');
const receiveAt = main.indexOf('id="emergency-receive-title">Receive an Emergency Package');
const receiveEnd = main.indexOf("{activeSettingsSection === 'safety'", receiveAt);
const receiveSlice = receiveAt >= 0 && receiveEnd > receiveAt ? main.slice(receiveAt, receiveEnd) : '';

const checks = [
  ['Version label is Ver-1.005.04', main.includes("const VERSION = 'Password-Encrypt Ver-1.005.04';")],
  ['Service worker cache version is aligned', sw.includes('my-passwords-v1.005.04')],
  ['Offline version is aligned', offline.includes('Password-Encrypt Ver-1.005.04')],
  ['Server app version is aligned', db.includes("Password-Encrypt Ver-1.005.04")],
  ['npm package version is aligned', pkg.version === '1.5.4'],
  ['Settings directory explains nominate or receive', main.includes('Nominate a Trusted Person or receive an Emergency Package.')],
  ['Emergency Access intro explains both purposes', main.includes('Choose whether you want to nominate a Trusted Person for your own vault or receive an Emergency Package released to you.')],
  ['Nominate section has its own clear heading', nominateAt >= 0 && main.includes('className="emergency-access-purpose-section emergency-access-nominate-section"')],
  ['Receive section has its own clear heading', receiveAt >= 0 && main.includes('className="emergency-access-purpose-section emergency-access-receive-section"')],
  ['Nominate section is shown before Receive section', nominateAt >= 0 && receiveAt > nominateAt],
  ['Trusted Person planning stays in Nominate section', nominateAt >= 0 && main.indexOf('emergency-current-stage-card', nominateAt) > nominateAt && main.indexOf('emergency-current-stage-card', nominateAt) < receiveAt],
  ['Receive section keeps the Import Code action', receiveSlice.includes('Enter Import Code') && receiveSlice.includes('openEmergencyImportCodeModal')],
  ['Receive section keeps received package history', receiveSlice.includes('Emergency Packages received') && receiveSlice.includes('receivedEmergencyPackages.map')],
  ['Receive section remains usable without own Emergency Access entitlement', receiveSlice.includes('Import Emergency Package') && !receiveSlice.includes("featureIncluded('emergencyAccess') &&" )],
  ['Release instructions use Receive an Emergency Package route', main.includes('Settings → Emergency Access → Receive an Emergency Package')],
  ['FAQ uses Receive an Emergency Package route', main.includes('They enter it under Settings → Emergency Access → Receive an Emergency Package')],
  ['Two-section styling is present', css.includes('.emergency-access-purpose-section') && css.includes('.emergency-access-purpose-heading')],
  ['Receive section has a visual separator', css.includes('.emergency-access-receive-section') && css.includes('border-top: 1px solid #dfe6eb')],
  ['Two-section layout has mobile rules', css.includes('@media (max-width: 700px)') && css.includes('.emergency-access-purpose-heading')],
];

let failed = 0;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} Ver-1.005.04 static checks passed.`);
if (failed) process.exit(1);
