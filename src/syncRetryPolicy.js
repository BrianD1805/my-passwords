export const AUTOMATIC_SYNC_RETRY_DELAYS_MS = Object.freeze([
  30 * 1000,
  2 * 60 * 1000,
  10 * 60 * 1000
]);

export const AUTOMATIC_SYNC_RETRY_MAX_ATTEMPTS = AUTOMATIC_SYNC_RETRY_DELAYS_MS.length;

export function nextAutomaticSyncRetry(attemptsCompleted = 0, { immediate = false } = {}) {
  const completed = Math.max(0, Math.floor(Number(attemptsCompleted || 0)));
  if (completed >= AUTOMATIC_SYNC_RETRY_MAX_ATTEMPTS) return null;
  return {
    attemptNumber: completed + 1,
    delayMs: immediate ? 0 : AUTOMATIC_SYNC_RETRY_DELAYS_MS[completed]
  };
}

export function automaticSyncRetryEligible({
  locked = true,
  cloudBackupIncluded = false,
  pending = false,
  conflict = false,
  authenticated = false,
  cloudAccess = false,
  online = false
} = {}) {
  return !locked
    && cloudBackupIncluded
    && pending
    && !conflict
    && authenticated
    && cloudAccess !== false
    && online;
}
