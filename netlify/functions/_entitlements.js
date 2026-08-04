import { selectRows, updateRow } from './_db.js';

export const ENTITLEMENT_VERSION = 1;
export const FEATURE_KEYS = Object.freeze({
  documents: 'documents',
  emergencyAccess: 'emergencyAccess',
  secureDeviceUnlock: 'secureDeviceUnlock',
  cloudBackupSync: 'cloudBackupSync',
  multiUser: 'multiUser',
  sharing: 'sharing'
});

const LEGACY_SAFE_FEATURES = Object.freeze({
  documents: true,
  emergencyAccess: true,
  secureDeviceUnlock: true,
  cloudBackupSync: true,
  multiUser: false,
  sharing: false
});

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

function nonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
}

function optionalLimit(value) {
  if (value === null || value === undefined || value === '') return null;
  return nonNegativeInteger(value, 0);
}

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function normalisePlanFeatureFlags(value = {}) {
  const source = objectValue(value);
  return {
    documents: source.documents === undefined ? LEGACY_SAFE_FEATURES.documents : Boolean(source.documents),
    emergencyAccess: source.emergencyAccess === undefined
      ? (source.emergency_access === undefined ? LEGACY_SAFE_FEATURES.emergencyAccess : Boolean(source.emergency_access))
      : Boolean(source.emergencyAccess),
    secureDeviceUnlock: source.secureDeviceUnlock === undefined
      ? (source.secure_device_unlock === undefined ? LEGACY_SAFE_FEATURES.secureDeviceUnlock : Boolean(source.secure_device_unlock))
      : Boolean(source.secureDeviceUnlock),
    cloudBackupSync: source.cloudBackupSync === undefined
      ? (source.cloud_backup_sync === undefined ? LEGACY_SAFE_FEATURES.cloudBackupSync : Boolean(source.cloud_backup_sync))
      : Boolean(source.cloudBackupSync),
    multiUser: false,
    sharing: false
  };
}

export function normaliseEntitlementOverrides(value = {}) {
  const source = objectValue(value);
  const limits = objectValue(source.limits);
  const features = objectValue(source.features);
  const cleanFeatures = {};
  for (const key of [FEATURE_KEYS.documents, FEATURE_KEYS.emergencyAccess, FEATURE_KEYS.secureDeviceUnlock, FEATURE_KEYS.cloudBackupSync]) {
    if (typeof features[key] === 'boolean') cleanFeatures[key] = features[key];
  }
  return {
    limits: {
      maxUsers: optionalLimit(limits.maxUsers),
      documentLimit: optionalLimit(limits.documentLimit),
      storageLimitMb: optionalLimit(limits.storageLimitMb)
    },
    features: cleanFeatures
  };
}

export function entitlementSnapshotFromPlan(plan = {}) {
  const featureFlags = normalisePlanFeatureFlags(plan.feature_flags || plan.featureFlags || {});
  return {
    version: ENTITLEMENT_VERSION,
    planCode: String(plan.code || plan.plan_code || 'personal'),
    planName: String(plan.display_name || plan.displayName || plan.code || 'Personal'),
    capturedAt: new Date().toISOString(),
    limits: {
      maxUsers: Math.max(1, nonNegativeInteger(plan.max_users ?? plan.maxUsers, 1) || 1),
      documentLimit: nonNegativeInteger(plan.document_limit ?? plan.documentLimit, 0),
      storageLimitMb: nonNegativeInteger(plan.storage_limit_mb ?? plan.storageLimitMb, 0)
    },
    features: featureFlags
  };
}

function founderEntitlements() {
  return {
    version: ENTITLEMENT_VERSION,
    planCode: 'founder_private',
    planName: 'Founder Plan',
    capturedAt: new Date().toISOString(),
    limits: { maxUsers: 1, documentLimit: 0, storageLimitMb: 0 },
    features: {
      documents: true,
      emergencyAccess: true,
      secureDeviceUnlock: true,
      cloudBackupSync: true,
      multiUser: false,
      sharing: false
    }
  };
}

export function isFounderEntitlementTenant(tenant = {}) {
  const planCode = String(tenant.plan_code || '').toLowerCase();
  const planStatus = String(tenant.plan_status || '').toLowerCase();
  const role = String(tenant.tenant_role || '').toLowerCase();
  return ['founder_private', 'private_founder'].includes(planCode)
    || planStatus === 'founder_active'
    || role === 'founder_first_tenant';
}

export function applyEntitlementOverrides(snapshot = {}, rawOverrides = {}) {
  const base = {
    version: Number(snapshot.version || ENTITLEMENT_VERSION),
    planCode: String(snapshot.planCode || 'personal'),
    planName: String(snapshot.planName || snapshot.planCode || 'Personal'),
    capturedAt: snapshot.capturedAt || null,
    limits: {
      maxUsers: Math.max(1, nonNegativeInteger(snapshot?.limits?.maxUsers, 1) || 1),
      documentLimit: nonNegativeInteger(snapshot?.limits?.documentLimit, 0),
      storageLimitMb: nonNegativeInteger(snapshot?.limits?.storageLimitMb, 0)
    },
    features: normalisePlanFeatureFlags(snapshot.features || {})
  };
  const overrides = normaliseEntitlementOverrides(rawOverrides);
  for (const [key, value] of Object.entries(overrides.limits)) {
    if (value !== null) base.limits[key] = key === 'maxUsers' ? Math.max(1, value || 1) : value;
  }
  base.features = { ...base.features, ...overrides.features };
  return { ...base, overridesApplied: Boolean(Object.keys(overrides.features).length || Object.values(overrides.limits).some((value) => value !== null)) };
}

export function limitReached(limit, used, requested = 0) {
  const maximum = nonNegativeInteger(limit, 0);
  if (maximum === 0) return false; // Zero remains backwards-compatible as unlimited.
  return nonNegativeInteger(used, 0) + nonNegativeInteger(requested, 0) > maximum;
}

export function serialiseEntitlements(entitlements = {}, usage = {}) {
  const limits = entitlements.limits || {};
  const cleanUsage = {
    users: nonNegativeInteger(usage.users, 0),
    documents: nonNegativeInteger(usage.documents, 0),
    storageBytes: nonNegativeInteger(usage.storageBytes, 0),
    storageMb: Number((nonNegativeInteger(usage.storageBytes, 0) / (1024 * 1024)).toFixed(2))
  };
  return {
    version: Number(entitlements.version || ENTITLEMENT_VERSION),
    planCode: entitlements.planCode || 'personal',
    planName: entitlements.planName || 'Personal',
    capturedAt: entitlements.capturedAt || null,
    overridesApplied: Boolean(entitlements.overridesApplied),
    limits: {
      maxUsers: Math.max(1, nonNegativeInteger(limits.maxUsers, 1) || 1),
      documentLimit: nonNegativeInteger(limits.documentLimit, 0),
      storageLimitMb: nonNegativeInteger(limits.storageLimitMb, 0)
    },
    features: normalisePlanFeatureFlags(entitlements.features || {}),
    usage: cleanUsage,
    remaining: {
      users: Number(limits.maxUsers || 0) === 0 ? null : Math.max(0, Number(limits.maxUsers || 1) - cleanUsage.users),
      documents: Number(limits.documentLimit || 0) === 0 ? null : Math.max(0, Number(limits.documentLimit || 0) - cleanUsage.documents),
      storageBytes: Number(limits.storageLimitMb || 0) === 0 ? null : Math.max(0, Number(limits.storageLimitMb || 0) * 1024 * 1024 - cleanUsage.storageBytes)
    }
  };
}

export async function loadPlanEntitlementSnapshot(planCode) {
  const code = String(planCode || 'personal').trim().toLowerCase() || 'personal';
  const rows = await selectRows('subscription_plans', `select=code,display_name,max_users,storage_limit_mb,document_limit,feature_flags&code=${eq(code)}&limit=1`).catch(() => []);
  const plan = rows?.[0];
  return plan ? entitlementSnapshotFromPlan(plan) : entitlementSnapshotFromPlan({ code, display_name: code, max_users: 1, storage_limit_mb: 0, document_limit: 0, feature_flags: LEGACY_SAFE_FEATURES });
}

export async function entitlementUsageForTenant(tenantId) {
  const [users, documents] = await Promise.all([
    selectRows('users', `select=id,status&tenant_id=${eq(tenantId)}&limit=5000`).catch(() => []),
    selectRows('document_blobs', `select=id,file_size,storage_bytes&tenant_id=${eq(tenantId)}&limit=5000`).catch(() => [])
  ]);
  const activeUsers = (users || []).filter((user) => !['cancelled', 'deleted'].includes(String(user.status || '').toLowerCase())).length;
  return {
    users: activeUsers,
    documents: (documents || []).length,
    storageBytes: (documents || []).reduce((total, document) => total + nonNegativeInteger(document.storage_bytes || document.file_size, 0), 0)
  };
}

export async function resolveTenantEntitlements(tenantId, options = {}) {
  const [tenantRows, subscriptionRows] = await Promise.all([
    selectRows('tenants', `select=id,plan_code,plan_status,tenant_role&id=${eq(tenantId)}&limit=1`),
    selectRows('tenant_subscriptions', `select=id,plan_code,entitlements_snapshot,entitlements_snapshot_at,entitlement_overrides&tenant_id=${eq(tenantId)}&limit=1`).catch(() => [])
  ]);
  const tenant = tenantRows?.[0] || null;
  if (!tenant?.id) {
    const error = new Error('Customer account was not found.');
    error.code = 'ACCOUNT_NOT_FOUND';
    throw error;
  }

  const subscription = subscriptionRows?.[0] || null;
  let snapshot;
  if (isFounderEntitlementTenant(tenant)) {
    snapshot = founderEntitlements();
  } else if (subscription?.entitlements_snapshot?.version) {
    snapshot = subscription.entitlements_snapshot;
  } else {
    snapshot = await loadPlanEntitlementSnapshot(subscription?.plan_code || tenant.plan_code || 'personal');
    if (subscription?.id && options.persistSnapshot !== false) {
      const now = new Date().toISOString();
      await updateRow('tenant_subscriptions', `id=${eq(subscription.id)}`, {
        entitlements_snapshot: snapshot,
        entitlements_snapshot_at: now,
        updated_at: now
      }).catch(() => null);
    }
  }

  const effective = applyEntitlementOverrides(snapshot, subscription?.entitlement_overrides || {});
  const usage = options.includeUsage === false ? {} : await entitlementUsageForTenant(tenantId);
  return {
    tenant,
    subscription,
    snapshot,
    overrides: normaliseEntitlementOverrides(subscription?.entitlement_overrides || {}),
    effective,
    usage,
    serialized: serialiseEntitlements(effective, usage)
  };
}

export function entitlementDenied(feature, entitlements, message = '') {
  const error = new Error(message || 'This feature is not included in the current plan.');
  error.code = 'PLAN_FEATURE_REQUIRED';
  error.feature = feature;
  error.upgradeRequired = true;
  error.entitlements = serialiseEntitlements(entitlements || {}, {});
  return error;
}

export function requireEntitledFeature(entitlementContext, feature, message = '') {
  if (entitlementContext?.effective?.features?.[feature] !== false) return true;
  throw entitlementDenied(feature, entitlementContext.effective, message);
}


export function launchReadyPlan(planCode) {
  const code = String(planCode || '').trim().toLowerCase();
  return code === 'personal' || code.startsWith('personal_');
}

export function assertUserCapacity(entitlementContext, requestedUsers = 1) {
  const effective = entitlementContext?.effective || entitlementContext || {};
  const usage = entitlementContext?.usage || {};
  const maximum = Number(effective?.limits?.maxUsers || 1);
  const used = Number(usage?.users || 0);
  if (limitReached(maximum, used, requestedUsers)) {
    const error = new Error(`This plan allows ${maximum} user${maximum === 1 ? '' : 's'}. Upgrade or ask Admin for an override before adding another user.`);
    error.code = 'USER_LIMIT_REACHED';
    error.upgradeRequired = true;
    error.entitlements = serialiseEntitlements(effective, usage);
    throw error;
  }
  return true;
}

export function reservedPlanCannotPublish(planCode) {
  return ['family', 'business'].includes(String(planCode || '').trim().toLowerCase());
}
