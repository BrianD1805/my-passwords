import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const offline = fs.readFileSync(new URL('../public/offline.html', import.meta.url), 'utf8');
const db = fs.readFileSync(new URL('../netlify/functions/_db.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const protectionStart = main.indexOf('id="settings-protection-group">Protection and recovery');
const helpStart = main.indexOf('id="settings-help-group">Help and support', protectionStart);
const protectionSlice = protectionStart >= 0 && helpStart > protectionStart ? main.slice(protectionStart, helpStart) : '';

const checks = [
  ['Version label is Ver-1.005.05', main.includes("const VERSION = 'Password-Encrypt Ver-1.005.05';")],
  ['Service worker cache version is aligned', sw.includes('my-passwords-v1.005.05')],
  ['Offline version is aligned', offline.includes('Password-Encrypt Ver-1.005.05')],
  ['Server app version is aligned', db.includes("Password-Encrypt Ver-1.005.05")],
  ['npm package version is aligned', pkg.version === '1.5.5'],
  ['Protection and recovery contains two Emergency Access panels', (protectionSlice.match(/<strong>Emergency Access<\/strong>/g) || []).length === 2],
  ['Nominate panel opens its own Settings page', protectionSlice.includes("openSettingsSection('emergency-nominate')")],
  ['Nominate panel has the requested wording', protectionSlice.includes('Nominate a trusted person to receive your prepared Emergency Package.')],
  ['Receive panel opens its own Settings page', protectionSlice.includes("openSettingsSection('emergency-receive')")],
  ['Receive panel has the requested wording', protectionSlice.includes('Receive an Emergency Package released to you.')],
  ['Nominate and Receive use separate active routes', main.includes("['emergency-nominate', 'emergency-receive'].includes(activeSettingsSection)")],
  ['Nominate content renders only on nominate route', main.includes("activeSettingsSection === 'emergency-nominate' && (")],
  ['Receive content renders only on receive route', main.includes("activeSettingsSection === 'emergency-receive' && (")],
  ['Legacy emergency deep links open nominate route', main.includes("openTarget === 'emergency' ? 'emergency-nominate'")],
  ['Trusted Person polling follows nominate route', main.includes("activeSettingsSection !== 'emergency-nominate'")],
  ['Receive page retains Import Code action', main.includes('openEmergencyImportCodeModal') && main.includes('Enter Import Code')],
  ['Receive page retains received package history', main.includes('Emergency Packages received') && main.includes('receivedEmergencyPackages.map')],
  ['Release instructions point to the separate receive panel', main.includes('Settings → Protection and recovery → Emergency Access — Receive an Emergency Package')],
  ['Receive page no longer carries the old separator', css.includes('.emergency-access-receive-section') && css.includes('border-top: 0')],
];

let failed = 0;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} Ver-1.005.05 static checks passed.`);
if (failed) process.exit(1);
