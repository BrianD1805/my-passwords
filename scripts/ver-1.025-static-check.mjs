import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const main = read('src/main.jsx');
const health = read('netlify/functions/operations-health-check.js');
const db = read('netlify/functions/_db.js');
const sw = read('public/sw.js');
const offline = read('public/offline.html');
const pkg = JSON.parse(read('package.json'));
const checks = [
  ['version aligned', pkg.version === '1.25.0' && main.includes('Password-Encrypt Ver-1.025') && db.includes('Password-Encrypt Ver-1.025') && sw.includes('my-passwords-v1.025') && offline.includes('Password-Encrypt Ver-1.025')],
  ['secure device unlock has hard browser timeout', main.includes('SECURE_DEVICE_UNLOCK_TIMEOUT_MS = 20000') && main.includes('secureDeviceCredentialTimeoutRef')],
  ['secure device prompt is abortable', main.includes('secureDeviceCredentialAbortRef') && main.includes('signal: controller.signal')],
  ['secure device unlock offers password escape', main.includes("cancelAction: 'secure-device-unlock'") && main.includes('Cancel and use password')],
  ['missing local secure key is detected before device prompt', main.includes('Secure device unlock needs setting up again') && main.includes('readBiometricDeviceKey(), keyTimeout')],
  ['secure key store has bounded wait', main.includes('SECURE_DEVICE_KEY_CHECK_TIMEOUT_MS = 4000') && main.includes("SECURE_DEVICE_KEY_TIMEOUT")],
  ['cloud freshness check is bounded', main.includes('SECURE_DEVICE_CLOUD_CHECK_TIMEOUT_MS = 8000') && main.includes("code: 'CLOUD_CHECK_TIMEOUT'")],
  ['offline unlock can fall back to local vault', main.includes("code: 'OFFLINE'") && main.includes('open the local vault')],
  ['telemetry cannot block vault opening', main.includes('SYNC_TELEMETRY_TIMEOUT_MS = 3000') && main.includes('Diagnostics must never block the encrypted vault')],
  ['device setup is also abortable', main.includes('SECURE_DEVICE_SETUP_TIMEOUT_MS = 30000') && main.includes("cancelAction: 'secure-device-setup'")],
  ['operations health retries once before alerting', health.includes('runOperationsHealthCheckWithRetry') && health.includes('suppressFailureAlert: true') && health.includes('suppressFailureAlert: false')],
  ['health failure email says it failed after retry', health.includes('Operational health check failed after retry') && health.includes('failed twice')],
  ['health alert exposes only a sanitised diagnostic code', health.includes("replace(/[^A-Za-z0-9_.-]/g, '_')") && health.includes('Diagnostic code: ${safeCode}')],
  ['onboarding flow code remains present and unchanged in structure', main.includes('ONBOARDING_TOTAL_STEPS = 14') && main.includes('setLandingOnboardingStep(8)') && main.includes('setFinalOnboardingStep(13)') && main.includes('step === 14')]
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed++; }
console.log(`\n${checks.length - failed}/${checks.length} Ver-1.025 checks passed.`);
if (failed) process.exit(1);
