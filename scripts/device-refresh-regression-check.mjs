import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { normalisePersistedSyncSafetyState } from '../src/syncRetryPolicy.js';

const root = path.resolve(process.cwd());
const main = fs.readFileSync(path.join(root, 'src/main.jsx'), 'utf8');
const checks = [];

function check(name, fn) {
  try {
    fn();
    checks.push({ name, pass: true });
  } catch (error) {
    checks.push({ name, pass: false, error });
  }
}

check('stale saved backup activity becomes an attention state', () => {
  const state = normalisePersistedSyncSafetyState({
    state: 'backing-up',
    pending: false,
    itemCount: 12,
    message: 'Protecting your latest changes...'
  });
  assert.equal(state.state, 'backup-pending');
  assert.equal(state.pending, true);
  assert.equal(state.itemCount, 12);
  assert.match(state.message, /did not finish confirming/i);
});

check('normal saved states are preserved', () => {
  const state = normalisePersistedSyncSafetyState({ state: 'up-to-date', pending: false, lastSnapshotId: 'snap_1' });
  assert.equal(state.state, 'up-to-date');
  assert.equal(state.pending, false);
  assert.equal(state.lastSnapshotId, 'snap_1');
});

check('Vault Status spinner is based on live syncing only', () => {
  assert.equal(main.includes("syncing || syncSafety.state === 'backing-up'"), false);
  assert.match(main, /vaultSessionChecking \|\| syncing\s*\? <RefreshCw/);
});

check('transient backing-up state is never newly persisted', () => {
  assert.equal((main.match(/state: 'backing-up'/g) || []).length, 0);
  assert.match(main, /state: 'backup-pending',\s*pending: true/);
});

check('vault backup request has a hard timeout and abort signal', () => {
  assert.match(main, /SYNC_BACKUP_TIMEOUT_MS = 30000/);
  assert.match(main, /const timeout = window\.setTimeout\(\(\) => controller\.abort\(\), SYNC_BACKUP_TIMEOUT_MS\)/);
  assert.match(main, /explicitConflictChoice: Boolean\(options\.explicitConflictChoice\)\s*\}, \{ signal: controller\.signal \}\)/);
  assert.match(main, /Secure backup took too long to confirm/);
});

check('backup history refresh also has a hard timeout', () => {
  assert.match(main, /SYNC_HISTORY_TIMEOUT_MS = 15000/);
  assert.match(main, /sync-vault\?history=1', \{ signal: controller\.signal \}/);
  assert.match(main, /Backup history took too long to respond/);
});

check('every syncing start has a matching cleanup path', () => {
  assert.equal((main.match(/setSyncing\(true\)/g) || []).length, 3);
  assert.equal((main.match(/setSyncing\(false\)/g) || []).length, 3);
  assert.match(main, /window\.clearTimeout\(timeout\);\s*syncOperationRef\.current = false;\s*setSyncing\(false\)/);
});

const failed = checks.filter((item) => !item.pass);
for (const item of checks) {
  console.log(`${item.pass ? 'PASS' : 'FAIL'}  ${item.name}`);
  if (!item.pass) console.error(`      ${item.error.message}`);
}
if (failed.length) {
  console.error(`\n${failed.length} secure-device refresh regression check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} secure-device refresh regression checks passed.`);
