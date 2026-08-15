import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const offline = fs.readFileSync(new URL('../public/offline.html', import.meta.url), 'utf8');
const db = fs.readFileSync(new URL('../netlify/functions/_db.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const checks = [
  ['Version label is Ver-1.005.03', main.includes("const VERSION = 'Password-Encrypt Ver-1.005.03';")],
  ['Service worker cache version is aligned', sw.includes("my-passwords-v1.005.03")],
  ['Offline version is aligned', offline.includes('Password-Encrypt Ver-1.005.03')],
  ['Server app version is aligned', db.includes("Password-Encrypt Ver-1.005.03")],
  ['npm package version is aligned', pkg.version === '1.5.3'],
  ['Settings directory uses Emergency Access', main.includes('<strong>Emergency Access</strong><small>Manage your trusted person and import Emergency Packages released to you.</small>')],
  ['Settings has separate Import Emergency Package section', main.includes('aria-label="Import Emergency Package"') && main.includes('Enter Import Code')],
  ['Import section is independent of own Emergency Access entitlement', main.indexOf('aria-label="Import Emergency Package"') < main.indexOf("!featureIncluded('emergencyAccess')")],
  ['Received package list is derived from imported vault items', main.includes('function receivedEmergencyPackagesFromItems(vaultItems)') && main.includes('const receivedEmergencyPackages = receivedEmergencyPackagesFromItems(items);')],
  ['New vaults no longer create Emergency Access starter hub item', !main.slice(main.indexOf('const starterItems = ['), main.indexOf('function arrayBufferToBase64')).includes("systemAction: 'emergency_access_hub'")],
  ['Existing Emergency Access hub starter is removed after unlock', main.includes('items.filter((item) => !isEmergencyAccessHubItem(item))')],
  ['Old Emergency Access hub is hidden from normal vault items immediately', main.includes('!isInternalMetaItem(item) && !isEmergencyAccessHubItem(item)')],
  ['Emergency Package import no longer creates the hub item', !main.slice(main.indexOf('async function importEmergencyPackageIntoVault()'), main.indexOf('async function confirmTrustedPersonReminder()')).includes('upsertEmergencyAccessHubItem(next')],
  ['Duplicate detection uses imported package metadata', main.includes('receivedEmergencyPackagesFromItems(items).find((entry) => entry?.fingerprint === fingerprint)')],
  ['Release instructions point to Settings', main.includes('Settings → Emergency Access → Import Emergency Package')],
  ['FAQ points to Settings import route', main.includes('They enter it under Settings → Emergency Access → Import Emergency Package')],
  ['Settings import card has mobile layout', css.includes('.emergency-received-settings-card') && css.includes('.emergency-received-settings-header .primary-button')],
];

let failed = 0;
for (const [label, pass] of checks) {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) failed += 1;
}
console.log(`\n${checks.length - failed}/${checks.length} Ver-1.005.03 static checks passed.`);
if (failed) process.exit(1);
