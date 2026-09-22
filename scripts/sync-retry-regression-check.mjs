import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  AUTOMATIC_SYNC_RETRY_DELAYS_MS,
  AUTOMATIC_SYNC_RETRY_MAX_ATTEMPTS,
  automaticSyncRetryEligible,
  nextAutomaticSyncRetry
} from '../src/syncRetryPolicy.js';

const root = path.resolve(process.cwd());
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const main = read('src/main.jsx');
const syncFunction = read('netlify/functions/sync-vault.js');
const clientErrorFunction = read('netlify/functions/client-error-report.js');

const checks = [];
function check(name, fn) {
  try {
    fn();
    checks.push({ name, pass: true });
  } catch (error) {
    checks.push({ name, pass: false, error });
  }
}

check('automatic retries use controlled exponential spacing', () => {
  assert.deepEqual(AUTOMATIC_SYNC_RETRY_DELAYS_MS, [30_000, 120_000, 600_000]);
});

check('a continuously failing backup cannot create unlimited automatic requests', () => {
  let attemptsCompleted = 0;
  let requests = 0;
  for (let simulatedFailure = 0; simulatedFailure < 10_000; simulatedFailure += 1) {
    const plan = nextAutomaticSyncRetry(attemptsCompleted);
    if (!plan) break;
    requests += 1;
    attemptsCompleted = plan.attemptNumber;
  }
  assert.equal(requests, 3);
  assert.equal(requests, AUTOMATIC_SYNC_RETRY_MAX_ATTEMPTS);
  assert.equal(nextAutomaticSyncRetry(attemptsCompleted), null);
});

check('a genuine reconnect can restart the bounded sequence immediately', () => {
  assert.deepEqual(nextAutomaticSyncRetry(0, { immediate: true }), { attemptNumber: 1, delayMs: 0 });
});

check('automatic retry eligibility requires a pending online verified vault', () => {
  const ready = { locked: false, cloudBackupIncluded: true, pending: true, conflict: false, authenticated: true, cloudAccess: true, online: true };
  assert.equal(automaticSyncRetryEligible(ready), true);
  for (const patch of [
    { locked: true }, { cloudBackupIncluded: false }, { pending: false }, { conflict: true },
    { authenticated: false }, { cloudAccess: false }, { online: false }
  ]) assert.equal(automaticSyncRetryEligible({ ...ready, ...patch }), false);
});

check('syncing and item changes do not re-arm the retry effect', () => {
  const effect = main.match(/const wasOnline = automaticSyncWasOnlineRef\.current;[\s\S]*?\}, \[([^\]]+)\]\);/);
  assert.ok(effect, 'automatic retry effect was not found');
  assert.equal(/\bsyncing\b/.test(effect[1]), false);
  assert.equal(/\bitems\b/.test(effect[1]), false);
  assert.equal(main.includes('2600'), false);
});

check('failed-state diagnostics are deduplicated before the diagnostic request', () => {
  assert.match(main, /reportedGeneration === failureState\.generation/);
  assert.match(main, /failureState\.reportedGeneration = failureState\.generation;\s*await recordSyncEvent\('backup_failed'/);
  assert.equal((main.match(/recordSyncEvent\('backup_failed'/g) || []).length, 1);
});

check('the exhausted state keeps manual backup available', () => {
  assert.match(main, /Automatic backup retries have paused[\s\S]*Back up changes now/);
  assert.match(main, /async function retryPendingBackup/);
});

check('offline-to-online recovery is explicit and resets the bounded sequence', () => {
  assert.match(main, /wasOnline === false && isOnline === true/);
  assert.match(main, /scheduleAutomaticSyncRetry\(\{ immediate: true, resetAttempts: true \}\)/);
});

check('sync-vault uses action-specific server throttling', () => {
  assert.match(syncFunction, /scope: 'vault_sync_backup', limit: 60/);
  assert.match(syncFunction, /scope: 'vault_sync_record_event', limit: 30/);
  assert.match(syncFunction, /scope: 'vault_sync_maintenance', limit: 12/);
  assert.match(syncFunction, /await consumeRateLimit\(event/);
});

check('client-error-report has a defensive server throttle', () => {
  assert.match(clientErrorFunction, /scope: 'client_error_report'/);
  assert.match(clientErrorFunction, /limit: 20/);
  assert.match(clientErrorFunction, /await consumeRateLimit\(event/);
});

const failed = checks.filter((item) => !item.pass);
for (const item of checks) {
  console.log(`${item.pass ? 'PASS' : 'FAIL'}  ${item.name}`);
  if (!item.pass) console.error(`      ${item.error.message}`);
}
if (failed.length) {
  console.error(`\n${failed.length} sync retry regression check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} sync retry regression checks passed.`);
