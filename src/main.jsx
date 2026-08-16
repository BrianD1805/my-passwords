import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, ArrowLeft, ArrowUp, Bell, CalendarClock, Check, ChevronRight, CircleHelp, Cloud, Copy, CreditCard, Database, Download, ExternalLink, Eye, EyeOff, FileText, Heart, Home, Image as ImageIcon, KeyRound, Lock, Mail, MonitorSmartphone, MoreHorizontal, Pencil, Phone, Plus, RefreshCw, Search, Save, Settings, Share2, ShieldCheck, Sparkles, Star, Trash2, Unlock, Upload, UserRoundCheck, UsersRound, X } from 'lucide-react';
import './styles.css';
import AdminApp from './AdminApp.jsx';
import CustomSelect from './CustomSelect.jsx';
import LegalPage, { LEGAL_VERSION, legalPageForPath } from './LegalPages.jsx';
import { formatAppDate } from './dateFormat.js';

const VERSION = 'Password-Encrypt Ver-1.008';
const SMS_AUTH_VERIFICATION_UI_ENABLED = false;
const SMS_MOBILE_CONTACT_VERIFICATION_ENABLED = true;
const STORAGE_KEY = 'my-passwords-v0.002-local-vault';
const LEGACY_STORAGE_KEY = 'my-passwords-v0.001-local-vault';
const SALT_KEY = 'my-passwords-v0.002-salt';
const LEGACY_SALT_KEY = 'my-passwords-v0.001-salt';
const BOOTSTRAP_KEY = 'my-passwords-v0.002-bootstrap-profile';
const ACCOUNT_KEY = 'my-passwords-v0.011-account-identity';
const BIOMETRIC_UNLOCK_KEY = 'my-passwords-v0.038-device-biometric-unlock';
const BIOMETRIC_KEY_DB_NAME = 'my-passwords-device-biometric-key-v0.038';
const BIOMETRIC_KEY_STORE = 'deviceKeys';
const BIOMETRIC_KEY_ID = 'local-master-password-wrap-key';
const SYNC_SAFETY_KEY = 'my-passwords-sync-safety-v1';
const SYNC_DEVICE_ID_KEY = 'my-passwords-sync-device-id-v1';
const ENTITLEMENTS_CACHE_KEY = 'my-passwords-entitlements-v1';
const PENDING_DOCUMENT_DELETIONS_KEY = 'my-passwords-pending-document-deletions-v1';
const ACCOUNT_DEVICE_INSTALL_KEY = 'my-passwords-account-device-install-v1';
const PENDING_ONBOARDING_ACCOUNT_KEY = 'password-encrypt-pending-onboarding-account-v1';
const PUSH_BINDING_KEY = 'password-encrypt-push-binding-v1';
const PUSH_PROMPT_SUPPRESSION_KEY = 'password-encrypt-push-prompt-suppressed-v1';


const LEGACY_VAULT_BACK_MARKER_KEYS = [
  'myPasswordsBackController',
  'myPasswordsBackSession',
  'myPasswordsBackGuard',
  'myPasswordsBackGuardSession'
];
const LEGACY_VAULT_BACK_HASH = '#my-passwords-back-guard';

// Ver-0.050 keeps the approved CloseWatcher-based Back handling while hardening server security boundaries.
// Remove only the current entry's markers left by the previous Back controllers
// so they cannot interfere with billing URL cleanup or later app navigation.
function clearLegacyVaultBackMarkers() {
  if (typeof window === 'undefined') return;

  try {
    LEGACY_VAULT_BACK_MARKER_KEYS.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Session storage may be unavailable in a restricted browser context.
  }

  const currentState = window.history.state;
  const nextState = currentState && typeof currentState === 'object' ? { ...currentState } : {};
  let stateChanged = false;

  LEGACY_VAULT_BACK_MARKER_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(nextState, key)) {
      delete nextState[key];
      stateChanged = true;
    }
  });

  const hasLegacyHash = window.location.hash === LEGACY_VAULT_BACK_HASH;
  if (!stateChanged && !hasLegacyHash) return;

  const cleanUrl = `${window.location.pathname}${window.location.search}${hasLegacyHash ? '' : window.location.hash}`;
  try {
    window.history.replaceState(nextState, document.title, cleanUrl);
  } catch {
    // Marker cleanup is defensive and must never block the app from starting.
  }
}

clearLegacyVaultBackMarkers();

// Ver-0.053I: make Ubuntu loading deterministic across the landing page, /vault
// standalone PWA and Admin. The document head contains the same stylesheet; this
// recovery path only adds it when an older cached shell is missing the link.
function ensureUbuntuFontStylesheet() {
  if (typeof document === 'undefined') return;
  const href = 'https://fonts.googleapis.com/css?family=Ubuntu:300,400,500,700&display=swap';
  let link = document.getElementById('ubuntu-font-stylesheet');
  if (!link) {
    link = document.createElement('link');
    link.id = 'ubuntu-font-stylesheet';
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
  if (document.fonts?.load) {
    Promise.all([
      document.fonts.load('400 16px Ubuntu'),
      document.fonts.load('500 16px Ubuntu'),
      document.fonts.load('700 16px Ubuntu')
    ]).catch(() => {});
  }
}

ensureUbuntuFontStylesheet();

// Capture the browser's install opportunity as early as possible so Step 3 can
// still offer the native install prompt even if the event fires before the
// onboarding screen is reached.
let capturedPasswordEncryptInstallPrompt = typeof window !== 'undefined' ? (window.__passwordEncryptInstallPrompt || null) : null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    capturedPasswordEncryptInstallPrompt = event;
    window.__passwordEncryptInstallPrompt = event;
  });
  window.addEventListener('appinstalled', () => {
    capturedPasswordEncryptInstallPrompt = null;
    window.__passwordEncryptInstallPrompt = null;
  });
}

function readPendingOnboardingAccount() {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(PENDING_ONBOARDING_ACCOUNT_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function savePendingOnboardingAccount(account = {}) {
  if (typeof window === 'undefined') return;
  const tenantId = String(account.tenantId || '').trim();
  const userId = String(account.userId || '').trim();
  if (!tenantId || !userId) return;
  try {
    window.sessionStorage.setItem(PENDING_ONBOARDING_ACCOUNT_KEY, JSON.stringify({
      tenantId,
      userId,
      email: String(account.email || '').trim().toLowerCase(),
      accountName: String(account.accountName || account.tenantName || '').trim(),
      phoneE164: String(account.phoneE164 || '').trim(),
      createdAt: new Date().toISOString()
    }));
  } catch {
    // Onboarding still remains protected by the live signed session check.
  }
}

function clearPendingOnboardingAccount() {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(PENDING_ONBOARDING_ACCOUNT_KEY); } catch {}
}

function readAccountDeviceInstallId() {
  let value = localStorage.getItem(ACCOUNT_DEVICE_INSTALL_KEY) || '';
  if (!value) {
    value = `install_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
    localStorage.setItem(ACCOUNT_DEVICE_INSTALL_KEY, value);
  }
  return value;
}

function accountDeviceMetadata() {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const platform = typeof navigator !== 'undefined' ? navigator.userAgentData?.platform || navigator.platform || '' : '';
  const mobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
  const browser = /Edg\//i.test(userAgent) ? 'Microsoft Edge' : /Chrome\//i.test(userAgent) ? 'Google Chrome' : /Firefox\//i.test(userAgent) ? 'Mozilla Firefox' : /Safari\//i.test(userAgent) ? 'Safari' : 'Web browser';
  const platformLabel = /Android/i.test(userAgent) ? 'Android' : /iPhone|iPad/i.test(userAgent) ? 'Apple mobile' : /Windows/i.test(userAgent) ? 'Windows' : /Macintosh|Mac OS/i.test(userAgent) ? 'macOS' : platform || 'Unknown platform';
  return {
    clientDeviceId: readAccountDeviceInstallId(),
    deviceName: `${platformLabel} ${mobile ? 'device' : 'computer'} · ${browser}`,
    deviceType: mobile ? 'mobile' : 'computer',
    platform: platformLabel,
    browser,
    userAgent
  };
}

function isPasswordEncryptInstalled() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return Boolean(window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true);
}

function passwordEncryptInstallInstructions() {
  if (typeof navigator === 'undefined') return 'Use your browser menu to install Password-Encrypt as an app.';
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'On iPhone or iPad, tap Share, choose Add to Home Screen, then tap Add.';
  if (/Android/i.test(ua)) return 'Open your browser menu and choose Install app or Add to Home screen.';
  return 'Use the install icon in your browser address bar, or open the browser menu and choose Install Password-Encrypt.';
}
const DEFAULT_ENTITLEMENTS = Object.freeze({
  version: 3,
  planCode: 'personal',
  planName: 'Personal',
  limits: { maxUsers: 1, itemLimit: 0, documentLimit: 0, photoLimit: 0, storageLimitMb: 0 },
  features: { documents: true, pictures: true, emergencyAccess: true, secureDeviceUnlock: true, cloudBackupSync: true, multiUser: false, sharing: false },
  usage: { users: 1, vaultItems: 0, documents: 0, pictures: 0, documentStorageBytes: 0, pictureStorageBytes: 0, vaultStorageBytes: 0, storageBytes: 0, storageMb: 0 },
  remaining: { users: 0, vaultItems: null, documents: null, pictures: null, storageBytes: null }
});

function randomIndex(max) {
  if (max <= 0) return 0;
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] % max;
  }
  return Math.floor(Math.random() * max);
}

function pickCharacter(pool) {
  return pool.charAt(randomIndex(pool.length));
}

function shuffleCharacters(values = []) {
  const list = [...values];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1);
    [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
  }
  return list;
}

function generateStrongPassword(length = 18) {
  const safeLength = Math.max(14, Math.min(32, Number(length) || 18));
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const numbers = '23456789';
  const specials = '!@#$%&*?-_+';
  const all = `${lower}${upper}${numbers}${specials}`;
  const seeded = [pickCharacter(lower), pickCharacter(upper), pickCharacter(numbers), pickCharacter(specials)];
  while (seeded.length < safeLength) seeded.push(pickCharacter(all));
  return shuffleCharacters(seeded).join('');
}

function normaliseClientEntitlements(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    ...DEFAULT_ENTITLEMENTS,
    ...source,
    limits: { ...DEFAULT_ENTITLEMENTS.limits, ...(source.limits || {}) },
    features: { ...DEFAULT_ENTITLEMENTS.features, ...(source.features || {}), multiUser: false, sharing: false },
    usage: { ...DEFAULT_ENTITLEMENTS.usage, ...(source.usage || {}) },
    remaining: { ...DEFAULT_ENTITLEMENTS.remaining, ...(source.remaining || {}) }
  };
}

function readCachedEntitlements() {
  try { return normaliseClientEntitlements(JSON.parse(localStorage.getItem(ENTITLEMENTS_CACHE_KEY) || '{}')); }
  catch { return normaliseClientEntitlements(); }
}

function persistEntitlements(value) {
  const next = normaliseClientEntitlements(value);
  localStorage.setItem(ENTITLEMENTS_CACHE_KEY, JSON.stringify(next));
  return next;
}

function readPendingDocumentDeletions() {
  try {
    const value = JSON.parse(localStorage.getItem(PENDING_DOCUMENT_DELETIONS_KEY) || '[]');
    return Array.isArray(value) ? value.filter((entry) => entry?.documentId && entry?.tenantId && entry?.userId) : [];
  } catch {
    return [];
  }
}

function queuePendingDocumentDeletion(entry) {
  if (!entry?.documentId || !entry?.tenantId || !entry?.userId) return;
  const current = readPendingDocumentDeletions();
  const key = `${entry.tenantId}:${entry.userId}:${entry.documentId}`;
  if (!current.some((item) => `${item.tenantId}:${item.userId}:${item.documentId}` === key)) {
    current.push({ documentId: entry.documentId, tenantId: entry.tenantId, userId: entry.userId, queuedAt: new Date().toISOString() });
    localStorage.setItem(PENDING_DOCUMENT_DELETIONS_KEY, JSON.stringify(current));
  }
}

function removePendingDocumentDeletion(entry) {
  const key = `${entry.tenantId}:${entry.userId}:${entry.documentId}`;
  const next = readPendingDocumentDeletions().filter((item) => `${item.tenantId}:${item.userId}:${item.documentId}` !== key);
  localStorage.setItem(PENDING_DOCUMENT_DELETIONS_KEY, JSON.stringify(next));
}
const SECURE_DEVICE_PASSWORD_CONFIRM_DAYS = 14;
const SECURE_DEVICE_UNLOCK_COUNT_LIMIT = 10;

const FALLBACK_SAAS_PLANS = [];


function readSyncSafetyState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SYNC_SAFETY_KEY) || '{}');
    return {
      state: parsed.state || 'unknown',
      pending: Boolean(parsed.pending),
      conflict: Boolean(parsed.conflict),
      sessionRequired: Boolean(parsed.sessionRequired),
      message: parsed.message || '',
      itemCount: Number(parsed.itemCount || 0),
      lastFailureAt: parsed.lastFailureAt || '',
      lastSuccessAt: parsed.lastSuccessAt || '',
      lastSnapshotId: parsed.lastSnapshotId || '',
      acknowledgedAt: parsed.acknowledgedAt || ''
    };
  } catch {
    return { state: 'unknown', pending: false, conflict: false, sessionRequired: false, message: '', itemCount: 0, lastFailureAt: '', lastSuccessAt: '', lastSnapshotId: '', acknowledgedAt: '' };
  }
}

function persistSyncSafetyState(next) {
  localStorage.setItem(SYNC_SAFETY_KEY, JSON.stringify(next));
  return next;
}

function getSyncDeviceId() {
  let value = localStorage.getItem(SYNC_DEVICE_ID_KEY) || '';
  if (!value) {
    value = `device_${crypto.randomUUID()}`;
    localStorage.setItem(SYNC_DEVICE_ID_KEY, value);
  }
  return value;
}

function friendlyDeviceType() {
  return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || '') ? 'mobile' : 'desktop';
}

const SETTINGS_FAQS = [
  {
    category: 'Master password',
    question: 'Can Password-Encrypt recover my master password?',
    answer: 'No. Your master password is the primary encryption secret for the vault and no server-side copy is stored by Password-Encrypt, so support cannot recover or reset it. A working Secure device unlock on a device you already configured may still provide local access until its next required password check, and Emergency Access may release information prepared in advance; neither is a master-password reset.'
  },
  {
    category: 'Master password',
    question: 'Should I save my master password in a browser or another password manager?',
    answer: 'No. The master password protects everything in this vault. Type it yourself and keep any offline recovery record somewhere physically secure and separate from the devices that hold the vault.'
  },
  {
    category: 'Security',
    question: 'Can Password-Encrypt staff read my saved passwords?',
    answer: 'During normal service operation, readable vault records are encrypted in your browser before storage or backup and the master password is not sent to the server. Password-Encrypt therefore does not hold the information normally needed to decrypt stored vault snapshots, but no online service can promise absolute security against a compromised device, browser or future application code.'
  },
  {
    category: 'Security',
    question: 'What is Secure device unlock?',
    answer: 'Secure device unlock lets a supported device use its PIN, fingerprint, face unlock, passkey or platform security to unlock the local vault more quickly. The master password remains the source of truth and is required again periodically.'
  },
  {
    category: 'Devices',
    question: 'How do I open my vault on another device?',
    answer: 'Verify the new device by email, then enter the same master password. Password-Encrypt will safely check for the latest protected vault copy without replacing different changes automatically.'
  },
  {
    category: 'Devices',
    question: 'What happens if I clear the local vault on this device?',
    answer: 'The encrypted local copy is removed from that device. Your cloud backup is not deleted. To restore the vault later, verify the account, restore the latest backup and enter the correct master password.'
  },
  {
    category: 'Backup',
    question: 'What is the difference between the local vault and cloud backup?',
    answer: 'The local vault is the encrypted copy used for everyday access on this device. Cloud backup stores an encrypted snapshot that can be restored after device loss, browser reset or installation on another device.'
  },
  {
    category: 'Backup',
    question: 'How can I confirm my latest backup?',
    answer: 'Open Settings and choose Vault Safety. It clearly shows whether your latest changes are protected, waiting for backup, or need review. Use Back up changes now when action is required.'
  },
  {
    category: 'Documents',
    question: 'Can I store documents in the vault?',
    answer: 'Yes. Supported documents are encrypted before upload. The current upload limit is 10 MB per document.'
  },
  {
    category: 'Pictures',
    question: 'Can I store passport and photo ID pictures in the vault?',
    answer: 'Yes. Pictures such as passport photos, photo IDs and driving licences can be stored as encrypted Pictures. Each picture can be up to 10 MB, subject to the Picture allowance and total storage included in your plan.'
  },
  {
    category: 'Emergency Access',
    question: 'Does my next of kin or trusted person need a Password-Encrypt account?',
    answer: 'No. Emergency Access is intended for a next of kin or another trusted person you nominate. The standard flow works through secure browser links, so they can accept the invitation, request access and open the released package without installing the app or creating their own vault. If the trusted person already uses Password-Encrypt, the released page also shows a secure Import Code. They can enter that code from Settings → Protection and recovery → Emergency Access — Receive an Emergency Package inside their own vault and add the released package as a separate Emergency Package folder.'
  },
  {
    category: 'Emergency Access',
    question: 'What happens after an Emergency Access request?',
    answer: 'A waiting period begins and the owner is notified. The owner can cancel during that period. If the waiting period ends without cancellation, only the selected emergency package or scope becomes available.'
  },
  {
    category: 'Emergency Access',
    question: 'Will my trusted person receive the latest version of my vault?',
    answer: 'Password-Encrypt keeps the prepared Emergency Package refreshed from the unlocked vault while the Trusted Person arrangement is active. The app must be online and unlocked because the server cannot decrypt the vault itself. When the waiting period finishes, the latest prepared package is frozen as the release snapshot so later changes are not silently shared.'
  },
  {
    category: 'Account',
    question: 'Why might cloud backup ask me to verify my account again?',
    answer: 'Secure backup and syncing require this device to be verified. If verification expires or browser data is cleared, complete email OTP verification again. Your encrypted vault remains protected on the device.'
  },
  {
    category: 'Account',
    question: 'Does changing my subscription plan change my encryption?',
    answer: 'No. Subscription plans control account features and limits. They do not change the master password, encryption key or ownership of the encrypted vault.'
  },
  {
    category: 'Support',
    question: 'How do I contact support?',
    answer: 'Email info@zippyweb.uk from the email address linked to your account. Never include your master password, vault contents, recovery information or secret keys in a support message.'
  }
];

function publicPlanPriceLabel(plan) {
  const amount = Number(plan?.monthlyPriceMinor || 0);
  if (!amount) return plan?.trialDays ? `${plan.trialDays}-day trial` : 'Pricing coming soon';
  try {
    return `${new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount / 100)} / month`;
  } catch {
    return `${(amount / 100).toFixed(2)} GBP / month`;
  }
}

function planIntervalAmount(plan, interval) {
  if (interval === 'quarterly') return Number(plan?.quarterlyPriceMinor || 0);
  if (interval === 'annual') return Number(plan?.annualPriceMinor || 0);
  return Number(plan?.monthlyPriceMinor || 0);
}

function planIntervalReady(plan, interval) {
  if (interval === 'quarterly') return Boolean(plan?.stripeQuarterlyReady);
  if (interval === 'annual') return Boolean(plan?.stripeAnnualReady);
  return Boolean(plan?.stripeMonthlyReady);
}

function billingIntervalLabel(interval) {
  if (interval === 'quarterly') return 'Quarterly';
  if (interval === 'annual') return 'Annual';
  return 'Monthly';
}

function billingPriceLabel(plan, interval) {
  const amount = planIntervalAmount(plan, interval);
  if (!amount) return 'Not available';
  const suffix = interval === 'annual' ? ' / year' : interval === 'quarterly' ? ' / 3 months' : ' / month';
  try { return `${new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(amount / 100)}${suffix}`; }
  catch { return `${(amount / 100).toFixed(2)} GBP${suffix}`; }
}

function subscriptionStatusLabel(status) {
  const value = String(status || '').toLowerCase();
  if (value === 'active') return 'Subscription active';
  if (value === 'trialing') return 'Trial active';
  if (value === 'checkout_pending' || value === 'incomplete') return 'Checkout pending';
  if (value === 'checkout_cancelled') return 'Checkout cancelled';
  if (value === 'checkout_expired' || value === 'incomplete_expired') return 'Checkout expired';
  if (value === 'past_due' || value === 'unpaid') return 'Payment needs attention';
  if (value === 'paused') return 'Suspended';
  if (value === 'cancelled' || value === 'canceled') return 'Cancelled';
  if (value === 'expired') return 'Trial expired';
  return value ? value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'No paid subscription';
}


function formatBillingMoney(amountMinor, currency = 'GBP') {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: String(currency || 'GBP').toUpperCase() }).format(Number(amountMinor || 0) / 100);
  } catch {
    return `${(Number(amountMinor || 0) / 100).toFixed(2)} ${String(currency || 'GBP').toUpperCase()}`;
  }
}

function invoiceCustomerDisplay(invoice = {}) {
  const status = String(invoice.status || '').toLowerCase();
  const dueTime = invoice.dueAt ? new Date(invoice.dueAt).getTime() : 0;
  const pastDue = status === 'open' && Number(invoice.amountRemainingMinor || 0) > 0 && dueTime > 0 && dueTime < Date.now();
  if (status === 'paid') {
    return {
      statusLabel: 'Paid',
      dateLabel: invoice.paidAt ? `Paid on ${formatAccountDate(invoice.paidAt, true)}` : `Paid invoice · ${formatAccountDate(invoice.createdAt, true)}`,
      amountMinor: Number(invoice.amountPaidMinor || invoice.amountDueMinor || 0),
      primaryLabel: 'View receipt',
      primaryUrl: invoice.receiptUrl || invoice.hostedInvoiceUrl || invoice.invoicePdfUrl || '',
      showInvoiceDownload: Boolean(invoice.invoicePdfUrl)
    };
  }
  if (status === 'open') {
    return {
      statusLabel: pastDue ? 'Payment needs attention' : 'Payment due',
      dateLabel: invoice.dueAt ? `${pastDue ? 'Due' : 'Pay by'} ${formatAccountDate(invoice.dueAt)}` : `Created ${formatAccountDate(invoice.createdAt)}`,
      amountMinor: Number(invoice.amountRemainingMinor || invoice.amountDueMinor || 0),
      primaryLabel: pastDue ? 'Pay now' : 'Pay invoice',
      primaryUrl: invoice.hostedInvoiceUrl || '',
      showInvoiceDownload: Boolean(invoice.invoicePdfUrl)
    };
  }
  if (status === 'void') {
    return {
      statusLabel: 'Void',
      dateLabel: `Issued ${formatAccountDate(invoice.createdAt)}`,
      amountMinor: Number(invoice.amountDueMinor || 0),
      primaryLabel: 'View invoice',
      primaryUrl: invoice.hostedInvoiceUrl || invoice.invoicePdfUrl || '',
      showInvoiceDownload: Boolean(invoice.invoicePdfUrl)
    };
  }
  if (status === 'uncollectible') {
    return {
      statusLabel: 'Payment not collected',
      dateLabel: `Issued ${formatAccountDate(invoice.createdAt)}`,
      amountMinor: Number(invoice.amountDueMinor || 0),
      primaryLabel: 'View invoice',
      primaryUrl: invoice.hostedInvoiceUrl || invoice.invoicePdfUrl || '',
      showInvoiceDownload: Boolean(invoice.invoicePdfUrl)
    };
  }
  return {
    statusLabel: status ? status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Invoice',
    dateLabel: `Created ${formatAccountDate(invoice.createdAt)}`,
    amountMinor: Number(invoice.amountDueMinor || 0),
    primaryLabel: status === 'draft' ? '' : 'View invoice',
    primaryUrl: status === 'draft' ? '' : (invoice.hostedInvoiceUrl || invoice.invoicePdfUrl || ''),
    showInvoiceDownload: status !== 'draft' && Boolean(invoice.invoicePdfUrl)
  };
}

function subscriptionLifecycleState(subscription = null, account = {}) {
  const accountStatus = String(account?.accountStatus || '').toLowerCase();
  const planStatus = String(account?.planStatus || '').toLowerCase();
  const status = String(subscription?.status || planStatus || '').toLowerCase();
  if (accountStatus === 'suspended' || planStatus === 'suspended' || status === 'paused') return 'suspended';
  if (subscription?.cancelAtPeriodEnd && ['active', 'trialing'].includes(status)) return 'cancellation_scheduled';
  if (status === 'trialing' || status === 'trial_active') return 'trial_active';
  if (status === 'active') return subscription?.provider === 'stripe' ? 'subscription_active' : 'trial_active';
  if (['past_due', 'unpaid', 'incomplete', 'payment_problem'].includes(status)) return 'payment_needs_attention';
  if (['cancelled', 'canceled', 'incomplete_expired', 'subscription_cancelled', 'trial_cancelled', 'trial_expired', 'expired'].includes(status)) return 'cancelled';
  if (['trial_pending', 'signup_pending'].includes(status)) return 'trial_pending';
  return subscription?.provider === 'stripe' ? 'payment_needs_attention' : 'trial_active';
}

function subscriptionLifecycleLabel(subscription = null, account = {}) {
  const state = subscriptionLifecycleState(subscription, account);
  if (state === 'trial_active') return 'Trial active';
  if (state === 'subscription_active') return 'Subscription active';
  if (state === 'payment_needs_attention') return 'Payment needs attention';
  if (state === 'cancellation_scheduled') return 'Cancellation scheduled';
  if (state === 'cancelled') return 'Cancelled';
  if (state === 'suspended') return 'Suspended';
  return 'Trial pending';
}

function monthlyEquivalentPrice(plan, interval) {
  const amount = planIntervalAmount(plan, interval);
  if (interval === 'annual') return amount / 12;
  if (interval === 'quarterly') return amount / 3;
  return amount;
}

function subscriptionChangeMode(currentSubscription, currentPlan, targetPlan, targetInterval) {
  if (!currentSubscription?.providerSubscriptionIdPresent) return 'checkout';
  const currentInterval = currentSubscription.billingInterval || 'monthly';
  if (currentPlan?.code === targetPlan?.code && currentInterval === targetInterval) return 'none';
  const currentOrder = Number(currentPlan?.displayOrder || 0);
  const targetOrder = Number(targetPlan?.displayOrder || 0);
  const differentPlan = Boolean(targetPlan?.code && currentPlan?.code && targetPlan.code !== currentPlan.code);
  const higherPlan = differentPlan && targetOrder > currentOrder;
  const sameRankHigherValue = differentPlan && targetOrder === currentOrder && monthlyEquivalentPrice(targetPlan, targetInterval) > monthlyEquivalentPrice(currentPlan, currentInterval);
  return higherPlan || sameRankHigherValue ? 'immediate' : 'scheduled';
}

function planDisplayName(planCode) {
  const code = String(planCode || '').trim().toLowerCase();
  if (code === 'founder_private' || code === 'private_founder') return 'Founder Plan';
  if (code === 'personal_free' || code === 'personal') return 'Personal';
  if (code === 'family') return 'Family';
  if (code === 'business') return 'Business';
  return code ? code.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Personal';
}

function planStatusDisplayName(planStatus, accountStatus = '') {
  const status = String(planStatus || accountStatus || '').trim().toLowerCase();
  if (status === 'founder_active') return 'Founder Active';
  if (status === 'trial_pending') return 'Trial Pending';
  if (status === 'signup_pending') return 'Signup Pending';
  if (status === 'trial_active' || status === 'trialing') return 'Trial Active';
  if (status === 'active') return 'Subscription Active';
  if (status === 'suspended') return 'Suspended';
  if (status === 'cancellation_scheduled') return 'Cancellation Scheduled';
  if (status === 'trial_expired') return 'Trial Expired';
  if (status === 'trial_cancelled') return 'Trial Cancelled';
  if (status === 'payment_problem' || status === 'past_due' || status === 'unpaid') return 'Payment Needs Attention';
  if (status === 'payment_paused' || status === 'paused') return 'Subscription Paused';
  if (status === 'subscription_cancelled' || status === 'cancelled') return 'Subscription Cancelled';
  if (status === 'checkout_pending' || status === 'incomplete') return 'Checkout Pending';
  return status ? status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Active';
}


function formatAccountDate(value, includeTime = false) {
  return formatAppDate(value, includeTime, '—');
}

function accountTrialDaysRemaining(value) {
  if (!value) return null;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

function isFounderPlan(account = {}) {
  const planCode = String(account.planCode || '').toLowerCase();
  const planStatus = String(account.planStatus || '').toLowerCase();
  const tenantRole = String(account.tenantRole || '').toLowerCase();
  return ['founder_private', 'private_founder'].includes(planCode) || planStatus === 'founder_active' || tenantRole === 'founder_first_tenant';
}

function tenantRoleDisplayName(tenantRole) {
  const role = String(tenantRole || '').trim().toLowerCase();
  if (role === 'founder_first_tenant') return 'Founder';
  if (role === 'primary_owner') return 'Primary Owner';
  return role ? role.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Primary Owner';
}

const BUILT_IN_CATEGORIES = ['Passwords', 'Cards', 'Bank Details', 'Secret Keys', 'Work Stuff', 'Links', 'Notes', 'Checklists', 'Documents', 'Pictures', 'Emergency Info'];
const categories = ['All', ...BUILT_IN_CATEGORIES];
const FOLDER_META_CATEGORY = '__my_passwords_folder_meta';
const FOLDER_META_ID = '__my_passwords_custom_folders';
const EMERGENCY_ACCESS_META_CATEGORY = '__my_passwords_emergency_access_meta';
const EMERGENCY_ACCESS_META_ID = '__my_passwords_emergency_access_plan';
const DOCUMENTS_CATEGORY = 'Documents';
const PICTURES_CATEGORY = 'Pictures';
const CARDS_CATEGORY = 'Cards';
const FAVOURITES_VIEW = '__favourites__';
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_PICTURE_BYTES = 10 * 1024 * 1024;
const ENCRYPTED_FILE_CHUNK_CHARACTERS = 2_000_000;
const ALLOWED_DOCUMENT_EXTENSIONS = ['txt', 'md', 'csv', 'xls', 'xlsx', 'doc', 'docx', 'pdf'];
const ALLOWED_DOCUMENT_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
];
const ALLOWED_PICTURE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
const ALLOWED_PICTURE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

const categoryHints = {
  Passwords: {
    title: 'e.g. Gmail, Netlify, Supabase, Barclays login',
    url: 'https://example.com',
    username: 'Email / username',
    secret: 'Password',
    notes: 'Recovery notes, 2FA app, backup codes, support number...'
  },

  Cards: {
    title: 'e.g. Personal Visa, Business Mastercard',
    url: '',
    username: 'Name on card',
    secret: '16 digit card number',
    notes: 'Optional card note, bank, renewal reminder...'
  },
  'Bank Details': {
    title: 'e.g. Barclays current account',
    url: 'Bank website or app link',
    username: 'Account holder / reference',
    secret: 'PIN hint / security reference — never plain PIN if avoidable',
    notes: 'Sort code, IBAN, SWIFT, card notes, branch/contact details...'
  },
  'Secret Keys': {
    title: 'e.g. Stripe live API key',
    url: 'Dashboard link',
    username: 'Environment / project name',
    secret: 'API key / secret',
    notes: 'Where it is used, expiry, rotation notes...'
  },
  'Work Stuff': {
    title: 'e.g. Client hosting login',
    url: 'Admin/dashboard link',
    username: 'Client / system reference',
    secret: 'Password / access token',
    notes: 'Project notes, renewal dates, deployment notes...'
  },
  Links: {
    title: 'e.g. Important dashboard link',
    url: 'https://',
    username: 'Optional reference',
    secret: 'Optional access note',
    notes: 'Why this link matters...'
  },
  Notes: {
    title: 'e.g. Safe place note',
    url: 'Optional link',
    username: 'Optional reference',
    secret: 'Optional protected detail',
    notes: 'Private note text...'
  },
  Checklists: {
    title: 'e.g. Travel security checklist',
    url: 'Optional link',
    username: 'Owner / context',
    secret: 'Optional protected detail',
    notes: 'Use one line per checklist item. Example:\n[ ] Renew card\n[ ] Rotate API key\n[x] Backup codes saved'
  },
  Documents: {
    title: 'e.g. Insurance PDF, policy or certificate',
    url: '',
    username: '',
    secret: '',
    notes: 'Optional notes about this stored document...'
  },
  Pictures: {
    title: 'e.g. Passport photo, photo ID, driving licence',
    url: '',
    username: '',
    secret: '',
    notes: 'Optional notes about this encrypted picture...'
  },
  'Emergency Info': {
    title: 'e.g. Emergency access instruction',
    url: 'Optional link',
    username: 'Trusted person / reference',
    secret: 'Optional protected detail',
    notes: 'Clear instructions for trusted access later...'
  }
};

const starterItems = [
  {
    id: crypto.randomUUID(),
    title: 'Example Website Login',
    category: 'Passwords',
    favourite: true,
    payload: {
      url: 'https://example.com',
      username: 'brian@example.com',
      password: 'ChangeMe-Example-Only',
      notes: 'Demo item only. Delete this once your real vault is connected.'
    },
    updatedAt: new Date().toISOString()
  }
];

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  const chunkSize = 0x8000;
  for (let index = 0; index < binary.length; index += chunkSize) {
    const end = Math.min(index + chunkSize, binary.length);
    for (let offset = index; offset < end; offset += 1) {
      bytes[offset] = binary.charCodeAt(offset);
    }
  }
  return bytes.buffer;
}


function arrayBufferToBase64Url(buffer) {
  return arrayBufferToBase64(buffer).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToArrayBuffer(value) {
  const base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return base64ToArrayBuffer(padded);
}

function readBiometricUnlockRecord() {
  try {
    const raw = localStorage.getItem(BIOMETRIC_UNLOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.credentialId || !parsed?.wrappedMasterPassword || !parsed?.iv) return null;
    return parsed;
  } catch (error) {
    return null;
  }
}

function saveBiometricUnlockRecord(record) {
  localStorage.setItem(BIOMETRIC_UNLOCK_KEY, JSON.stringify(record));
}

function getSecureDevicePasswordReminderReason(record) {
  if (!record) return '';
  const lastPasswordCheck = Date.parse(record.lastPasswordCheckAt || record.createdAt || '');
  const ageMs = Number.isFinite(lastPasswordCheck) ? Date.now() - lastPasswordCheck : Infinity;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays >= SECURE_DEVICE_PASSWORD_CONFIRM_DAYS) return `It has been ${SECURE_DEVICE_PASSWORD_CONFIRM_DAYS} days since you last typed your password on this device.`;
  const unlockCount = Number(record.quickUnlockCount || 0);
  if (unlockCount >= SECURE_DEVICE_UNLOCK_COUNT_LIMIT) return `You have used secure device unlock ${unlockCount} times since last typing your password.`;
  return '';
}

function markSecureDevicePasswordConfirmed() {
  const record = readBiometricUnlockRecord();
  if (!record) return null;
  const nextRecord = {
    ...record,
    lastPasswordCheckAt: new Date().toISOString(),
    quickUnlockCount: 0,
    passwordReminderDismissedAt: new Date().toISOString()
  };
  saveBiometricUnlockRecord(nextRecord);
  return nextRecord;
}

function markSecureDeviceQuickUnlockUsed(record) {
  if (!record) return null;
  const nextRecord = {
    ...record,
    quickUnlockCount: Number(record.quickUnlockCount || 0) + 1,
    lastQuickUnlockAt: new Date().toISOString()
  };
  saveBiometricUnlockRecord(nextRecord);
  return nextRecord;
}

function isBiometricUnlockSupported() {
  return Boolean(window.isSecureContext && navigator.credentials && window.PublicKeyCredential && crypto?.subtle && window.indexedDB);
}

function openBiometricKeyDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BIOMETRIC_KEY_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BIOMETRIC_KEY_STORE)) db.createObjectStore(BIOMETRIC_KEY_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local biometric key store.'));
  });
}

async function saveBiometricDeviceKey(key) {
  const db = await openBiometricKeyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BIOMETRIC_KEY_STORE, 'readwrite');
    tx.objectStore(BIOMETRIC_KEY_STORE).put(key, BIOMETRIC_KEY_ID);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Could not save biometric device key.'));
    };
  });
}

async function readBiometricDeviceKey() {
  const db = await openBiometricKeyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BIOMETRIC_KEY_STORE, 'readonly');
    const request = tx.objectStore(BIOMETRIC_KEY_STORE).get(BIOMETRIC_KEY_ID);
    request.onsuccess = () => {
      db.close();
      resolve(request.result || null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error || new Error('Could not read biometric device key.'));
    };
  });
}

async function deleteBiometricDeviceKey() {
  if (!window.indexedDB) return;
  try {
    const db = await openBiometricKeyDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(BIOMETRIC_KEY_STORE, 'readwrite');
      tx.objectStore(BIOMETRIC_KEY_STORE).delete(BIOMETRIC_KEY_ID);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('Could not clear biometric device key.'));
      };
    });
  } catch (error) {
    // Best effort only. The localStorage record is still removed by the caller.
  }
}

async function wrapMasterPasswordForBiometric(masterPassword) {
  const deviceKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, deviceKey, new TextEncoder().encode(masterPassword));
  await saveBiometricDeviceKey(deviceKey);
  return {
    iv: arrayBufferToBase64(iv),
    wrappedMasterPassword: arrayBufferToBase64(encrypted)
  };
}

async function unwrapMasterPasswordForBiometric(record) {
  const deviceKey = await readBiometricDeviceKey();
  if (!deviceKey) throw new Error('This device no longer has the secure device unlock key.');
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(record.iv) },
    deviceKey,
    base64ToArrayBuffer(record.wrappedMasterPassword)
  );
  return new TextDecoder().decode(decrypted);
}

function friendlyBiometricName() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|Macintosh/i.test(ua)) return 'Face ID, Touch ID, passkey or device code';
  if (/Android/i.test(ua)) return 'Fingerprint, face unlock, passkey, PIN or device lock';
  if (/Windows/i.test(ua)) return 'Windows Hello, passkey or device PIN';
  return 'Passkey, biometric, PIN or device lock';
}

async function deriveKey(masterPassword, saltBase64) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(masterPassword), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: base64ToArrayBuffer(saltBase64), iterations: 250000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function readStoredVault() {
  const current = localStorage.getItem(STORAGE_KEY);
  if (current) return { raw: current, source: 'current' };
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy) return { raw: legacy, source: 'legacy' };
  return null;
}

function vaultOwnerBindingFromAccount(account = {}) {
  return {
    tenantId: String(account.tenantId || '').trim(),
    userId: String(account.userId || '').trim(),
    email: String(account.email || '').trim().toLowerCase(),
    accountName: String(account.accountName || account.tenantName || '').trim()
  };
}

function vaultOwnerBindingFromEnvelope(envelope = {}) {
  return {
    tenantId: String(envelope.ownerTenantId || '').trim(),
    userId: String(envelope.ownerUserId || '').trim(),
    email: String(envelope.ownerEmail || '').trim().toLowerCase(),
    accountName: String(envelope.ownerAccountName || '').trim()
  };
}

function hasCompleteVaultOwnerBinding(binding = {}) {
  return Boolean(binding.tenantId && binding.userId);
}

function vaultOwnerBindingsMatch(left = {}, right = {}) {
  if (!hasCompleteVaultOwnerBinding(left) || !hasCompleteVaultOwnerBinding(right)) return false;
  return left.tenantId === right.tenantId && left.userId === right.userId;
}

function applyVaultOwnerBinding(envelope, account = {}) {
  const existing = vaultOwnerBindingFromEnvelope(envelope || {});
  const requested = vaultOwnerBindingFromAccount(account);
  // Once a local encrypted vault is bound to an account, ordinary saves must never
  // silently move that vault to a different account context.
  const owner = hasCompleteVaultOwnerBinding(existing) ? existing : requested;
  if (!hasCompleteVaultOwnerBinding(owner)) return { ...envelope };
  return {
    ...envelope,
    ownerTenantId: owner.tenantId,
    ownerUserId: owner.userId,
    ownerEmail: owner.email || '',
    ownerAccountName: owner.accountName || ''
  };
}

function persistCurrentVaultOwnerBinding(account = {}) {
  const envelope = getLocalEnvelope();
  if (!envelope) return envelope;
  const next = applyVaultOwnerBinding(envelope, account);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

async function encryptVault(items, masterPassword, account = {}) {
  const previousEnvelope = getLocalEnvelope();
  let salt = localStorage.getItem(SALT_KEY) || localStorage.getItem(LEGACY_SALT_KEY);
  if (!salt) {
    salt = arrayBufferToBase64(crypto.getRandomValues(new Uint8Array(16)));
    localStorage.setItem(SALT_KEY, salt);
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(masterPassword, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(items));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const envelope = applyVaultOwnerBinding({
    version: VERSION,
    iv: arrayBufferToBase64(iv),
    salt,
    encrypted: arrayBufferToBase64(encrypted),
    updatedAt: new Date().toISOString(),
    cloudSnapshotId: '',
    baseCloudSnapshotId: previousEnvelope?.cloudSnapshotId || previousEnvelope?.baseCloudSnapshotId || ''
  }, account);
  localStorage.setItem(SALT_KEY, salt);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  return envelope;
}

async function decryptEnvelope(envelope, masterPassword) {
  const salt = envelope.salt || envelope.local_salt || envelope.localSalt;
  const iv = envelope.iv || envelope.local_iv || envelope.localIv;
  const encrypted = envelope.encrypted || envelope.encrypted_blob || envelope.encryptedBlob;
  if (!salt || !iv || !encrypted) throw new Error('Encrypted vault envelope is incomplete.');
  const key = await deriveKey(masterPassword, salt);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToArrayBuffer(iv) }, key, base64ToArrayBuffer(encrypted));
  return JSON.parse(new TextDecoder().decode(decrypted));
}


function tokenFromInviteUrl(inviteUrl) {
  try {
    const parsed = new URL(String(inviteUrl || ''), window.location.origin);
    return parsed.searchParams.get('token') || '';
  } catch {
    return '';
  }
}

const EMERGENCY_IMPORT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const EMERGENCY_IMPORT_CODE_LENGTH = 20;

function normaliseEmergencyImportCode(value) {
  const compact = String(value || '').toUpperCase().replace(/[^A-Z2-9]/g, '');
  return compact.slice(0, EMERGENCY_IMPORT_CODE_LENGTH);
}

function formatEmergencyImportCode(value) {
  const compact = normaliseEmergencyImportCode(value);
  return compact.match(/.{1,4}/g)?.join('-') || compact;
}

async function deriveEmergencyImportCode(inviteToken) {
  const token = String(inviteToken || '').trim();
  if (!token) throw new Error('Emergency invite token is missing.');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`Password-Encrypt emergency import v1:${token}`)));
  let compact = '';
  for (let index = 0; index < EMERGENCY_IMPORT_CODE_LENGTH; index += 1) compact += EMERGENCY_IMPORT_CODE_ALPHABET[digest[index] & 31];
  return formatEmergencyImportCode(compact);
}

async function emergencyImportCodeHash(value) {
  return sha256Hex(`Password-Encrypt emergency import code v1:${normaliseEmergencyImportCode(value)}`);
}

async function emergencyReleaseCredential(envelope, credential, credentialType = 'invite-token') {
  if (String(envelope?.keyMode || '') === 'emergency-import-code-v1') {
    return credentialType === 'import-code' ? formatEmergencyImportCode(credential) : deriveEmergencyImportCode(credential);
  }
  return String(credential || '');
}

async function encryptEmergencyReleasePackage(packageData, inviteToken) {
  const token = String(inviteToken || '').trim();
  if (!token) throw new Error('Emergency invite token is missing.');
  const importCode = await deriveEmergencyImportCode(token);
  const salt = arrayBufferToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(importCode, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(packageData));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    version: VERSION,
    packageVersion: '2',
    keyMode: 'emergency-import-code-v1',
    algorithm: 'AES-GCM/PBKDF2-SHA256',
    salt,
    iv: arrayBufferToBase64(iv),
    encrypted: arrayBufferToBase64(encrypted),
    updatedAt: new Date().toISOString()
  };
}

async function decryptEmergencyReleasePackage(envelope, credential, credentialType = 'invite-token') {
  if (!envelope?.encrypted || !envelope?.salt || !envelope?.iv) throw new Error('Emergency package is not available yet.');
  const releaseCredential = await emergencyReleaseCredential(envelope, credential, credentialType);
  const key = await deriveKey(releaseCredential, envelope.salt);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToArrayBuffer(envelope.iv) }, key, base64ToArrayBuffer(envelope.encrypted));
  return JSON.parse(new TextDecoder().decode(decrypted));
}

async function encryptEmergencyDocumentData(dataUrl, inviteToken) {
  const token = String(inviteToken || '').trim();
  if (!token) throw new Error('Emergency invite token is missing.');
  const importCode = await deriveEmergencyImportCode(token);
  const salt = arrayBufferToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(importCode, salt);
  const encoded = new TextEncoder().encode(String(dataUrl || ''));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return { encryptedBlob: arrayBufferToBase64(encrypted), localSalt: salt, localIv: arrayBufferToBase64(iv), encryptionScope: 'emergency_import_code_v1' };
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || '')));
  return Array.from(new Uint8Array(digest)).map((part) => part.toString(16).padStart(2, '0')).join('');
}

function emergencyPackageRelevantItems(plan, vaultItems) {
  const scope = String(plan?.accessScope || 'Emergency Info folder only');
  const visibleItems = getVisibleVaultItems(vaultItems);
  return scope === 'Full vault access'
    ? visibleItems
    : visibleItems.filter((item) => String(item?.category || '') === 'Emergency Info');
}

function emergencyPackageFingerprintItem(item) {
  const file = item?.payload?.file || null;
  const isStoredFile = [DOCUMENTS_CATEGORY, PICTURES_CATEGORY].includes(item?.category) && file;
  const fileMetadata = isStoredFile
    ? {
        name: file.name || '',
        type: file.type || '',
        extension: file.extension || '',
        size: Number(file.size || 0),
        blobKind: item?.category === PICTURES_CATEGORY ? 'picture' : 'document',
        storedExternally: Boolean(file.storedExternally),
        blobId: file.blobId || file.storageId || file.objectKey || file.path || file.externalDocumentId || ''
      }
    : null;
  return {
    id: item?.id || '',
    title: item?.title || '',
    category: item?.category || '',
    favourite: Boolean(item?.favourite),
    updatedAt: item?.updatedAt || '',
    payload: fileMetadata ? { file: fileMetadata } : (item?.payload || {})
  };
}

async function buildEmergencyPackageSourceFingerprint(plan, vaultItems) {
  const source = {
    accessScope: String(plan?.accessScope || 'Emergency Info folder only'),
    enabled: plan?.emergencyPackageEnabled !== false,
    title: String(plan?.emergencyPackageTitle || ''),
    message: String(plan?.emergencyPackageMessage || ''),
    contacts: String(plan?.emergencyPackageContacts || ''),
    documents: String(plan?.emergencyPackageDocuments || ''),
    checklist: String(plan?.emergencyPackageChecklist || ''),
    instructions: String(plan?.instructions || ''),
    items: emergencyPackageRelevantItems(plan, vaultItems).map(emergencyPackageFingerprintItem)
  };
  return sha256Hex(JSON.stringify(source));
}

async function buildEmergencyDocumentSourceFingerprint(item) {
  const file = item?.payload?.file || {};
  return sha256Hex(JSON.stringify({
    id: item?.id || '',
    title: item?.title || '',
    updatedAt: item?.updatedAt || '',
    file: {
      name: file.name || '',
      type: file.type || '',
      extension: file.extension || '',
      size: Number(file.size || 0),
      storedExternally: Boolean(file.storedExternally),
      blobId: file.blobId || file.storageId || file.objectKey || file.path || ''
    }
  }));
}

function buildEmergencyReleasePackage(plan, vaultItems, account, releasedDocuments = []) {
  const scope = String(plan?.accessScope || 'Emergency Info folder only');
  const fullAccess = scope === 'Full vault access';
  const visibleItems = getVisibleVaultItems(vaultItems);
  const includedItems = fullAccess
    ? visibleItems
    : visibleItems.filter((item) => String(item?.category || '') === 'Emergency Info');
  return {
    version: VERSION,
    preparedAt: new Date().toISOString(),
    ownerName: account?.displayName || account?.accountName || 'Password-Encrypt user',
    contactName: plan?.contactName || '',
    releaseScope: scope,
    fullVaultAccess: fullAccess,
    title: plan?.emergencyPackageTitle || (fullAccess ? 'Full vault emergency access' : 'Emergency Info package'),
    message: plan?.emergencyPackageMessage || '',
    importantContacts: plan?.emergencyPackageContacts || '',
    documentsAndLocations: plan?.emergencyPackageDocuments || '',
    checklist: plan?.emergencyPackageChecklist || '',
    ownerInstructions: plan?.instructions || '',
    itemCount: includedItems.length,
    items: includedItems.map((item) => ({
      id: item.id,
      title: item.title || 'Untitled',
      category: item.category || 'Passwords',
      favourite: Boolean(item.favourite),
      payload: item.payload || {},
      updatedAt: item.updatedAt || ''
    })),
    releasedDocuments: Array.isArray(releasedDocuments) ? releasedDocuments : [],
    documentCount: Array.isArray(releasedDocuments) ? releasedDocuments.filter((entry) => String(entry?.sourceCategory || DOCUMENTS_CATEGORY) !== PICTURES_CATEGORY).length : 0,
    pictureCount: Array.isArray(releasedDocuments) ? releasedDocuments.filter((entry) => String(entry?.sourceCategory || '') === PICTURES_CATEGORY).length : 0,
    notes: fullAccess
      ? 'The owner selected Full vault access. Password-Encrypt kept this prepared package updated from the owner’s unlocked vault while the Trusted Person arrangement remained active, then froze this release snapshot when the waiting period completed.'
      : 'The owner selected Emergency Info only. This package includes Emergency Info records and the owner-written emergency package fields.'
  };
}


function sortEmergencyReleasedItems(items = []) {
  const rank = (value) => {
    const first = String(value || '').trim().charAt(0);
    if (/^[A-Za-z]$/.test(first)) return 0;
    if (/^[0-9]$/.test(first)) return 1;
    return 2;
  };
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const titleA = String(a?.title || 'Untitled').trim();
    const titleB = String(b?.title || 'Untitled').trim();
    const rankDiff = rank(titleA) - rank(titleB);
    if (rankDiff) return rankDiff;
    return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
  });
}

function sortEmergencyFolderNames(folderNames = []) {
  const rank = (value) => {
    const first = String(value || '').trim().charAt(0);
    if (/^[A-Za-z]$/.test(first)) return 0;
    if (/^[0-9]$/.test(first)) return 1;
    return 2;
  };
  return [...folderNames].sort((a, b) => {
    const nameA = String(a || '').trim();
    const nameB = String(b || '').trim();
    const rankDiff = rank(nameA) - rank(nameB);
    if (rankDiff) return rankDiff;
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
  });
}

function buildEmergencyReleaseFolders(items = [], releasedDocuments = []) {
  const grouped = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const folderName = String(item?.category || 'Other').trim() || 'Other';
    if (!grouped.has(folderName)) grouped.set(folderName, []);
    grouped.get(folderName).push(item);
  }

  grouped.delete(DOCUMENTS_CATEGORY);
  grouped.delete(PICTURES_CATEGORY);
  const sortFiles = (list = [], fallback = 'File') => [...list].sort((a, b) => {
    const nameA = String(a?.fileName || a?.title || fallback).trim();
    const nameB = String(b?.fileName || b?.title || fallback).trim();
    const firstRank = (value) => /^[A-Za-z]$/.test(value.charAt(0)) ? 0 : /^[0-9]$/.test(value.charAt(0)) ? 1 : 2;
    const rankDiff = firstRank(nameA) - firstRank(nameB);
    if (rankDiff) return rankDiff;
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
  });
  const files = Array.isArray(releasedDocuments) ? releasedDocuments : [];
  const documents = sortFiles(files.filter((entry) => String(entry?.sourceCategory || DOCUMENTS_CATEGORY) !== PICTURES_CATEGORY), 'Document');
  const pictures = sortFiles(files.filter((entry) => String(entry?.sourceCategory || '') === PICTURES_CATEGORY), 'Picture');
  const folders = [{ name: DOCUMENTS_CATEGORY, items: [], documents }];
  if (pictures.length || grouped.has(PICTURES_CATEGORY)) folders.push({ name: PICTURES_CATEGORY, items: [], documents: pictures });

  for (const folderName of sortEmergencyFolderNames([...grouped.keys()])) {
    folders.push({ name: folderName, items: sortEmergencyReleasedItems(grouped.get(folderName) || []), documents: [] });
  }
  return folders;
}

function emergencyPackagePlainText(packageData, releaseExpiresAt = '') {
  const lines = [];
  const pushSection = (title, value) => {
    const text = String(value || '').trim();
    if (!text) return;
    lines.push('', title.toUpperCase(), text);
  };
  lines.push('PASSWORD-ENCRYPT EMERGENCY PACKAGE');
  lines.push(`Package: ${packageData?.title || 'Emergency package'}`);
  if (packageData?.ownerName) lines.push(`Prepared by: ${packageData.ownerName}`);
  if (packageData?.preparedAt) lines.push(`Prepared: ${formatAppDate(packageData.preparedAt, true)}`);
  if (packageData?.releaseScope) lines.push(`Access scope: ${packageData.releaseScope}`);
  if (releaseExpiresAt) lines.push(`Secure link available until: ${formatAppDate(releaseExpiresAt, true)}`);
  pushSection('Emergency message', packageData?.message);
  pushSection('Important contacts', packageData?.importantContacts);
  pushSection('Documents and locations', packageData?.documentsAndLocations);
  pushSection('Checklist', packageData?.checklist);
  pushSection('Owner instructions', packageData?.ownerInstructions);
  const releasedItems = sortEmergencyReleasedItems(packageData?.items || []);
  if (releasedItems.length) {
    lines.push('', 'RELEASED VAULT RECORDS');
    for (const item of releasedItems) {
      lines.push('', `${item.title || 'Untitled'}${item.category ? ` [${item.category}]` : ''}`);
      for (const [key, value] of Object.entries(item.payload || {})) {
        if (value === undefined || value === null || value === '' || typeof value === 'object') continue;
        const label = String(key).replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
        lines.push(`${label}: ${String(value)}`);
      }
    }
  }
  const releasedDocuments = Array.isArray(packageData?.releasedDocuments) ? packageData.releasedDocuments : [];
  if (releasedDocuments.length) {
    lines.push('', 'RELEASED DOCUMENTS AND PICTURES');
    for (const documentMeta of releasedDocuments) {
      const sourceCategory = String(documentMeta?.sourceCategory || DOCUMENTS_CATEGORY);
      lines.push(`${documentMeta.fileName || documentMeta.title || (sourceCategory === PICTURES_CATEGORY ? 'Picture' : 'Document')} [${sourceCategory}]${documentMeta.fileSize ? ` (${formatFileSize(documentMeta.fileSize)})` : ''}`);
    }
  }
  if (packageData?.notes) pushSection('Package note', packageData.notes);
  lines.push('', 'SECURITY NOTE', 'This downloaded file contains sensitive information in readable form. Store it somewhere safe and private.');
  return lines.join('\r\n');
}

function downloadEmergencyText(packageData, releaseExpiresAt = '') {
  const text = emergencyPackagePlainText(packageData, releaseExpiresAt);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Password-Encrypt-Emergency-Package.txt';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function crc32(bytes) {
  let crc = 0 ^ -1;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ -1) >>> 0;
}

function concatBytes(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function uint16(value) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function uint32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function makeStoreZip(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
    const crc = crc32(data);
    const local = concatBytes([
      uint32(0x04034b50), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0),
      uint32(crc), uint32(data.length), uint32(data.length), uint16(name.length), uint16(0), name, data
    ]);
    localParts.push(local);
    const central = concatBytes([
      uint32(0x02014b50), uint16(20), uint16(20), uint16(0), uint16(0), uint16(0), uint16(0),
      uint32(crc), uint32(data.length), uint32(data.length), uint16(name.length), uint16(0), uint16(0),
      uint16(0), uint16(0), uint32(0), uint32(offset), name
    ]);
    centralParts.push(central);
    offset += local.length;
  }
  const central = concatBytes(centralParts);
  const end = concatBytes([
    uint32(0x06054b50), uint16(0), uint16(0), uint16(entries.length), uint16(entries.length),
    uint32(central.length), uint32(offset), uint16(0)
  ]);
  return concatBytes([...localParts, central, end]);
}

function xmlEscape(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function emergencyDocxBytes(packageData, releaseExpiresAt = '') {
  const lines = emergencyPackagePlainText(packageData, releaseExpiresAt).split(/\r?\n/);
  const paragraphs = lines.map((line) => `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(line || ' ')}</w:t></w:r></w:p>`).join('');
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  return makeStoreZip([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rels },
    { name: 'word/document.xml', data: documentXml }
  ]);
}

function downloadEmergencyDocx(packageData, releaseExpiresAt = '') {
  const zipBytes = emergencyDocxBytes(packageData, releaseExpiresAt);
  const blob = new Blob([zipBytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Password-Encrypt-Emergency-Package.docx';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function decryptVault(masterPassword) {
  const stored = readStoredVault();
  if (!stored) return null;
  const parsed = JSON.parse(stored.raw);
  const items = await decryptEnvelope(parsed, masterPassword);
  if (stored.source === 'legacy') await encryptVault(items, masterPassword);
  return items;
}

function getLocalEnvelope() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function safeTimestamp(value) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareLocalAndCloudVault(localEnvelope, cloudSnapshot) {
  if (!localEnvelope) return 'cloud-newer-clean';
  const cloudId = String(cloudSnapshot?.id || '');
  const localCloudId = String(localEnvelope.cloudSnapshotId || '');
  const localBaseId = String(localEnvelope.baseCloudSnapshotId || '');

  if (localCloudId && localCloudId === cloudId) return 'same';
  if (localCloudId && localCloudId !== cloudId) return 'cloud-newer-clean';
  if (!localCloudId && localBaseId && localBaseId === cloudId) return 'local-newer';
  if (!localCloudId && localBaseId && localBaseId !== cloudId) return 'conflict';
  if (!localCloudId && !localBaseId && cloudId) return 'conflict';
  return 'local-newer';
}

function cloudSnapshotMatchesEnvelope(snapshot, envelope) {
  if (!snapshot || !envelope) return false;
  return String(snapshot.encrypted_blob || '') === String(envelope.encrypted || '')
    && String(snapshot.local_salt || '') === String(envelope.salt || '')
    && String(snapshot.local_iv || '') === String(envelope.iv || '');
}

function storeCloudSnapshotLocally(snapshot, account = {}) {
  const envelope = applyVaultOwnerBinding({
    version: VERSION,
    iv: snapshot.local_iv,
    salt: snapshot.local_salt,
    encrypted: snapshot.encrypted_blob,
    updatedAt: snapshot.client_updated_at || snapshot.created_at || new Date().toISOString(),
    cloudSnapshotId: snapshot.id || '',
    baseCloudSnapshotId: snapshot.id || ''
  }, account);
  localStorage.setItem(SALT_KEY, envelope.salt);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  return envelope;
}

function readPushBinding() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PUSH_BINDING_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function savePushBinding(tenantId, userId) {
  try { localStorage.setItem(PUSH_BINDING_KEY, JSON.stringify({ tenantId: String(tenantId || ''), userId: String(userId || '') })); }
  catch { /* Notification delivery must not depend on local storage being writable. */ }
}

function clearPushBinding() {
  try { localStorage.removeItem(PUSH_BINDING_KEY); }
  catch { /* Ignore restricted local storage contexts. */ }
}

function pushPromptSuppressionKey(account = {}) {
  const tenantId = String(account?.tenantId || '').trim() || 'unknown-tenant';
  const userId = String(account?.userId || '').trim() || 'unknown-user';
  const deviceId = typeof getSyncDeviceId === 'function' ? getSyncDeviceId() : 'browser';
  return `${PUSH_PROMPT_SUPPRESSION_KEY}:${tenantId}:${userId}:${deviceId}`;
}

function isPushActivationPromptSuppressed(account = {}) {
  try { return localStorage.getItem(pushPromptSuppressionKey(account)) === '1'; }
  catch { return false; }
}

function suppressPushActivationPrompt(account = {}) {
  try { localStorage.setItem(pushPromptSuppressionKey(account), '1'); }
  catch { /* Restricted storage must not block normal app use. */ }
}

function pushNotificationsSupported() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window;
}

function pushPermissionState() {
  return pushNotificationsSupported() ? Notification.permission : 'unsupported';
}

function urlBase64ToUint8Array(value) {
  const normal = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normal + '='.repeat((4 - (normal.length % 4)) % 4);
  const raw = window.atob(padded);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

async function postJson(url, payload, options = {}) {
  const csrfToken = sessionStorage.getItem('mp_customer_csrf') || '';
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'x-mp-request': '1',
      ...(csrfToken ? { 'x-mp-csrf': csrfToken } : {})
    },
    signal: options.signal,
    body: JSON.stringify(payload)
  });
  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = { ok: false, message: 'Function returned a non-JSON response.' };
  }
  if (data?.csrfToken) sessionStorage.setItem('mp_customer_csrf', data.csrfToken);
  if (response.status === 401) sessionStorage.removeItem('mp_customer_csrf');
  if (!response.ok) {
    return {
      ...data,
      ok: false,
      httpStatus: response.status,
      message: data.message || `Function failed with HTTP ${response.status}.`
    };
  }
  return data;
}

let lastClientErrorReportAt = 0;
async function reportClientRuntimeError(payload) {
  if (Date.now() - lastClientErrorReportAt < 60000) return;
  lastClientErrorReportAt = Date.now();
  try {
    await postJson('/.netlify/functions/client-error-report', {
      kind: payload.kind || 'client_runtime_error',
      errorName: String(payload.errorName || 'Error').slice(0, 100),
      script: String(payload.script || '').slice(0, 240),
      line: Number(payload.line || 0),
      column: Number(payload.column || 0),
      route: window.location.pathname,
      online: navigator.onLine
    });
  } catch {
    // Operational reporting must never interfere with vault use.
  }
}

window.addEventListener('error', (event) => {
  reportClientRuntimeError({
    kind: 'window_error', errorName: event.error?.name || 'Error', script: event.filename || '', line: event.lineno || 0, column: event.colno || 0
  });
});
window.addEventListener('unhandledrejection', (event) => {
  reportClientRuntimeError({ kind: 'unhandled_rejection', errorName: event.reason?.name || typeof event.reason || 'UnhandledRejection' });
});

function shortId(value) {
  if (!value) return '';
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
}

function maskEmail(value) {
  const email = String(value || '').trim();
  if (!email || !email.includes('@')) return '';
  const [name, domain] = email.split('@');
  const safeName = name.length <= 2 ? `${name.slice(0, 1)}***` : `${name.slice(0, 2)}***${name.slice(-1)}`;
  return `${safeName}@${domain}`;
}

function maskPhone(value) {
  const phone = String(value || '').trim();
  if (!phone) return '';
  return phone.length <= 6 ? `${phone.slice(0, 2)}***` : `${phone.slice(0, 4)}***${phone.slice(-3)}`;
}

const phoneCountryCodes = [
  // Popular first
  { code: '+44', iso: 'gb', name: 'United Kingdom', popular: true },
  { code: '+1', iso: 'us', name: 'United States', popular: true },
  { code: '+1', iso: 'ca', name: 'Canada', popular: true },
  { code: '+254', iso: 'ke', name: 'Kenya', popular: true },
  { code: '+27', iso: 'za', name: 'South Africa', popular: true },
  { code: '+61', iso: 'au', name: 'Australia', popular: true },
  { code: '+64', iso: 'nz', name: 'New Zealand', popular: true },
  { code: '+353', iso: 'ie', name: 'Ireland', popular: true },
  { code: '+33', iso: 'fr', name: 'France', popular: true },
  { code: '+49', iso: 'de', name: 'Germany', popular: true },
  { code: '+31', iso: 'nl', name: 'Netherlands', popular: true },
  { code: '+34', iso: 'es', name: 'Spain', popular: true },
  { code: '+351', iso: 'pt', name: 'Portugal', popular: true },
  { code: '+39', iso: 'it', name: 'Italy', popular: true },
  { code: '+32', iso: 'be', name: 'Belgium', popular: true },
  { code: '+41', iso: 'ch', name: 'Switzerland', popular: true },
  { code: '+46', iso: 'se', name: 'Sweden', popular: true },
  { code: '+47', iso: 'no', name: 'Norway', popular: true },
  { code: '+45', iso: 'dk', name: 'Denmark', popular: true },
  { code: '+358', iso: 'fi', name: 'Finland', popular: true },
  { code: '+234', iso: 'ng', name: 'Nigeria', popular: true },
  { code: '+233', iso: 'gh', name: 'Ghana', popular: true },
  { code: '+255', iso: 'tz', name: 'Tanzania', popular: true },
  { code: '+256', iso: 'ug', name: 'Uganda', popular: true },
  { code: '+250', iso: 'rw', name: 'Rwanda', popular: true },
  { code: '+260', iso: 'zm', name: 'Zambia', popular: true },
  { code: '+263', iso: 'zw', name: 'Zimbabwe', popular: true },
  { code: '+267', iso: 'bw', name: 'Botswana', popular: true },
  { code: '+264', iso: 'na', name: 'Namibia', popular: true },
  { code: '+230', iso: 'mu', name: 'Mauritius', popular: true },
  { code: '+251', iso: 'et', name: 'Ethiopia', popular: true },
  { code: '+20', iso: 'eg', name: 'Egypt', popular: true },
  { code: '+212', iso: 'ma', name: 'Morocco', popular: true },
  // Searchable rest of world
  { code: '+93', iso: 'af', name: 'Afghanistan' },
  { code: '+355', iso: 'al', name: 'Albania' },
  { code: '+213', iso: 'dz', name: 'Algeria' },
  { code: '+376', iso: 'ad', name: 'Andorra' },
  { code: '+244', iso: 'ao', name: 'Angola' },
  { code: '+54', iso: 'ar', name: 'Argentina' },
  { code: '+374', iso: 'am', name: 'Armenia' },
  { code: '+43', iso: 'at', name: 'Austria' },
  { code: '+994', iso: 'az', name: 'Azerbaijan' },
  { code: '+973', iso: 'bh', name: 'Bahrain' },
  { code: '+880', iso: 'bd', name: 'Bangladesh' },
  { code: '+375', iso: 'by', name: 'Belarus' },
  { code: '+501', iso: 'bz', name: 'Belize' },
  { code: '+229', iso: 'bj', name: 'Benin' },
  { code: '+975', iso: 'bt', name: 'Bhutan' },
  { code: '+591', iso: 'bo', name: 'Bolivia' },
  { code: '+387', iso: 'ba', name: 'Bosnia and Herzegovina' },
  { code: '+55', iso: 'br', name: 'Brazil' },
  { code: '+359', iso: 'bg', name: 'Bulgaria' },
  { code: '+226', iso: 'bf', name: 'Burkina Faso' },
  { code: '+257', iso: 'bi', name: 'Burundi' },
  { code: '+855', iso: 'kh', name: 'Cambodia' },
  { code: '+237', iso: 'cm', name: 'Cameroon' },
  { code: '+238', iso: 'cv', name: 'Cape Verde' },
  { code: '+236', iso: 'cf', name: 'Central African Republic' },
  { code: '+235', iso: 'td', name: 'Chad' },
  { code: '+56', iso: 'cl', name: 'Chile' },
  { code: '+86', iso: 'cn', name: 'China' },
  { code: '+57', iso: 'co', name: 'Colombia' },
  { code: '+269', iso: 'km', name: 'Comoros' },
  { code: '+242', iso: 'cg', name: 'Congo' },
  { code: '+243', iso: 'cd', name: 'Congo, Democratic Republic' },
  { code: '+506', iso: 'cr', name: 'Costa Rica' },
  { code: '+225', iso: 'ci', name: 'Côte d’Ivoire' },
  { code: '+385', iso: 'hr', name: 'Croatia' },
  { code: '+357', iso: 'cy', name: 'Cyprus' },
  { code: '+420', iso: 'cz', name: 'Czech Republic' },
  { code: '+253', iso: 'dj', name: 'Djibouti' },
  { code: '+593', iso: 'ec', name: 'Ecuador' },
  { code: '+503', iso: 'sv', name: 'El Salvador' },
  { code: '+240', iso: 'gq', name: 'Equatorial Guinea' },
  { code: '+291', iso: 'er', name: 'Eritrea' },
  { code: '+372', iso: 'ee', name: 'Estonia' },
  { code: '+268', iso: 'sz', name: 'Eswatini' },
  { code: '+679', iso: 'fj', name: 'Fiji' },
  { code: '+241', iso: 'ga', name: 'Gabon' },
  { code: '+220', iso: 'gm', name: 'Gambia' },
  { code: '+995', iso: 'ge', name: 'Georgia' },
  { code: '+30', iso: 'gr', name: 'Greece' },
  { code: '+502', iso: 'gt', name: 'Guatemala' },
  { code: '+224', iso: 'gn', name: 'Guinea' },
  { code: '+245', iso: 'gw', name: 'Guinea-Bissau' },
  { code: '+592', iso: 'gy', name: 'Guyana' },
  { code: '+504', iso: 'hn', name: 'Honduras' },
  { code: '+852', iso: 'hk', name: 'Hong Kong' },
  { code: '+36', iso: 'hu', name: 'Hungary' },
  { code: '+354', iso: 'is', name: 'Iceland' },
  { code: '+91', iso: 'in', name: 'India' },
  { code: '+62', iso: 'id', name: 'Indonesia' },
  { code: '+972', iso: 'il', name: 'Israel' },
  { code: '+81', iso: 'jp', name: 'Japan' },
  { code: '+962', iso: 'jo', name: 'Jordan' },
  { code: '+7', iso: 'kz', name: 'Kazakhstan' },
  { code: '+965', iso: 'kw', name: 'Kuwait' },
  { code: '+996', iso: 'kg', name: 'Kyrgyzstan' },
  { code: '+856', iso: 'la', name: 'Laos' },
  { code: '+371', iso: 'lv', name: 'Latvia' },
  { code: '+961', iso: 'lb', name: 'Lebanon' },
  { code: '+266', iso: 'ls', name: 'Lesotho' },
  { code: '+231', iso: 'lr', name: 'Liberia' },
  { code: '+218', iso: 'ly', name: 'Libya' },
  { code: '+370', iso: 'lt', name: 'Lithuania' },
  { code: '+352', iso: 'lu', name: 'Luxembourg' },
  { code: '+853', iso: 'mo', name: 'Macau' },
  { code: '+261', iso: 'mg', name: 'Madagascar' },
  { code: '+265', iso: 'mw', name: 'Malawi' },
  { code: '+60', iso: 'my', name: 'Malaysia' },
  { code: '+960', iso: 'mv', name: 'Maldives' },
  { code: '+223', iso: 'ml', name: 'Mali' },
  { code: '+356', iso: 'mt', name: 'Malta' },
  { code: '+222', iso: 'mr', name: 'Mauritania' },
  { code: '+52', iso: 'mx', name: 'Mexico' },
  { code: '+373', iso: 'md', name: 'Moldova' },
  { code: '+976', iso: 'mn', name: 'Mongolia' },
  { code: '+382', iso: 'me', name: 'Montenegro' },
  { code: '+258', iso: 'mz', name: 'Mozambique' },
  { code: '+95', iso: 'mm', name: 'Myanmar' },
  { code: '+977', iso: 'np', name: 'Nepal' },
  { code: '+505', iso: 'ni', name: 'Nicaragua' },
  { code: '+227', iso: 'ne', name: 'Niger' },
  { code: '+389', iso: 'mk', name: 'North Macedonia' },
  { code: '+968', iso: 'om', name: 'Oman' },
  { code: '+92', iso: 'pk', name: 'Pakistan' },
  { code: '+507', iso: 'pa', name: 'Panama' },
  { code: '+675', iso: 'pg', name: 'Papua New Guinea' },
  { code: '+595', iso: 'py', name: 'Paraguay' },
  { code: '+51', iso: 'pe', name: 'Peru' },
  { code: '+63', iso: 'ph', name: 'Philippines' },
  { code: '+48', iso: 'pl', name: 'Poland' },
  { code: '+974', iso: 'qa', name: 'Qatar' },
  { code: '+40', iso: 'ro', name: 'Romania' },
  { code: '+966', iso: 'sa', name: 'Saudi Arabia' },
  { code: '+221', iso: 'sn', name: 'Senegal' },
  { code: '+381', iso: 'rs', name: 'Serbia' },
  { code: '+248', iso: 'sc', name: 'Seychelles' },
  { code: '+232', iso: 'sl', name: 'Sierra Leone' },
  { code: '+65', iso: 'sg', name: 'Singapore' },
  { code: '+421', iso: 'sk', name: 'Slovakia' },
  { code: '+386', iso: 'si', name: 'Slovenia' },
  { code: '+252', iso: 'so', name: 'Somalia' },
  { code: '+211', iso: 'ss', name: 'South Sudan' },
  { code: '+82', iso: 'kr', name: 'South Korea' },
  { code: '+94', iso: 'lk', name: 'Sri Lanka' },
  { code: '+249', iso: 'sd', name: 'Sudan' },
  { code: '+597', iso: 'sr', name: 'Suriname' },
  { code: '+886', iso: 'tw', name: 'Taiwan' },
  { code: '+992', iso: 'tj', name: 'Tajikistan' },
  { code: '+66', iso: 'th', name: 'Thailand' },
  { code: '+228', iso: 'tg', name: 'Togo' },
  { code: '+216', iso: 'tn', name: 'Tunisia' },
  { code: '+90', iso: 'tr', name: 'Turkey' },
  { code: '+993', iso: 'tm', name: 'Turkmenistan' },
  { code: '+971', iso: 'ae', name: 'United Arab Emirates' },
  { code: '+598', iso: 'uy', name: 'Uruguay' },
  { code: '+998', iso: 'uz', name: 'Uzbekistan' },
  { code: '+58', iso: 've', name: 'Venezuela' },
  { code: '+84', iso: 'vn', name: 'Vietnam' },
  { code: '+967', iso: 'ye', name: 'Yemen' }
];

const defaultAccount = {
  email: '',
  phoneCountryCode: '+254',
  phoneNumber: '',
  phoneE164: '',
  phoneCountryIso: 'ke',
  displayName: 'Brian',
  tenantName: 'Brian Private Vault',
  tenantId: '',
  userId: '',
  otpStatus: 'Recovery verification ready',
  accountVerified: false,
  accountName: 'Brian Private Vault',
  planCode: 'founder_private',
  planStatus: 'founder_active',
  accountStatus: 'active',
  tenantRole: 'founder_first_tenant'
};

function cleanDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normaliseCountryCode(value) {
  const digits = cleanDigits(value);
  return digits ? `+${digits}` : '';
}

function normaliseLocalPhone(value) {
  return cleanDigits(value).replace(/^0+/, '');
}

function buildPhoneE164(countryCode, phoneNumber) {
  const code = normaliseCountryCode(countryCode);
  const local = normaliseLocalPhone(phoneNumber);
  return code && local ? `${code}${local}` : '';
}

function getCountryByCode(countryCode, countryIso = '') {
  const code = normaliseCountryCode(countryCode || '+254');
  const iso = String(countryIso || '').toLowerCase();
  if (iso) {
    const exact = phoneCountryCodes.find((country) => country.code === code && country.iso === iso);
    if (exact) return exact;
  }
  return phoneCountryCodes.find((country) => country.code === code) || phoneCountryCodes[0];
}

function countryFlagPath(country) {
  const iso = String(country?.iso || '').toLowerCase();
  if (!iso) return '';
  return `https://flagcdn.com/40x30/${iso}.png`;
}

function countryFlagPathFromCode(countryCode, countryIso = '') {
  return countryFlagPath(getCountryByCode(countryCode, countryIso));
}

function CountryPicker({ countryCode, countryIso, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = getCountryByCode(countryCode, countryIso);
  const filteredCountries = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return phoneCountryCodes.filter((country) => country.popular);
    return phoneCountryCodes.filter((country) =>
      `${country.name} ${country.code} ${country.iso}`.toLowerCase().includes(term)
    );
  }, [search]);

  function chooseCountry(country) {
    onChange(country);
    setOpen(false);
    setSearch('');
  }

  useEffect(() => {
    if (!open) return undefined;
    window.requestAnimationFrame(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    });
    const closeForAppBack = () => {
      setOpen(false);
      setSearch('');
    };
    window.addEventListener('my-passwords-close-overlay', closeForAppBack);
    return () => window.removeEventListener('my-passwords-close-overlay', closeForAppBack);
  }, [open]);

  return (
    <div className="country-picker">
      <button
        type="button"
        className="country-picker-trigger"
        onClick={() => setOpen(true)}
        aria-label={`Choose country. Current country: ${selected.name}`}
      >
        <img className="phone-flag-img" src={countryFlagPathFromCode(selected.code, selected.iso)} alt="" aria-hidden="true" />
        <span className="country-picker-chevron" aria-hidden="true">⌄</span>
      </button>
      {open && createPortal(
        <div className="country-picker-layer" role="dialog" aria-modal="true" aria-label="Choose mobile country code">
          <button type="button" className="country-picker-backdrop" aria-label="Close country picker" onClick={() => setOpen(false)} />
          <div className="country-picker-panel">
            <div className="country-picker-header">
              <div>
                <strong>Choose country</strong>
                <span>{search.trim() ? 'Search results' : 'Popular countries. Search for more.'}</span>
              </div>
              <button type="button" className="country-picker-close" onClick={() => setOpen(false)} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="country-search-box">
              <Search size={17} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search country or code" />
            </div>
            <div className="country-list" role="listbox">
              {filteredCountries.map((country) => (
                <button
                  key={`${country.iso}-${country.code}`}
                  type="button"
                  className={country.code === selected.code ? 'country-option selected' : 'country-option'}
                  onClick={() => chooseCountry(country)}
                  role="option"
                  aria-selected={country.code === selected.code}
                >
                  <img className="country-option-flag" src={countryFlagPath(country)} alt="" aria-hidden="true" />
                  <span>{country.name}</span>
                  <code>{country.code}</code>
                </button>
              ))}
              {!filteredCountries.length && <div className="country-empty">No country found. Try the dialling code, for example +254.</div>}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function readSavedAccount() {
  const legacy = (() => {
    try { return JSON.parse(localStorage.getItem(BOOTSTRAP_KEY)) || {}; }
    catch { return {}; }
  })();
  const saved = (() => {
    try { return JSON.parse(localStorage.getItem(ACCOUNT_KEY)) || {}; }
    catch { return {}; }
  })();
  const merged = { ...defaultAccount, ...legacy, ...saved };
  const phoneCountryCode = normaliseCountryCode(merged.phoneCountryCode || merged.countryCode || '+254') || '+254';
  const phoneNumber = String(merged.phoneNumber || merged.mobile || '').trim();
  return {
    ...merged,
    phoneCountryCode,
    phoneNumber,
    phoneE164: merged.phoneE164 || buildPhoneE164(phoneCountryCode, phoneNumber)
  };
}

function validateAccountIdentity(account) {
  const email = String(account.email || '').trim().toLowerCase();
  const phoneCountryCode = normaliseCountryCode(account.phoneCountryCode || '+254');
  const phoneNumber = normaliseLocalPhone(account.phoneNumber || '');
  const phoneE164 = buildPhoneE164(phoneCountryCode, phoneNumber);
  if (!phoneCountryCode || !phoneNumber || !phoneE164) {
    return { ok: false, message: 'Enter your mobile number with the country code.' };
  }
  if (email && !email.includes('@')) {
    return { ok: false, message: 'The backup email address does not look valid.' };
  }
  return { ok: true, email, phoneCountryCode, phoneNumber, phoneE164 };
}



function isFolderMetaItem(item) {
  return item?.category === FOLDER_META_CATEGORY || item?.id === FOLDER_META_ID;
}

function isEmergencyAccessMetaItem(item) {
  return item?.category === EMERGENCY_ACCESS_META_CATEGORY || item?.id === EMERGENCY_ACCESS_META_ID;
}

function isInternalMetaItem(item) {
  return isFolderMetaItem(item) || isEmergencyAccessMetaItem(item);
}

function isLegacyEmergencyAccessStarterItem(item) {
  return item?.category === 'Emergency Info'
    && item?.title === 'Emergency Access Note'
    && item?.payload?.username === 'Trusted person access'
    && item?.payload?.password === 'Not enabled yet'
    && item?.payload?.notes === 'Emergency access planning note. Keep this updated with trusted contact guidance when the feature is enabled.';
}

function isEmergencyAccessHubItem(item) {
  return item?.payload?.systemAction === 'emergency_access_hub' || isLegacyEmergencyAccessStarterItem(item);
}

function isEmergencyImportedItem(item) {
  return Boolean(item?.payload?.emergencyImport?.readOnlyArchive);
}

function receivedEmergencyPackagesFromItems(vaultItems) {
  const packages = new Map();
  for (const item of Array.isArray(vaultItems) ? vaultItems : []) {
    const info = item?.payload?.emergencyImport;
    if (!info?.readOnlyArchive || !info?.fingerprint || info?.detached) continue;
    const fingerprint = String(info.fingerprint);
    const existing = packages.get(fingerprint) || {
      fingerprint,
      folderName: String(info.folderName || item?.category || ''),
      ownerName: String(info.ownerName || 'Account owner'),
      preparedAt: String(info.preparedAt || ''),
      importedAt: String(info.importedAt || ''),
      itemCount: 0,
      documentCount: 0,
      pictureCount: 0
    };
    existing.folderName = String(info.folderName || existing.folderName || item?.category || '');
    existing.ownerName = String(info.ownerName || existing.ownerName || 'Account owner');
    existing.preparedAt = String(info.preparedAt || existing.preparedAt || '');
    existing.importedAt = String(info.importedAt || existing.importedAt || '');
    existing.itemCount += 1;
    if (String(info.sourceCategory || '') === DOCUMENTS_CATEGORY) existing.documentCount += 1;
    if (String(info.sourceCategory || '') === PICTURES_CATEGORY) existing.pictureCount += 1;
    packages.set(fingerprint, existing);
  }
  return [...packages.values()].sort((a, b) => String(b.importedAt || '').localeCompare(String(a.importedAt || '')));
}

function effectiveVaultItemType(item) {
  return String(item?.payload?.emergencyImport?.sourceCategory || item?.category || 'Passwords');
}

function emergencyAccessHubPackages(item) {
  return Array.isArray(item?.payload?.receivedPackages) ? item.payload.receivedPackages : [];
}

function upsertEmergencyAccessHubItem(vaultItems, receivedPackage = null) {
  const list = Array.isArray(vaultItems) ? [...vaultItems] : [];
  const existingIndex = list.findIndex(isEmergencyAccessHubItem);
  const existing = existingIndex >= 0 ? list[existingIndex] : null;
  const packages = emergencyAccessHubPackages(existing);
  const nextPackages = receivedPackage?.fingerprint
    ? [receivedPackage, ...packages.filter((entry) => entry?.fingerprint !== receivedPackage.fingerprint)].slice(0, 20)
    : packages;
  const hub = {
    id: existing?.id || crypto.randomUUID(),
    title: 'Emergency Access',
    category: 'Emergency Info',
    favourite: Boolean(existing?.favourite),
    payload: {
      url: '',
      username: '',
      password: '',
      notes: 'Manage your own Trusted Person Access and any Emergency Packages you receive here.',
      systemAction: 'emergency_access_hub',
      receivedPackages: nextPackages
    },
    updatedAt: new Date().toISOString()
  };
  if (existingIndex >= 0) list[existingIndex] = hub;
  else list.unshift(hub);
  return list;
}

function updateEmergencyAccessHubPackageFolder(vaultItems, originalName, nextName = '') {
  const list = Array.isArray(vaultItems) ? [...vaultItems] : [];
  const index = list.findIndex(isEmergencyAccessHubItem);
  if (index < 0) return list;
  const hub = list[index];
  const originalLower = normaliseFolderName(originalName).toLowerCase();
  const packages = emergencyAccessHubPackages(hub)
    .filter((entry) => nextName || String(entry?.folderName || '').toLowerCase() !== originalLower)
    .map((entry) => String(entry?.folderName || '').toLowerCase() === originalLower ? { ...entry, folderName: nextName } : entry);
  list[index] = { ...hub, payload: { ...(hub.payload || {}), receivedPackages: packages }, updatedAt: new Date().toISOString() };
  return list;
}

function getVisibleVaultItems(vaultItems) {
  return Array.isArray(vaultItems) ? vaultItems.filter((item) => !isInternalMetaItem(item) && !isEmergencyAccessHubItem(item)) : [];
}

function normaliseFolderName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function uniqueFolderList(values) {
  return (Array.isArray(values) ? values : [])
    .map(normaliseFolderName)
    .filter(Boolean)
    .filter((folder, index, arr) => arr.findIndex((entry) => entry.toLowerCase() === folder.toLowerCase()) === index);
}

function getFolderMeta(vaultItems) {
  return Array.isArray(vaultItems) ? vaultItems.find(isFolderMetaItem) : null;
}

function getCustomFolders(vaultItems) {
  const meta = getFolderMeta(vaultItems);
  return uniqueFolderList(meta?.payload?.folders || []);
}

function getFolderOrder(vaultItems) {
  const meta = getFolderMeta(vaultItems);
  return uniqueFolderList(meta?.payload?.folderOrder || []);
}

function getFavouriteFolders(vaultItems) {
  const meta = getFolderMeta(vaultItems);
  return uniqueFolderList(meta?.payload?.favouriteFolders || []);
}

function upsertFolderMetaItem(vaultItems, folders, folderOrder, favouriteFolders) {
  const currentMeta = getFolderMeta(vaultItems);
  const cleanFolders = uniqueFolderList(folders);
  const cleanOrder = uniqueFolderList(folderOrder || currentMeta?.payload?.folderOrder || []);
  const cleanFavourites = uniqueFolderList(favouriteFolders ?? currentMeta?.payload?.favouriteFolders ?? [])
    .filter((name) => name !== 'All' && cleanFolders.concat(BUILT_IN_CATEGORIES).includes(name));
  const metaItem = {
    id: FOLDER_META_ID,
    title: 'Vault folders',
    category: FOLDER_META_CATEGORY,
    favourite: false,
    payload: { folders: cleanFolders, folderOrder: cleanOrder, favouriteFolders: cleanFavourites },
    updatedAt: new Date().toISOString()
  };
  const withoutFolderMeta = Array.isArray(vaultItems) ? vaultItems.filter((item) => !isFolderMetaItem(item)) : [];
  return (cleanFolders.length || cleanOrder.length || cleanFavourites.length) ? [metaItem, ...withoutFolderMeta] : withoutFolderMeta;
}

function folderExists(folder, folders) {
  const target = normaliseFolderName(folder).toLowerCase();
  return folders.some((entry) => entry.toLowerCase() === target);
}

function cleanEmergencyImportOwnerName(value) {
  return String(value || 'Account owner').replace(/[\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 36) || 'Account owner';
}

function emergencyImportFolderName(ownerName, currentFolders = [], preparedAt = '') {
  const owner = cleanEmergencyImportOwnerName(ownerName);
  const base = `Emergency Package — ${owner}`;
  if (!folderExists(base, currentFolders)) return base;
  const date = preparedAt ? String(preparedAt).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const dated = `${base} — ${date}`;
  if (!folderExists(dated, currentFolders)) return dated;
  let counter = 2;
  while (folderExists(`${dated} (${counter})`, currentFolders)) counter += 1;
  return `${dated} (${counter})`;
}

function emergencyImportedNotes(item) {
  const payload = item?.payload || {};
  const sourceCategory = String(item?.category || 'Other');
  const lines = [];
  if (payload.notes) lines.push(String(payload.notes));
  if (sourceCategory === CARDS_CATEGORY) {
    const cardLines = [
      payload.cardNickname ? `Card nickname: ${payload.cardNickname}` : '',
      payload.cardName ? `Name on card: ${payload.cardName}` : '',
      payload.cardNumber ? `Card number: ${payload.cardNumber}` : '',
      payload.cardExpiry ? `Expiry: ${payload.cardExpiry}` : '',
      payload.cardCcv ? `CCV: ${payload.cardCcv}` : ''
    ].filter(Boolean);
    if (cardLines.length) lines.push(cardLines.join('\n'));
  }
  return lines.join('\n\n').trim();
}

function emergencyPackageOverviewNotes(packageData, releaseExpiresAt = '') {
  const blocks = [
    `Emergency Package received from ${packageData?.ownerName || 'the account owner'}.`,
    packageData?.preparedAt ? `Prepared: ${formatAppDate(packageData.preparedAt, true)}` : '',
    packageData?.releaseScope ? `Release scope: ${packageData.releaseScope}` : '',
    releaseExpiresAt ? `Original secure release link expiry: ${formatAppDate(releaseExpiresAt, true)}` : '',
    packageData?.message ? `Emergency message\n${packageData.message}` : '',
    packageData?.importantContacts ? `Important contacts\n${packageData.importantContacts}` : '',
    packageData?.documentsAndLocations ? `Documents and locations\n${packageData.documentsAndLocations}` : '',
    packageData?.checklist ? `Checklist\n${packageData.checklist}` : '',
    packageData?.ownerInstructions ? `Owner instructions\n${packageData.ownerInstructions}` : '',
    'This imported copy is stored inside your encrypted Password-Encrypt vault and remains there until you delete it.'
  ].filter(Boolean);
  return blocks.join('\n\n');
}

const VAULT_RESULT_COLLATOR = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function vaultResultDisplayName(item) {
  return String(item?.category === CARDS_CATEGORY ? (item?.payload?.cardNickname || item?.title || '') : (item?.title || '')).trim();
}

function vaultResultSortGroup(label) {
  const firstCharacter = Array.from(String(label || '').trim())[0] || '';
  if (!firstCharacter) return 2;
  const isLetter = firstCharacter.toLocaleUpperCase() !== firstCharacter.toLocaleLowerCase();
  return isLetter ? 0 : 1;
}

function compareVaultResults(left, right) {
  const leftLabel = vaultResultDisplayName(left);
  const rightLabel = vaultResultDisplayName(right);
  const groupDifference = vaultResultSortGroup(leftLabel) - vaultResultSortGroup(rightLabel);
  if (groupDifference) return groupDifference;
  const labelDifference = VAULT_RESULT_COLLATOR.compare(leftLabel, rightLabel);
  if (labelDifference) return labelDifference;
  return VAULT_RESULT_COLLATOR.compare(String(left?.category || ''), String(right?.category || ''));
}

function emptyEmergencyAccessPlan() {
  return {
    contactName: '',
    relationship: '',
    contactEmail: '',
    contactPhone: '',
    waitingPeriod: '7 days',
    accessScope: 'Full vault access',
    instructions: '',
    trustedPersonUpdatedAt: '',
    emergencyPackageEnabled: true,
    emergencyPackageTitle: 'Emergency Info package',
    emergencyPackageMessage: '',
    emergencyPackageContacts: '',
    emergencyPackageDocuments: '',
    emergencyPackageChecklist: '',
    emergencyPackageUpdatedAt: '',
    invitationStatus: 'not_invited',
    invitationId: '',
    invitationSentAt: '',
    invitationAcceptedAt: '',
    invitationCancelledAt: '',
    invitationMessage: '',
    invitationUrl: '',
    requestStatus: 'not_requested',
    requestId: '',
    requestRequestedAt: '',
    requestWaitingEndsAt: '',
    requestMessage: '',
    requestLastCheckedAt: '',
    updatedAt: ''
  };
}

function getEmergencyAccessPlan(vaultItems) {
  const meta = Array.isArray(vaultItems) ? vaultItems.find(isEmergencyAccessMetaItem) : null;
  if (!meta) return emptyEmergencyAccessPlan();
  const payload = meta?.payload || {};
  return {
    ...emptyEmergencyAccessPlan(),
    ...payload,
    accessScope: String(payload.accessScope || 'Emergency Info folder only')
  };
}

function hasEmergencyAccessPlan(plan) {
  const value = plan || {};
  return Boolean(
    String(value.contactName || '').trim()
    || String(value.relationship || '').trim()
    || String(value.contactEmail || '').trim()
    || String(value.contactPhone || '').trim()
    || String(value.instructions || '').trim()
    || String(value.emergencyPackageMessage || '').trim()
    || String(value.emergencyPackageContacts || '').trim()
    || String(value.emergencyPackageDocuments || '').trim()
    || String(value.emergencyPackageChecklist || '').trim()
  );
}

function upsertEmergencyAccessMetaItem(vaultItems, plan) {
  const withoutEmergencyMeta = Array.isArray(vaultItems) ? vaultItems.filter((item) => !isEmergencyAccessMetaItem(item)) : [];
  const cleanPlan = {
    ...emptyEmergencyAccessPlan(),
    ...plan,
    contactName: String(plan?.contactName || '').trim(),
    relationship: String(plan?.relationship || '').trim(),
    contactEmail: String(plan?.contactEmail || '').trim().toLowerCase(),
    contactPhone: String(plan?.contactPhone || '').trim(),
    instructions: String(plan?.instructions || '').trim(),
    emergencyPackageEnabled: plan?.emergencyPackageEnabled !== false,
    emergencyPackageTitle: String(plan?.emergencyPackageTitle || 'Emergency Info package').trim(),
    emergencyPackageMessage: String(plan?.emergencyPackageMessage || '').trim(),
    emergencyPackageContacts: String(plan?.emergencyPackageContacts || '').trim(),
    emergencyPackageDocuments: String(plan?.emergencyPackageDocuments || '').trim(),
    emergencyPackageChecklist: String(plan?.emergencyPackageChecklist || '').trim(),
    emergencyPackageUpdatedAt: String(plan?.emergencyPackageUpdatedAt || plan?.updatedAt || '').trim(),
    updatedAt: new Date().toISOString()
  };
  if (!hasEmergencyAccessPlan(cleanPlan)) return withoutEmergencyMeta;
  const metaItem = {
    id: EMERGENCY_ACCESS_META_ID,
    title: 'Emergency access plan',
    category: EMERGENCY_ACCESS_META_CATEGORY,
    favourite: false,
    payload: cleanPlan,
    updatedAt: cleanPlan.updatedAt
  };
  return [metaItem, ...withoutEmergencyMeta];
}


function getFileExtension(fileName) {
  const clean = String(fileName || '').toLowerCase();
  const parts = clean.split('.');
  return parts.length > 1 ? parts.pop() : '';
}

function isAllowedDocumentFile(file) {
  if (!file) return false;
  const extension = getFileExtension(file.name);
  return ALLOWED_DOCUMENT_EXTENSIONS.includes(extension) || ALLOWED_DOCUMENT_MIME_TYPES.includes(file.type);
}

function isAllowedPictureFile(file) {
  if (!file) return false;
  const extension = getFileExtension(file.name);
  return ALLOWED_PICTURE_EXTENSIONS.includes(extension) || ALLOWED_PICTURE_MIME_TYPES.includes(file.type);
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!size) return '0 KB';
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
}


async function encryptDocumentData(dataUrl, masterPassword) {
  let salt = localStorage.getItem(SALT_KEY) || localStorage.getItem(LEGACY_SALT_KEY);
  if (!salt) {
    salt = arrayBufferToBase64(crypto.getRandomValues(new Uint8Array(16)));
    localStorage.setItem(SALT_KEY, salt);
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(masterPassword, salt);
  const encoded = new TextEncoder().encode(String(dataUrl || ''));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    encryptedBlob: arrayBufferToBase64(encrypted),
    localSalt: salt,
    localIv: arrayBufferToBase64(iv)
  };
}

async function decryptDocumentData(documentRecord, masterPassword) {
  const encrypted = documentRecord?.encrypted_blob || documentRecord?.encryptedBlob;
  const salt = documentRecord?.local_salt || documentRecord?.localSalt;
  const iv = documentRecord?.local_iv || documentRecord?.localIv;
  if (!encrypted || !salt || !iv) throw new Error('Encrypted document file is incomplete.');
  const key = await deriveKey(masterPassword, salt);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToArrayBuffer(iv) }, key, base64ToArrayBuffer(encrypted));
  return new TextDecoder().decode(decrypted);
}


function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function formatCardNumber(value) {
  const digits = onlyDigits(value).slice(0, 16);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

function maskCardNumber(value) {
  const digits = onlyDigits(value).slice(0, 16);
  if (!digits) return '—';
  if (digits.length <= 4) return digits;
  return `•••• •••• •••• ${digits.slice(-4)}`;
}

function maskCcv(value) {
  return value ? '•••' : '—';
}

function buildCardCopyText(item) {
  const payload = item?.payload || {};
  return [
    `Nickname: ${payload.cardNickname || item?.title || ''}`,
    `Name on card: ${payload.cardName || ''}`,
    `Card number: ${formatCardNumber(payload.cardNumber || '')}`,
    `Expiry: ${payload.cardExpiry || ''}`,
    `CCV: ${payload.cardCcv || ''}`
  ].filter((line) => !line.endsWith(': ')).join('\n');
}

function triggerDocumentDownload(item, dataUrl) {
  const file = item?.payload?.file;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = file?.name || `${item?.title || 'document'}.${file?.extension || 'txt'}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
}


function dataUrlToBytes(dataUrl) {
  const value = String(dataUrl || '');
  const commaIndex = value.indexOf(',');
  if (!value.startsWith('data:') || commaIndex < 0) throw new Error('Document data is not available in a shareable format.');
  const header = value.slice(5, commaIndex);
  const payload = value.slice(commaIndex + 1);
  const base64 = /;base64(?:;|$)/i.test(header);
  const mimeType = (header.split(';')[0] || 'application/octet-stream').trim() || 'application/octet-stream';
  if (base64) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return { bytes, mimeType };
  }
  return { bytes: new TextEncoder().encode(decodeURIComponent(payload)), mimeType };
}

function safeDownloadFileName(value, fallback = 'document') {
  const clean = String(value || '').trim().replace(/[\/:*?"<>|\u0000-\u001f]/g, '-').replace(/^\.+/, '').slice(0, 180);
  return clean || fallback;
}


function VerificationOverlay({ state, onClose, onFocusMasterPassword }) {
  if (!state?.visible) return null;
  const isWorking = state.status === 'working';
  const isSuccess = state.status === 'success';
  const isError = state.status === 'error';
  return (
    <div className="verify-overlay" role="status" aria-live="polite">
      <div className={`verify-modal ${state.status}`}>
        <div className="verify-motion-ring">
          {isWorking && <div className="verify-spinner" />}
          {isSuccess && <div className="verify-result-icon success">✓</div>}
          {isError && <div className="verify-result-icon error">×</div>}
        </div>
        <h3>{state.title}</h3>
        <p>{state.message}</p>
        {isWorking ? (
          <div className="verify-progress-line" aria-hidden="true" />
        ) : (
          <div className="verify-modal-actions">
            {state.focusMasterPassword && (
              <button
                type="button"
                className="primary-button"
                onClick={() => {
                  onClose();
                  onFocusMasterPassword();
                }}
              >
                Continue to master password
              </button>
            )}
            <button type="button" className="secondary-button" onClick={onClose}>
              {isSuccess ? 'Done' : 'Try again'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


function ToastViewport({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-viewport" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <button key={toast.id} type="button" className={`toast ${toast.type}`} onClick={() => onDismiss(toast.id)} title="Dismiss notification">
          <span className="toast-dot" aria-hidden="true" />
          <span>{toast.text}</span>
        </button>
      ))}
    </div>
  );
}


function DeviceVerificationModal({ state, email, phone, channel = 'email', otp, onClose, onChannelChange, onSend, onChange, onVerify }) {
  if (!state?.visible) return null;
  const hasChallenge = Boolean(otp?.challengeId);
  const isSending = otp?.status === 'requesting';
  const isVerifying = otp?.status === 'verifying';
  const isBusy = isSending || isVerifying;
  const isSms = SMS_AUTH_VERIFICATION_UI_ENABLED && channel === 'sms';
  const destinationAvailable = isSms ? Boolean(phone) : Boolean(email);
  const destinationMasked = isSms ? maskPhone(phone) : maskEmail(email);
  return (
    <div className="item-popup-layer device-verification-popup-layer" role="dialog" aria-modal="true" aria-labelledby="device-verification-title">
      <button type="button" className="item-popup-backdrop" onClick={isBusy ? undefined : onClose} aria-label="Close device verification" />
      <section className="item-popup-card device-verification-popup-card">
        <header className="item-popup-header">
          <h2 id="device-verification-title"><ShieldCheck size={21} /> Verify this device</h2>
          <button type="button" className="icon-button" onClick={onClose} disabled={isBusy} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="item-popup-body device-verification-popup-body">
          <p>Verify this device before secure backup and syncing can continue.</p>
          <div className="device-verification-email-card">{isSms ? <Phone size={19} /> : <Mail size={19} />}<span><strong>{isSms ? 'SMS code' : 'Email code'}</strong><small>{destinationAvailable ? `The code will be sent to ${destinationMasked}.` : `Add a verified ${isSms ? 'mobile number' : 'email address'} in My Account before continuing.`}</small></span></div>
          {!hasChallenge ? (
            <div className="device-verification-step-card">
              <strong>Request your one-time code</strong>
              <span>Tap the button below when you are ready. No code is sent automatically.</span>
            </div>
          ) : (
            <div className="device-verification-code-step">
              <label htmlFor="device-verification-otp">Enter the six-digit code</label>
              <input id="device-verification-otp" inputMode="numeric" autoComplete="one-time-code" value={otp?.input || ''} onChange={(event) => onChange(event.target.value)} placeholder="000000" maxLength={6} />
              <small>{isSms ? 'Check your text messages.' : 'Check your inbox and spam folder.'} The code expires after 10 minutes.</small>
            </div>
          )}
          {isSms && <p className="sms-carrier-note">Standard message and carrier rates may apply.</p>}
          {otp?.code && <div className="test-code-box"><span>Local test code</span><code>{otp.code}</code></div>}
          {otp?.message && <div className={`device-verification-status ${otp?.status === 'error' || otp?.status === 'needs-code' || otp?.status === 'needs-details' ? 'error' : hasChallenge ? 'ready' : ''}`}>{otp.message}</div>}
        </div>
        <footer className="item-popup-footer device-verification-popup-footer">
          <button type="button" className="secondary-button" onClick={onClose} disabled={isBusy}>Not now</button>
          {!hasChallenge ? (
            <button type="button" className="primary-button" onClick={onSend} disabled={isBusy || !destinationAvailable}>{isSms ? <Phone size={17} /> : <Mail size={17} />} {isSending ? 'Sending...' : `Send ${isSms ? 'SMS' : 'email'} code`}</button>
          ) : (
            <>
              <button type="button" className="secondary-button" onClick={onSend} disabled={isBusy}><RefreshCw size={17} /> Resend code</button>
              <button type="button" className="primary-button" onClick={onVerify} disabled={isBusy}><ShieldCheck size={17} /> {isVerifying ? 'Verifying...' : 'Verify device'}</button>
            </>
          )}
        </footer>
      </section>
    </div>
  );
}

function SyncSafetyModal({ state, onClose, onRetry, onVerify, onOpenSafety, onKeepDevice, onUseCloud, onConfirmDanger, onCheck }) {
  if (!state?.visible) return null;
  const details = state.details || {};
  const isConflict = state.mode === 'conflict';
  const isConflictReminder = state.mode === 'conflict-reminder';
  const isVerification = state.mode === 'verification-required';
  const isDanger = state.mode === 'danger';
  const isOffline = state.mode === 'offline';
  const isOfflineSaved = state.mode === 'offline-saved';
  const isStatusInfo = state.mode === 'status-info';
  const isStatusCheck = state.mode === 'status-check';
  const localChangedAt = details.localEnvelope?.updatedAt || '';
  const cloudChangedAt = details.latest?.snapshot?.client_updated_at || details.latest?.snapshot?.created_at || '';
  const localChangedTime = safeTimestamp(localChangedAt);
  const cloudChangedTime = safeTimestamp(cloudChangedAt);
  const recommendedCopy = isConflict && localChangedTime && cloudChangedTime
    ? (localChangedTime > cloudChangedTime ? 'local' : cloudChangedTime > localChangedTime ? 'cloud' : '')
    : '';
  return (
    <div className="item-popup-layer sync-safety-popup-layer" role="dialog" aria-modal="true" aria-labelledby="sync-safety-title">
      <button type="button" className="item-popup-backdrop" onClick={onClose} aria-label="Close vault safety message" />
      <section className="item-popup-card sync-safety-popup-card">
        <header className="item-popup-header">
          <h2 id="sync-safety-title">{isConflict ? <AlertTriangle size={21} /> : <ShieldCheck size={21} />} {state.title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <div className="item-popup-body sync-safety-popup-body">
          <p className="sync-safety-main-message">{state.message}</p>
          {isConflict && (
            <div className="sync-conflict-choice-wrap">
              <div className="sync-conflict-choice-grid" aria-label="Choose the current vault copy">
                <button type="button" className={`sync-conflict-choice ${recommendedCopy === 'local' ? 'recommended' : ''}`} onClick={onKeepDevice}>
                  <span className="sync-conflict-choice-heading"><strong>This device</strong>{recommendedCopy === 'local' && <em>Recommended</em>}</span>
                  <span className="sync-conflict-choice-count">{details.localItemCount ?? 0} item(s)</span>
                  <small>{localChangedAt ? `Changed ${formatAppDate(localChangedAt, true)}` : 'Change time unavailable'}</small>
                  <span className="sync-conflict-choice-action">Use this copy <ChevronRight size={18} /></span>
                </button>
                <button type="button" className={`sync-conflict-choice ${recommendedCopy === 'cloud' ? 'recommended' : ''}`} onClick={onUseCloud}>
                  <span className="sync-conflict-choice-heading"><strong>Secure backup</strong>{recommendedCopy === 'cloud' && <em>Recommended</em>}</span>
                  <span className="sync-conflict-choice-count">{details.cloudItemCount ?? 0} item(s)</span>
                  <small>{cloudChangedAt ? `Changed ${formatAppDate(cloudChangedAt, true)}` : 'Change time unavailable'}</small>
                  <span className="sync-conflict-choice-action">Use this copy <ChevronRight size={18} /></span>
                </button>
              </div>
              <p className="sync-conflict-recommendation-note"><AlertTriangle size={17} /><span>{recommendedCopy ? 'Recommended is based on the newer recorded change time. If you know another device contains newer work that has not synced yet, choose Decide later rather than guessing.' : 'The recorded change times do not identify a newer copy. Choose the copy you know contains your latest work, or choose Decide later.'}</span></p>
            </div>
          )}
          {isConflictReminder && <div className="sync-conflict-reminder"><AlertTriangle size={17} /><span>Nothing has been replaced automatically. Open the conflict check to compare both copies safely.</span></div>}
          {(state.mode === 'backup-failed' || isVerification) && (
            <div className="sync-safety-instructions">
              <strong>Until this is fixed:</strong>
              <span>Do not clear this device’s vault.</span>
              <span>Do not replace it with another device’s copy.</span>
              <span>Your latest changes will not appear on other devices yet.</span>
            </div>
          )}
          {details.originalMessage && <details className="sync-technical-details"><summary>More information</summary><p>{details.originalMessage}</p></details>}
          {isDanger && <div className="sync-danger-note"><AlertTriangle size={18} /><span>{details.warning || 'Unsaved backup changes may be lost if you continue.'}</span></div>}
        </div>
        <footer className="item-popup-footer sync-safety-popup-footer">
          {state.mode === 'backup-failed' && <><button type="button" className="secondary-button" onClick={onClose}>Continue for now</button><button type="button" className="primary-button" onClick={onRetry}><RefreshCw size={17} /> Try backup again</button></>}
          {isVerification && <><button type="button" className="secondary-button" onClick={onClose}>Continue for now</button><button type="button" className="primary-button" onClick={onVerify}><UserRoundCheck size={17} /> Verify this device</button></>}
          {isConflict && <button type="button" className="secondary-button" onClick={onClose}>Decide later</button>}
          {isConflictReminder && <><button type="button" className="secondary-button" onClick={onClose}>Decide later</button><button type="button" className="primary-button" onClick={onCheck}><RefreshCw size={17} /> Compare copies</button></>}
          {isStatusCheck && <><button type="button" className="secondary-button" onClick={onClose}>Close</button><button type="button" className="primary-button" onClick={onCheck}><RefreshCw size={17} /> Check now</button></>}
          {isDanger && <><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="button" className="danger-button" onClick={onConfirmDanger}>Continue anyway</button></>}
          {(isOffline || isOfflineSaved || isStatusInfo) && <button type="button" className="primary-button" onClick={onClose}>Close</button>}
        </footer>
      </section>
    </div>
  );
}

function NetworkStatusNotice({ context = 'vault', hasLocalVault = false }) {
  const message = context === 'admin'
    ? 'Admin needs an internet connection. Reconnect to manage plans, customers and billing.'
    : context === 'public'
      ? (hasLocalVault
        ? 'You are offline. Public plan details and account setup need the internet, but you can still open the encrypted vault saved on this device.'
        : 'You are offline. Reconnect to view current plans, create an account or verify a device.')
      : (hasLocalVault
        ? 'You are offline. You can open and use the encrypted vault saved on this device. Backup and syncing will resume automatically when the internet returns.'
        : 'You are offline. Reconnect to verify your account or restore an existing secure vault on this device.');

  return (
    <section className="network-status-notice" role="status" aria-live="polite">
      <Cloud size={20} />
      <span><strong>No internet connection</strong><small>{message}</small></span>
    </section>
  );
}

class AppStartupBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error('Password-Encrypt startup error', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return (
      <main className="startup-error-screen">
        <section className="startup-error-card">
          <div className="brand-mark startup-brand-mark"><img className="brand-mark-image startup-brand-mark-image" src="/icons/splash-icon.png" alt="" /></div>
          <h1>{offline ? 'No internet connection' : 'Password-Encrypt could not start'}</h1>
          <p>{offline
            ? 'Your encrypted vault data has not been changed. Reconnect and try again.'
            : 'Refresh the app to try again. Your encrypted vault data has not been changed.'}</p>
          <button type="button" className="primary-button" onClick={() => window.location.reload()}><RefreshCw size={18} /> Try again</button>
        </section>
      </main>
    );
  }
}


function PlanEntitlementModal({ state, entitlements, onClose, onOpenSubscription }) {
  if (!state?.visible) return null;
  return (
    <div className="entitlement-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="entitlement-modal" role="dialog" aria-modal="true" aria-labelledby="entitlement-modal-title">
        <header><div><p className="eyebrow">Current plan</p><h2 id="entitlement-modal-title">{state.title}</h2></div><button type="button" onClick={onClose} aria-label="Close"><X size={21} /></button></header>
        <div className="entitlement-modal-body"><ShieldCheck size={30} /><p>{state.message}</p><div className="entitlement-current-plan"><span>Current plan</span><strong>{entitlements?.planName || entitlements?.planCode || 'Personal'}</strong></div></div>
        <footer><button type="button" className="secondary-button" onClick={onClose}>Close</button><button type="button" className="primary-button" onClick={onOpenSubscription}>Open My Subscription</button></footer>
      </section>
    </div>
  );
}


function AccountSecurityModal({ state, setState, onClose, onRequestCode, onConfirmCode, onRemoveDevice, onEndAllSessions }) {
  if (!state?.visible) return null;
  const needsOtp = ['change-email', 'change-phone', 'delete-account'].includes(state.mode);
  const confirmationOnly = ['remove-device', 'end-all-sessions'].includes(state.mode);
  return (
    <div className="item-popup-layer account-security-modal-layer" role="dialog" aria-modal="true" aria-labelledby="account-security-modal-title">
      <button type="button" className="item-popup-backdrop" onClick={state.busy ? undefined : onClose} aria-label="Close account security popup" />
      <section className="item-popup-card account-security-modal-card">
        <header className="item-popup-header"><h2 id="account-security-modal-title"><ShieldCheck size={21} /> {state.title}</h2><button type="button" className="icon-button" onClick={onClose} disabled={state.busy} aria-label="Close"><X size={19} /></button></header>
        <div className="item-popup-body account-security-modal-body">
          {state.mode === 'change-email' && !state.challengeId && <><p>{state.verifyExisting ? 'Send a one-time code to verify the email address already saved on this account.' : 'Enter the new email address. A one-time code will be sent there before the account is changed.'}</p><label>New email address<input type="email" value={state.newEmail || ''} onChange={(event) => setState((current) => ({ ...current, newEmail: event.target.value, message: '' }))} placeholder="new@example.com" /></label></>}
          {state.mode === 'change-phone' && !state.challengeId && <><p>{state.verifyExisting ? 'We will send an SMS one-time code to the mobile number already saved on this account. Enter that code to confirm the number belongs to you.' : 'Enter the new mobile number. Password-Encrypt will update it only after a code sent by SMS is verified.'}</p><label className="combined-phone-label">{state.verifyExisting ? 'Mobile number' : 'New mobile number'}<div className="phone-combo-field"><CountryPicker countryCode={state.phoneCountryCode || '+254'} countryIso={state.phoneCountryIso || 'ke'} onChange={(country) => setState((current) => ({ ...current, phoneCountryCode: country.code, phoneCountryIso: country.iso, message: '' }))} /><input inputMode="tel" value={state.phoneNumber || ''} onChange={(event) => setState((current) => ({ ...current, phoneNumber: event.target.value, message: '' }))} placeholder="712345678" /></div></label><p className="sms-carrier-note">Standard message and carrier rates may apply.</p></>}
          {state.mode === 'delete-account' && !state.challengeId && <><div className="account-deletion-warning"><AlertTriangle size={22} /><span><strong>This is a permanent account action</strong><small>After email verification, deletion waits 14 days. When the waiting period ends, the account, encrypted cloud vault backups, stored documents and stored pictures are permanently removed.</small></span></div><label>Reason (optional)<textarea rows="3" value={state.reason || ''} onChange={(event) => setState((current) => ({ ...current, reason: event.target.value }))} placeholder="Optional feedback" /></label></>}
          {needsOtp && state.challengeId && <><div className="account-otp-destination">{state.mode === 'change-phone' ? <Phone size={20} /> : <Mail size={20} />}<span><strong>Enter the verification code</strong><small>{state.message || 'The code expires in 10 minutes.'}</small></span></div><label>Six-digit code<input inputMode="numeric" autoComplete="one-time-code" maxLength="6" value={state.code || ''} onChange={(event) => setState((current) => ({ ...current, code: event.target.value.replace(/\D/g, '').slice(0, 6), message: '' }))} placeholder="000000" /></label>{state.testOtpCode && <div className="test-code-box"><span>Local test code</span><code>{state.testOtpCode}</code></div>}</>}
          {state.mode === 'remove-device' && <div className="account-deletion-warning"><MonitorSmartphone size={22} /><span><strong>Remove {state.deviceName || 'this verified device'}?</strong><small>Every account session on that device will end. This cannot remotely erase an encrypted local vault already stored there.</small></span></div>}
          {state.mode === 'end-all-sessions' && <div className="account-deletion-warning"><ShieldCheck size={22} /><span><strong>End every account session?</strong><small>All browsers and verified devices, including this one, will need a new one-time verification code before account services can be used again.</small></span></div>}
          {state.message && (!state.challengeId || confirmationOnly) && <div className="account-modal-message">{state.message}</div>}
          <div className="master-password-boundary-note compact"><Lock size={18} /><span><strong>Vault encryption stays separate</strong><small>These actions never recover, reveal or reset the master password.</small></span></div>
        </div>
        <footer className="item-popup-footer"><button type="button" className="secondary-button" onClick={onClose} disabled={state.busy}>Cancel</button>{needsOtp && !state.challengeId && <button type="button" className={state.mode === 'delete-account' ? 'primary-button danger-primary-button' : 'primary-button'} onClick={onRequestCode} disabled={state.busy}>{state.busy ? 'Sending...' : state.mode === 'change-phone' ? 'Send SMS code' : 'Send verification code'}</button>}{needsOtp && state.challengeId && <button type="button" className={state.mode === 'delete-account' ? 'primary-button danger-primary-button' : 'primary-button'} onClick={onConfirmCode} disabled={state.busy}>{state.busy ? 'Confirming...' : state.mode === 'delete-account' ? 'Schedule deletion' : 'Verify and update'}</button>}{state.mode === 'remove-device' && <button type="button" className="primary-button danger-primary-button" onClick={onRemoveDevice} disabled={state.busy}>{state.busy ? 'Removing...' : 'Remove device'}</button>}{state.mode === 'end-all-sessions' && <button type="button" className="primary-button danger-primary-button" onClick={onEndAllSessions} disabled={state.busy}>{state.busy ? 'Ending...' : 'End all sessions'}</button>}</footer>
      </section>
    </div>
  );
}

function AccountRecoveryModal({ state, setState, onClose, onRequest, onVerify }) {
  if (!state?.visible) return null;
  return (
    <div className="item-popup-layer account-recovery-modal-layer" role="dialog" aria-modal="true" aria-labelledby="account-recovery-title">
      <button type="button" className="item-popup-backdrop" onClick={state.busy ? undefined : onClose} aria-label="Close account recovery" />
      <section className="item-popup-card account-recovery-modal-card">
        <header className="item-popup-header"><h2 id="account-recovery-title"><UserRoundCheck size={21} /> Recover account access</h2><button type="button" className="icon-button" onClick={onClose} disabled={state.busy} aria-label="Close"><X size={19} /></button></header>
        <div className="item-popup-body account-recovery-modal-body">
          {state.step === 'contact' ? <><p>Use this when setting up a new device, after ending account sessions, or when you can no longer access account services. Your verified email restores account, subscription and secure cloud-service access on this device. It does not open or decrypt the vault.</p><div className="recovery-channel-switch email-only-verification"><button type="button" className="active" onClick={() => setState((current) => ({ ...current, channel: 'email', contact: current.contact || '', message: '' }))}><Mail size={17} /> Email</button></div><label>Verified email address<input type="email" inputMode="email" value={state.contact || ''} onChange={(event) => setState((current) => ({ ...current, channel: 'email', contact: event.target.value, message: '' }))} placeholder="you@example.com" /></label></> : <><div className="account-otp-destination"><ShieldCheck size={20} /><span><strong>Enter your recovery code</strong><small>{state.message}</small></span></div><label>Six-digit code<input inputMode="numeric" autoComplete="one-time-code" maxLength="6" value={state.code || ''} onChange={(event) => setState((current) => ({ ...current, code: event.target.value.replace(/\D/g, '').slice(0, 6), message: '' }))} placeholder="000000" /></label>{state.testOtpCode && <div className="test-code-box"><span>Local test code</span><code>{state.testOtpCode}</code></div>}</>}
          {state.message && state.step === 'contact' && <div className="account-modal-message">{state.message}</div>}
          <div className="master-password-boundary-note"><Lock size={20} /><span><strong>Support cannot recover or reset your master password</strong><small>Account recovery can restore the account and subscription, but it does not supply the vault encryption secret. A previously configured Secure device unlock may still provide local access until its next password check.</small></span></div>
        </div>
        <footer className="item-popup-footer"><button type="button" className="secondary-button" onClick={onClose} disabled={state.busy}>Cancel</button>{state.step === 'contact' ? <button type="button" className="primary-button" onClick={onRequest} disabled={state.busy}>{state.busy ? 'Sending...' : 'Send recovery code'}</button> : <button type="button" className="primary-button" onClick={onVerify} disabled={state.busy}>{state.busy ? 'Restoring...' : 'Restore account access'}</button>}</footer>
      </section>
    </div>
  );
}

function ExitAppConfirmationModal({ visible, onStay, onExit }) {
  if (!visible) return null;
  return (
    <div className="item-popup-layer exit-app-confirmation-layer" role="presentation">
      <button type="button" className="item-popup-backdrop" onClick={onStay} aria-label="Stay in Password-Encrypt" />
      <section className="item-popup-card exit-app-confirmation-card" role="dialog" aria-modal="true" aria-labelledby="exit-app-confirmation-title">
        <header className="item-popup-header"><h2 id="exit-app-confirmation-title"><ShieldCheck size={21} /> Leave Password-Encrypt?</h2><button type="button" className="icon-button" onClick={onStay} aria-label="Close"><X size={19} /></button></header>
        <div className="item-popup-body exit-app-confirmation-body"><p>You are already on the Passwords home page. Do you want to leave the app?</p><div className="master-password-boundary-note compact"><Lock size={18} /><span><strong>Your vault remains locked when you leave</strong><small>Unsaved popup changes should be completed or cancelled before exiting.</small></span></div></div>
        <footer className="item-popup-footer exit-app-confirmation-footer"><button type="button" className="secondary-button" onClick={onStay}>Stay in app</button><button type="button" className="primary-button" onClick={onExit}>Exit app</button></footer>
      </section>
    </div>
  );
}

function PushActivationPromptModal({ visible, permission, loading, onClose, onSuppress, onEnable, onReview }) {
  if (!visible) return null;
  const blocked = permission === 'denied';
  return (
    <div className="item-popup-layer push-activation-prompt-layer" role="presentation">
      <button type="button" className="item-popup-backdrop" onClick={loading ? undefined : onClose} aria-label="Close push notification prompt" />
      <section className="item-popup-card push-activation-prompt-card" role="dialog" aria-modal="true" aria-labelledby="push-activation-prompt-title">
        <header className="item-popup-header">
          <h2 id="push-activation-prompt-title"><Bell size={21} /> Push notifications</h2>
          <button type="button" className="icon-button" onClick={onClose} disabled={loading} aria-label="Close"><X size={19} /></button>
        </header>
        <div className="item-popup-body push-activation-prompt-body">
          <div className={`push-activation-prompt-icon ${blocked ? 'blocked' : ''}`}><Bell size={27} /></div>
          <p>{blocked ? 'Push notifications are currently blocked on this device.' : 'Activate push notifications on this device.'}</p>
          <div className="master-password-boundary-note compact"><ShieldCheck size={18} /><span><strong>Don't miss important account messages</strong><small>It is important to activate push notifications so you can receive Password-Encrypt account and Admin messages, security notices and other important service alerts, even when you are not using the app.</small></span></div>
          {blocked && <p className="push-activation-prompt-help">Allow notifications in this browser or installed app permissions, then return to Push Notifications in Settings.</p>}
        </div>
        <footer className="item-popup-footer push-activation-prompt-footer">
          <button type="button" className="secondary-button" onClick={onClose} disabled={loading}>Decide later</button>
          <button type="button" className="secondary-button push-prompt-suppress-button" onClick={onSuppress} disabled={loading}>Don't show again</button>
          {blocked
            ? <button type="button" className="primary-button" onClick={onReview}>Review settings</button>
            : <button type="button" className="primary-button" onClick={onEnable} disabled={loading}>{loading ? 'Activating...' : 'Activate notifications'}</button>}
        </footer>
      </section>
    </div>
  );
}

function App() {
  const [locked, setLocked] = useState(true);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmMasterPassword, setConfirmMasterPassword] = useState('');
  const [showUnlockPassword, setShowUnlockPassword] = useState(true);
  const [masterPasswordFieldArmed, setMasterPasswordFieldArmed] = useState(false);
  const [passwordCheckNotice, setPasswordCheckNotice] = useState('');
  const masterPasswordInputRef = useRef(null);
  const onboardingSecretInputType = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('-webkit-text-security', 'disc') ? 'text' : 'password';
  const [hasLocalVault, setHasLocalVault] = useState(() => Boolean(readStoredVault()));
  const [createMode, setCreateMode] = useState(() => !Boolean(readStoredVault()));
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [showSecrets, setShowSecrets] = useState({});
  const [showFormSecret, setShowFormSecret] = useState(false);
  const [itemCredentialFieldsArmed, setItemCredentialFieldsArmed] = useState({ username: false, password: false });
  const [form, setForm] = useState({ title: '', category: 'Passwords', url: '', username: '', password: '', notes: '', favourite: false, file: null, cardName: '', cardNickname: '', cardNumber: '', cardExpiry: '', cardCcv: '' });
  const [editingItemId, setEditingItemId] = useState('');
  const [dbStatus, setDbStatus] = useState({ checked: false, connected: false, message: 'Not checked yet.' });
  const [bootstrap, setBootstrap] = useState(() => readSavedAccount());
  const [accountStatus, setAccountStatus] = useState({ state: 'local-first', message: 'Your account details help you recover your vault on a new device.' });
  const [customerSession, setCustomerSession] = useState({ checked: false, authenticated: false, cloudAccess: false, accessCode: '', tenantId: '', userId: '', message: 'Device verification has not been checked yet.' });
  const [accountSecurity, setAccountSecurity] = useState({ loaded: false, loading: false, message: '', user: null, devices: [], sessions: [], deletion: null, currentDeviceId: '', currentSessionId: '', sessionExpiresAt: '' });
  const [accountSecurityModal, setAccountSecurityModal] = useState({ visible: false, mode: '', title: '', challengeId: '', code: '', testOtpCode: '', message: '', busy: false, newEmail: '', phoneCountryCode: '+254', phoneCountryIso: 'ke', phoneNumber: '', reason: '' });
  const [accountRecoveryModal, setAccountRecoveryModal] = useState({ visible: false, step: 'contact', channel: 'email', contact: '', challengeId: '', code: '', testOtpCode: '', message: '', busy: false });
  const [entitlements, setEntitlements] = useState(() => readCachedEntitlements());
  const [entitlementModal, setEntitlementModal] = useState({ visible: false, feature: '', title: '', message: '' });
  const [publicPlans, setPublicPlans] = useState(FALLBACK_SAAS_PLANS);
  const [billing, setBilling] = useState({ status: 'idle', message: '', planCode: '', interval: 'monthly', subscription: null, stripeConfigured: false, returnState: '', loaded: false, paymentHistory: [], nextInvoice: null, duplicateSubscriptionIds: [] });
  const [billingTermsAccepted, setBillingTermsAccepted] = useState(false);
  const [billingLegalModalOpen, setBillingLegalModalOpen] = useState(false);
  const [subscriptionActionModal, setSubscriptionActionModal] = useState({ visible: false, action: '', title: '', message: '', planCode: '', interval: '', mode: '' });
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ state: 'idle', message: 'Your vault safety status will update after the first secure backup check.', lastSyncAt: '', lastSnapshotId: '', itemCount: 0, snapshotCount: 0 });
  const [syncSafety, setSyncSafety] = useState(() => readSyncSafetyState());
  const [syncSafetyModal, setSyncSafetyModal] = useState({ visible: false, mode: '', title: '', message: '', details: null });
  const [syncPromptShown, setSyncPromptShown] = useState(false);
  const offlineSaveNoticeShownRef = useRef(false);
  const syncRetryRef = useRef(false);
  const syncOperationRef = useRef(false);
  const [snapshotHistory, setSnapshotHistory] = useState({ loaded: false, loading: false, total: 0, snapshots: [], message: 'Recovery history has not been checked yet.' });
  const [cloudChangeCheckBusy, setCloudChangeCheckBusy] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState({
    state: 'not-checked',
    label: 'This device has not checked your cloud backup yet.',
    lastCloudCheckAt: '',
    lastRestoreAt: '',
    latestSnapshotId: '',
    latestCloudItemCount: 0,
    source: hasLocalVault ? 'local-encrypted-vault-present' : 'no-local-vault'
  });
  const [toasts, setToasts] = useState([]);
  const [otpTest, setOtpTest] = useState({ status: 'not-requested', challengeId: '', code: '', input: '', message: 'Email verification has not been requested yet.', verified: false, expiresAt: '' });
  const [otpChannel, setOtpChannel] = useState('email');
  const [verifyOverlay, setVerifyOverlay] = useState({ visible: false, status: 'idle', title: '', message: '', focusMasterPassword: false });
  const [deviceVerificationModal, setDeviceVerificationModal] = useState({ visible: false, purpose: '' });
  const [suppressUnlockAutofocus, setSuppressUnlockAutofocus] = useState(false);
  const [biometricUnlock, setBiometricUnlock] = useState(() => readBiometricUnlockRecord());
  const [biometricStatus, setBiometricStatus] = useState(() => ({ supported: isBiometricUnlockSupported(), label: isBiometricUnlockSupported() ? friendlyBiometricName() : 'Not supported on this browser/device', state: readBiometricUnlockRecord() ? 'enabled' : 'available' }));
  const [activePage, setActivePage] = useState('home');
  const [activeSettingsSection, setActiveSettingsSection] = useState('overview');
  const [pushNotifications, setPushNotifications] = useState(() => ({
    loaded: false,
    loading: false,
    supported: pushNotificationsSupported(),
    configured: false,
    permission: pushPermissionState(),
    enabledThisDevice: false,
    activeCount: 0,
    publicKey: '',
    message: ''
  }));
  const [pushActivationPromptOpen, setPushActivationPromptOpen] = useState(false);
  const pushActivationPromptShownRef = useRef(false);
  const [mobileHeaderMenuOpen, setMobileHeaderMenuOpen] = useState(false);
  const [exitAppConfirmationOpen, setExitAppConfirmationOpen] = useState(false);
  const backNavigationStateRef = useRef({});
  const consumeVaultBackActionRef = useRef(() => false);
  const vaultCloseWatcherRef = useRef(null);
  const vaultCloseWatcherEnabledRef = useRef(false);
  const [emergencyDraft, setEmergencyDraft] = useState(() => emptyEmergencyAccessPlan());
  const [emergencyInviteState, setEmergencyInviteState] = useState({ status: 'idle', message: '' });
  const [emergencyFlowEvents, setEmergencyFlowEvents] = useState([]);
  const [emergencySaveState, setEmergencySaveState] = useState('idle');
  const [emergencyPackageFreshness, setEmergencyPackageFreshness] = useState({ state: 'idle', lastRefreshedAt: '', message: '' });
  const emergencyPackageRefreshTimerRef = useRef(null);
  const emergencyPackageRefreshInFlightRef = useRef(false);
  const emergencyPackageRefreshQueuedRef = useRef(null);
  const emergencyPackageFrozenInvitationRef = useRef('');
  const [inviteAcceptance, setInviteAcceptance] = useState({ status: 'idle', message: '' });
  const [emergencyRequestState, setEmergencyRequestState] = useState({ status: 'idle', message: '' });
  const [emergencyReleasePackage, setEmergencyReleasePackage] = useState(null);
  const [emergencyImportState, setEmergencyImportState] = useState({ visible: false, status: 'code-entry', message: '', codeInput: '', importCode: '', packageData: null, releaseExpiresAt: '', fingerprint: '', duplicateFolder: '', busy: false });
  const [trustedPersonReminderConfirmation, setTrustedPersonReminderConfirmation] = useState({ status: 'idle', message: '', ownerName: '', contactName: '', confirmedAt: '' });
  const [trustedPersonHelpOpen, setTrustedPersonHelpOpen] = useState(false);
  const [isItemPopupOpen, setIsItemPopupOpen] = useState(false);
  const [viewItemId, setViewItemId] = useState('');
  const [pendingDeleteItemId, setPendingDeleteItemId] = useState('');
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState('');
  const [sharingDocId, setSharingDocId] = useState('');
  const [picturePreview, setPicturePreview] = useState({ itemId: '', dataUrl: '', busy: false });
  const [emergencyDocumentBusyId, setEmergencyDocumentBusyId] = useState('');
  const [emergencyPackageDownloadBusy, setEmergencyPackageDownloadBusy] = useState(false);
  const [isFolderPopupOpen, setIsFolderPopupOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isSavingFolder, setIsSavingFolder] = useState(false);
  const [folderManager, setFolderManager] = useState({ visible: false, originalName: '', name: '', itemCount: 0, busy: false, confirmDelete: false, message: '' });
  const [draggedFolderName, setDraggedFolderName] = useState('');
  const [touchReorderFolder, setTouchReorderFolder] = useState('');
  const [touchDropTargetFolder, setTouchDropTargetFolder] = useState('');
  const [isFolderListPopupOpen, setIsFolderListPopupOpen] = useState(false);
  const [showOnboardingDetails, setShowOnboardingDetails] = useState(() => !Boolean(readStoredVault()));
  const [isCreateAccountPopupOpen, setIsCreateAccountPopupOpen] = useState(false);
  const createAccountPopupBodyRef = useRef(null);
  const [isOpenVaultChoicePopupOpen, setIsOpenVaultChoicePopupOpen] = useState(false);
  const [signupLegalModal, setSignupLegalModal] = useState({ visible: false, page: 'terms' });
  const [isCreateVaultPopupOpen, setIsCreateVaultPopupOpen] = useState(false);
  const [landingOnboardingStep, setLandingOnboardingStep] = useState(1);
  const [landingAccountDraft, setLandingAccountDraft] = useState({
    displayName: '',
    email: '',
    phoneCountryCode: '+254',
    phoneCountryIso: 'ke',
    phoneNumber: '',
    phoneE164: '',
    accountName: '',
    planCode: '',
    legalAccepted: false
  });
  const [landingSignup, setLandingSignup] = useState({ status: 'idle', message: '', existingAccount: false, tenantId: '', userId: '', planName: '', trialDays: 0, trialStartedAt: '', trialEndsAt: '', welcomeEmailSent: false });
  const [onboardingVaultDraft, setOnboardingVaultDraft] = useState(() => { const saved = readSavedAccount(); return { email: saved.email || '', phoneCountryCode: saved.phoneCountryCode || '+254', phoneCountryIso: saved.phoneCountryIso || 'ke', phoneNumber: saved.phoneNumber || '' }; });
  const [onboardingSecretFieldsArmed, setOnboardingSecretFieldsArmed] = useState({ master: false, confirm: false });
  const [landingOtp, setLandingOtp] = useState({ status: 'idle', channel: 'email', challengeId: '', input: '', message: '', testCode: '', expiresAt: '', emailSendCount: 0, smsFallbackEligible: false });
  const installPromptRef = useRef(null);
  const [installPromptReady, setInstallPromptReady] = useState(false);
  const [installStatus, setInstallStatus] = useState(() => isPasswordEncryptInstalled() ? 'installed' : 'waiting');
  const [installMessage, setInstallMessage] = useState(() => isPasswordEncryptInstalled() ? 'Password-Encrypt is already installed on this device.' : 'Install Password-Encrypt for quicker everyday access from your home screen or desktop.');
  const [showInstallOnboarding, setShowInstallOnboarding] = useState(false);
  const [onboardingSecurityWarning, setOnboardingSecurityWarning] = useState('');
  const onboardingSessionIsolationRef = useRef(Boolean(readPendingOnboardingAccount()));
  const [showLandingBackToTop, setShowLandingBackToTop] = useState(false);
  const touchReorderRef = useRef({ timer: null, source: '', active: false });

  const activeHint = categoryHints[form.category] || categoryHints.Passwords;

  function scrollSettingsToTop() {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    });
  }

  function openSettingsHome() {
    setActivePage('settings');
    setActiveSettingsSection('overview');
    scrollSettingsToTop();
  }

  function openSettingsSection(section) {
    setActivePage('settings');
    setActiveSettingsSection(section);
    scrollSettingsToTop();
  }

  function openFaqSettings() {
    openSettingsSection('faq');
  }

  function openVaultSafetySettings() {
    openSettingsSection('safety');
  }

  function openSubscriptionSettings() {
    openSettingsSection('subscription');
  }

  async function loadPushNotificationStatus({ silent = false } = {}) {
    const supported = pushNotificationsSupported();
    if (!supported) {
      setPushNotifications((current) => ({ ...current, loaded: true, loading: false, supported: false, configured: false, permission: 'unsupported', enabledThisDevice: false, message: 'Push notifications are not supported by this browser or device.' }));
      return null;
    }
    if (!customerSession.authenticated) {
      setPushNotifications((current) => ({ ...current, loaded: true, loading: false, supported: true, permission: pushPermissionState(), enabledThisDevice: false, message: 'Verify this device to manage push notifications.' }));
      return null;
    }
    setPushNotifications((current) => ({ ...current, loading: true, message: silent ? current.message : 'Checking push notifications...' }));
    try {
      const response = await fetch('/.netlify/functions/push-subscription', { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json().catch(() => ({ ok: false, message: 'Push notification status returned an invalid response.' }));
      if (!response.ok || !result.ok) throw new Error(result.message || 'Push notification status could not be loaded.');
      const registration = await navigator.serviceWorker.ready;
      const browserSubscription = await registration.pushManager.getSubscription();
      const permission = pushPermissionState();
      const binding = readPushBinding();
      const bindingMatches = Boolean(
        binding
        && String(binding.tenantId || '') === String(customerSession.tenantId || '')
        && String(binding.userId || '') === String(customerSession.userId || '')
      );
      let activeCount = Number(result.activeCount || 0);
      let publicKey = result.publicKey || '';
      let enabledThisDevice = permission === 'granted' && Boolean(browserSubscription) && bindingMatches;

      // A deliberate logout or device removal pauses the server-side subscription.
      // Re-verifying the same locally-bound account safely restores it without
      // asking the browser for notification permission again. Never auto-rebind
      // a browser subscription that belongs to a different account.
      if (result.configured && enabledThisDevice && browserSubscription?.endpoint) {
        try {
          const synced = await postJson('/.netlify/functions/push-subscription', { action: 'subscribe', subscription: browserSubscription.toJSON() });
          if (synced?.ok) {
            activeCount = Number(synced.activeCount || activeCount || 1);
            publicKey = synced.publicKey || publicKey;
          } else {
            enabledThisDevice = false;
          }
        } catch {
          enabledThisDevice = false;
        }
      }

      const linkedToAnotherAccount = Boolean(browserSubscription) && !bindingMatches;
      const next = {
        loaded: true,
        loading: false,
        supported: true,
        configured: Boolean(result.configured),
        permission,
        enabledThisDevice,
        activeCount,
        publicKey,
        message: !result.configured
          ? 'Push delivery still needs its server keys configured.'
          : enabledThisDevice
            ? 'Push notifications are active on this device.'
            : permission === 'denied'
              ? 'Notifications are blocked in this browser. Allow them in the site or app permissions to enable push alerts.'
              : linkedToAnotherAccount
                ? 'Push notifications on this browser are linked to another Password-Encrypt account. Enable them here to use this account instead.'
                : 'Push notifications are available but not enabled on this device.'
      };
      setPushNotifications(next);
      return { ...result, activeCount, publicKey, browserSubscription, permission, bindingMatches };
    } catch (error) {
      const message = error.message || 'Push notification status could not be loaded.';
      setPushNotifications((current) => ({ ...current, loaded: true, loading: false, permission: pushPermissionState(), message }));
      if (!silent) showMessage(message, 'error');
      return null;
    }
  }

  async function enablePushNotifications() {
    if (!pushNotificationsSupported()) {
      showMessage('Push notifications are not supported by this browser or device.', 'error');
      return;
    }
    if (!customerSession.authenticated) {
      showMessage('Verify this device before enabling push notifications.', 'error');
      return;
    }
    setPushNotifications((current) => ({ ...current, loading: true, message: 'Enabling push notifications...' }));
    try {
      let config = pushNotifications.configured && pushNotifications.publicKey ? pushNotifications : await loadPushNotificationStatus({ silent: true });
      const publicKey = config?.publicKey || pushNotifications.publicKey || '';
      if (!publicKey) throw new Error('Push notifications are not configured on the server yet.');
      let permission = Notification.permission;
      if (permission !== 'granted') permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushNotifications((current) => ({ ...current, loading: false, permission, enabledThisDevice: false, message: permission === 'denied' ? 'Notifications are blocked in this browser.' : 'Notification permission was not granted.' }));
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      }
      const result = await postJson('/.netlify/functions/push-subscription', { action: 'subscribe', subscription: subscription.toJSON() });
      if (!result.ok) throw new Error(result.message || 'Push notification subscription could not be saved.');
      savePushBinding(customerSession.tenantId, customerSession.userId);
      setPushNotifications((current) => ({ ...current, loaded: true, loading: false, supported: true, configured: true, permission: 'granted', enabledThisDevice: true, activeCount: Number(result.activeCount || current.activeCount || 1), publicKey: result.publicKey || current.publicKey, message: 'Push notifications are active on this device.' }));
      showMessage('Push notifications are now active on this device.', 'success');
    } catch (error) {
      const message = error.message || 'Push notifications could not be enabled.';
      setPushNotifications((current) => ({ ...current, loading: false, permission: pushPermissionState(), message }));
      showMessage(message, 'error');
    }
  }

  async function disablePushNotifications() {
    if (!pushNotificationsSupported()) return;
    setPushNotifications((current) => ({ ...current, loading: true, message: 'Disabling push notifications...' }));
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription?.endpoint) {
        await postJson('/.netlify/functions/push-subscription', { action: 'unsubscribe', endpoint: subscription.endpoint }).catch(() => null);
        await subscription.unsubscribe().catch(() => false);
      }
      clearPushBinding();
      setPushNotifications((current) => ({ ...current, loaded: true, loading: false, permission: pushPermissionState(), enabledThisDevice: false, activeCount: Math.max(0, Number(current.activeCount || 0) - (subscription ? 1 : 0)), message: 'Push notifications are disabled on this device.' }));
      showMessage('Push notifications are disabled on this device. Email alerts remain active.', 'success');
    } catch (error) {
      const message = error.message || 'Push notifications could not be disabled.';
      setPushNotifications((current) => ({ ...current, loading: false, message }));
      showMessage(message, 'error');
    }
  }

  async function loadAccountSecurity({ silent = false } = {}) {
    if (!customerSession.authenticated) {
      setAccountSecurity((current) => ({ ...current, loaded: false, loading: false, message: 'Verify this device to manage account sessions and devices.' }));
      return null;
    }
    setAccountSecurity((current) => ({ ...current, loading: true, message: silent ? current.message : 'Loading account security...' }));
    try {
      const response = await fetch('/.netlify/functions/account-security', { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || 'Account security details could not be loaded.');
      setAccountSecurity({ loaded: true, loading: false, message: '', user: result.user || null, devices: result.devices || [], sessions: result.sessions || [], deletion: result.deletion || null, currentDeviceId: result.currentDeviceId || '', currentSessionId: result.currentSessionId || '', sessionExpiresAt: result.sessionExpiresAt || '' });
      return result;
    } catch (error) {
      setAccountSecurity((current) => ({ ...current, loading: false, message: error.message || 'Account security details could not be loaded.' }));
      if (!silent) showMessage(error.message || 'Account security details could not be loaded.', 'error');
      return null;
    }
  }

  function closeAccountSecurityModal() {
    setAccountSecurityModal({ visible: false, mode: '', title: '', challengeId: '', code: '', testOtpCode: '', message: '', busy: false, newEmail: '', phoneCountryCode: '+254', phoneCountryIso: 'ke', phoneNumber: '', reason: '' });
  }

  function openAccountSecurityAction(mode, details = {}) {
    const titles = {
      'change-email': 'Change email address',
      'change-phone': details.verifyExisting ? 'Verify mobile number' : 'Change mobile number',
      'remove-device': 'Remove verified device?',
      'end-all-sessions': 'End all account sessions?',
      'delete-account': 'Request account deletion'
    };
    setAccountSecurityModal({ visible: true, mode, title: titles[mode] || 'Account security', challengeId: '', code: '', testOtpCode: '', message: '', busy: false, newEmail: '', phoneCountryCode: accountSecurity.user?.phoneCountryCode || bootstrap.phoneCountryCode || '+254', phoneCountryIso: bootstrap.phoneCountryIso || 'ke', phoneNumber: '', reason: '', ...details });
  }

  async function requestAccountSecurityOtp() {
    const modal = accountSecurityModal;
    let action = '';
    let payload = {};
    if (modal.mode === 'change-email') {
      action = 'request_email_change';
      payload = { newEmail: modal.newEmail };
    } else if (modal.mode === 'change-phone') {
      action = 'request_phone_change';
      payload = { phoneCountryCode: modal.phoneCountryCode, phoneNumber: modal.phoneNumber };
    } else if (modal.mode === 'delete-account') {
      action = 'request_deletion_code';
    } else return;
    setAccountSecurityModal((current) => ({ ...current, busy: true, message: 'Sending verification code...' }));
    const result = await postJson('/.netlify/functions/account-security', { action, ...payload });
    if (!result.ok) {
      setAccountSecurityModal((current) => ({ ...current, busy: false, message: result.message || 'The verification code could not be sent.' }));
      return;
    }
    setAccountSecurityModal((current) => ({ ...current, busy: false, challengeId: result.challengeId || '', testOtpCode: result.testOtpCode || '', message: result.message || 'Enter the verification code to continue.' }));
  }

  async function confirmAccountSecurityOtp() {
    const modal = accountSecurityModal;
    const code = String(modal.code || '').replace(/\D/g, '');
    if (!modal.challengeId || code.length !== 6) {
      setAccountSecurityModal((current) => ({ ...current, message: 'Enter the six-digit verification code.' }));
      return;
    }
    const action = modal.mode === 'change-email' ? 'confirm_email_change' : modal.mode === 'change-phone' ? 'confirm_phone_change' : modal.mode === 'delete-account' ? 'confirm_deletion' : '';
    if (!action) return;
    setAccountSecurityModal((current) => ({ ...current, busy: true, message: 'Confirming...' }));
    const result = await postJson('/.netlify/functions/account-security', { action, challengeId: modal.challengeId, code, reason: modal.reason });
    if (!result.ok) {
      setAccountSecurityModal((current) => ({ ...current, busy: false, message: result.message || 'The account change could not be confirmed.' }));
      return;
    }
    if (modal.mode === 'change-email') {
      const next = { ...bootstrap, email: result.email || modal.newEmail };
      setBootstrap(next);
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(next));
    }
    if (modal.mode === 'change-phone') {
      const next = { ...bootstrap, phoneCountryCode: result.phoneCountryCode || modal.phoneCountryCode, phoneNumber: result.phoneNumber || modal.phoneNumber, phoneE164: result.phoneE164 || buildPhoneE164(modal.phoneCountryCode, modal.phoneNumber) };
      setBootstrap(next);
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify(next));
    }
    closeAccountSecurityModal();
    await loadAccountSecurity({ silent: true });
    showMessage(result.message || 'Account security updated.', 'success');
  }

  async function confirmRemoveVerifiedDevice() {
    const deviceId = accountSecurityModal.deviceId || '';
    setAccountSecurityModal((current) => ({ ...current, busy: true, message: 'Removing verified device...' }));
    const result = await postJson('/.netlify/functions/account-security', { action: 'revoke_device', deviceId });
    if (!result.ok) {
      setAccountSecurityModal((current) => ({ ...current, busy: false, message: result.message || 'The device could not be removed.' }));
      return;
    }
    closeAccountSecurityModal();
    if (result.currentSessionEnded) {
      setCustomerSession({ checked: true, authenticated: false, cloudAccess: false, accessCode: 'SESSION_REQUIRED', tenantId: '', userId: '', message: result.message });
    } else {
      await loadAccountSecurity({ silent: true });
    }
    showMessage(result.message, 'success');
  }

  async function confirmEndAllSessions() {
    setAccountSecurityModal((current) => ({ ...current, busy: true, message: 'Ending account sessions...' }));
    const result = await postJson('/.netlify/functions/account-security', { action: 'revoke_all_sessions' });
    if (!result.ok) {
      setAccountSecurityModal((current) => ({ ...current, busy: false, message: result.message || 'Account sessions could not be ended.' }));
      return;
    }
    closeAccountSecurityModal();
    setCustomerSession({ checked: true, authenticated: false, cloudAccess: false, accessCode: 'SESSION_REQUIRED', tenantId: '', userId: '', message: result.message });
    setAccountSecurity((current) => ({ ...current, loaded: false, devices: [], sessions: [] }));
    showMessage(result.message, 'success');
  }

  async function cancelAccountDeletion() {
    const result = await postJson('/.netlify/functions/account-security', { action: 'cancel_deletion' });
    if (!result.ok) return showMessage(result.message || 'The deletion request could not be cancelled.', 'error');
    await loadAccountSecurity({ silent: true });
    showMessage(result.message, 'success');
  }

  async function downloadAccountInformation() {
    try {
      const response = await fetch('/.netlify/functions/account-export', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || 'The account export could not be prepared.');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || `my-passwords-account-export-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      showMessage('Your personal account information export has been downloaded.', 'success');
    } catch (error) {
      showMessage(error.message || 'The account export could not be downloaded.', 'error');
    }
  }

  function openAccountRecovery() {
    setAccountRecoveryModal({ visible: true, step: 'contact', channel: 'email', contact: bootstrap.email || '', challengeId: '', code: '', testOtpCode: '', message: '', busy: false });
  }

  async function requestAccountRecoveryCode() {
    const state = accountRecoveryModal;
    setAccountRecoveryModal((current) => ({ ...current, busy: true, message: 'Sending recovery code...' }));
    const result = await postJson('/.netlify/functions/account-recovery', { action: 'request', channel: state.channel, contact: state.contact, email: state.channel === 'email' ? state.contact : '', phoneE164: state.channel === 'sms' ? state.contact : '' });
    if (!result.ok) {
      setAccountRecoveryModal((current) => ({ ...current, busy: false, message: result.message || 'The recovery code could not be sent.' }));
      return;
    }
    setAccountRecoveryModal((current) => ({ ...current, busy: false, step: 'code', challengeId: result.challengeId, testOtpCode: result.testOtpCode || '', message: result.message || 'Enter the recovery code.' }));
  }

  async function verifyAccountRecoveryCode() {
    const code = String(accountRecoveryModal.code || '').replace(/\D/g, '');
    if (code.length !== 6) return setAccountRecoveryModal((current) => ({ ...current, message: 'Enter the six-digit recovery code.' }));
    setAccountRecoveryModal((current) => ({ ...current, busy: true, message: 'Restoring account access...' }));
    const result = await postJson('/.netlify/functions/account-recovery', { action: 'verify', challengeId: accountRecoveryModal.challengeId, code, ...accountDeviceMetadata() });
    if (!result.ok) {
      setAccountRecoveryModal((current) => ({ ...current, busy: false, message: result.message || 'Account access could not be restored.' }));
      return;
    }
    const next = { ...bootstrap, tenantId: result.tenantId, userId: result.userId, displayName: result.account?.displayName || bootstrap.displayName, email: result.account?.email || bootstrap.email, phoneCountryCode: result.account?.phoneCountryCode || bootstrap.phoneCountryCode, phoneNumber: result.account?.phoneNumber || bootstrap.phoneNumber, phoneE164: result.account?.phoneE164 || bootstrap.phoneE164, accountName: result.account?.accountName || bootstrap.accountName, tenantName: result.account?.accountName || bootstrap.tenantName, planCode: result.account?.planCode || bootstrap.planCode, planStatus: result.account?.planStatus || bootstrap.planStatus, accountStatus: result.account?.accountStatus || bootstrap.accountStatus, tenantRole: result.account?.tenantRole || bootstrap.tenantRole, trialStartedAt: result.account?.trialStartedAt || '', trialEndsAt: result.account?.trialEndsAt || '', accountVerified: true, otpStatus: 'Device verified' };
    setBootstrap(next);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(next));
    if (result.entitlements) updateEntitlements(result.entitlements);
    setCustomerSession({ checked: true, authenticated: true, cloudAccess: result.cloudAccess !== false, accessCode: '', tenantId: result.tenantId || next.tenantId || '', userId: result.userId || next.userId || '', message: result.message, session: { deviceId: result.deviceId, expiresAt: result.sessionExpiresAt } });
    setAccountRecoveryModal({ visible: false, step: 'contact', channel: 'email', contact: '', challengeId: '', code: '', testOtpCode: '', message: '', busy: false });
    showMessage(result.message, 'success');
  }

  useEffect(() => {
    if (!mobileHeaderMenuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMobileHeaderMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileHeaderMenuOpen]);

  useEffect(() => {
    if (!entitlementModal.visible) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setEntitlementModal({ visible: false, feature: '', title: '', message: '' });
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [entitlementModal.visible]);

  useEffect(() => {
    if (!subscriptionActionModal.visible) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && billing.status !== 'updating') setSubscriptionActionModal({ visible: false, action: '', title: '', message: '', planCode: '', interval: '', mode: '' });
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [subscriptionActionModal.visible, billing.status]);

  useEffect(() => {
    if (activeSettingsSection !== 'subscription' || !customerSession.authenticated || isFounderPlan(bootstrap)) return;
    if (billing.loaded || ['refreshing', 'updating', 'opening-checkout', 'opening-portal'].includes(billing.status)) return;
    refreshCustomerSubscription();
    // Refresh once when the customer opens My Subscription. Further refreshes are manual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSettingsSection, customerSession.authenticated, billing.loaded]);

  useEffect(() => {
    if (activeSettingsSection !== 'account' || !customerSession.authenticated || accountSecurity.loading || accountSecurity.loaded) return;
    loadAccountSecurity({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSettingsSection, customerSession.authenticated, accountSecurity.loaded, accountSecurity.loading]);

  function applySubscriptionResult(result, options = {}) {
    const account = result?.account || {};
    const next = {
      ...bootstrap,
      displayName: account.displayName || bootstrap.displayName,
      email: account.email || bootstrap.email,
      accountName: account.accountName || bootstrap.accountName,
      tenantName: account.accountName || bootstrap.tenantName,
      planCode: account.planCode || result?.subscription?.planCode || bootstrap.planCode,
      planStatus: account.planStatus || bootstrap.planStatus,
      accountStatus: account.accountStatus || bootstrap.accountStatus,
      tenantRole: account.tenantRole || bootstrap.tenantRole,
      trialStartedAt: account.trialStartedAt || bootstrap.trialStartedAt || '',
      trialEndsAt: account.trialEndsAt || bootstrap.trialEndsAt || '',
      accountVerified: true,
      otpStatus: 'Device verified'
    };
    setBootstrap(next);
    if (result?.entitlements) updateEntitlements(result.entitlements);
    setCustomerSession((current) => ({
      ...current,
      checked: true,
      authenticated: true,
      subscription: result?.subscription || null,
      stripeConfigured: true
    }));
    setBilling((current) => ({
      ...current,
      status: options.status || 'ready',
      loaded: true,
      message: options.message ?? result?.message ?? '',
      subscription: result?.subscription || null,
      stripeConfigured: true,
      planCode: result?.subscription?.planCode || account.planCode || current.planCode || 'personal',
      interval: result?.subscription?.billingInterval || current.interval || 'monthly',
      paymentHistory: result?.paymentHistory || result?.subscription?.paymentHistory || [],
      nextInvoice: result?.nextInvoice || result?.subscription?.nextInvoice || null,
      duplicateSubscriptionIds: result?.duplicateSubscriptionIds || result?.subscription?.duplicateSubscriptionIds || []
    }));
    return result;
  }

  async function refreshCustomerSubscription(options = {}) {
    if (!customerSession.authenticated) {
      setBilling((current) => ({ ...current, status: 'verification-required', message: 'Verify this device before managing billing.', loaded: true }));
      return { ok: false, code: 'SESSION_REQUIRED', message: 'Verify this device before managing billing.' };
    }
    setBilling((current) => ({ ...current, status: 'refreshing', message: options.message || 'Refreshing directly from Stripe...' }));
    try {
      const response = await fetch('/.netlify/functions/stripe-subscription', { credentials: 'same-origin' });
      const result = await response.json().catch(() => ({ ok: false, message: 'Stripe returned an invalid response.' }));
      if (!response.ok || !result?.ok) {
        if (response.status === 401 || result?.code === 'SESSION_REQUIRED') {
          setBilling((current) => ({ ...current, status: 'verification-required', loaded: true, message: result?.message || 'Verify this device before managing billing.' }));
          return result;
        }
        setBilling((current) => ({
          ...current,
          status: 'error',
          loaded: true,
          message: result?.message || 'Subscription status could not be refreshed.',
          duplicateSubscriptionIds: result?.duplicateSubscriptionIds || []
        }));
        return result;
      }
      if (result.entitlements) updateEntitlements(result.entitlements);
      return applySubscriptionResult(result, { message: options.keepSuccessMessage ? (options.successMessage ?? result.message ?? '') : (options.successMessage || '') });
    } catch (error) {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      const message = offline ? 'Subscription details cannot refresh while this device is offline.' : 'Subscription status could not be refreshed.';
      setBilling((current) => ({ ...current, status: 'error', loaded: true, message }));
      return { ok: false, message: error.message };
    }
  }

  function updateEntitlements(nextValue) {
    if (!nextValue || typeof nextValue !== 'object') return entitlements;
    const previous = entitlements;
    const next = persistEntitlements(nextValue);
    setEntitlements(next);
    const backupWasIncluded = previous?.features?.cloudBackupSync !== false;
    const backupIsIncluded = next?.features?.cloudBackupSync !== false;
    if (backupWasIncluded && !backupIsIncluded) {
      saveSyncSafety({
        state: 'plan-local-only',
        pending: false,
        conflict: false,
        sessionRequired: false,
        message: 'Cloud backup and syncing are not included in the current plan. The encrypted vault remains available on this device.',
        itemCount: getVisibleVaultItems(items).length,
        lastFailureAt: '',
        acknowledgedAt: ''
      });
      setSyncPromptShown(true);
    } else if (!backupWasIncluded && backupIsIncluded && getLocalEnvelope()) {
      saveSyncSafety({
        state: 'backup-pending',
        pending: true,
        conflict: false,
        sessionRequired: false,
        message: 'Cloud backup is now available. Back up this device’s latest encrypted vault copy.',
        itemCount: getVisibleVaultItems(items).length,
        lastFailureAt: '',
        acknowledgedAt: ''
      });
      setSyncPromptShown(false);
    }
    return next;
  }

  function featureIncluded(feature) {
    return entitlements?.features?.[feature] !== false;
  }

  function showEntitlementUpgrade(feature, message = '') {
    const labels = { items: 'Vault items', documents: 'Encrypted documents', pictures: 'Encrypted pictures', storage: 'Account storage', emergencyAccess: 'Emergency Access', secureDeviceUnlock: 'Secure device unlock', cloudBackupSync: 'Cloud backup and sync', users: 'Additional users' };
    setEntitlementModal({ visible: true, feature, title: `${labels[feature] || 'This feature'} needs a plan upgrade`, message: message || `${labels[feature] || 'This feature'} is not included in the current plan or its plan limit has been reached.` });
  }

  function openSubscriptionFromEntitlement() {
    setEntitlementModal({ visible: false, feature: '', title: '', message: '' });
    if (locked) {
      showMessage('Unlock your vault to review subscription options.', 'warning');
      return;
    }
    openSettingsSection('subscription');
  }

  function handleEntitlementError(result, fallbackFeature = '') {
    if (!result?.upgradeRequired && !['PLAN_FEATURE_REQUIRED', 'ITEM_LIMIT_REACHED', 'DOCUMENT_LIMIT_REACHED', 'PHOTO_LIMIT_REACHED', 'STORAGE_LIMIT_REACHED', 'USER_LIMIT_REACHED'].includes(String(result?.code || ''))) return false;
    if (result.entitlements) updateEntitlements(result.entitlements);
    const feature = result.feature || (String(result.code || '').includes('ITEM') ? 'items' : (String(result.code || '').includes('STORAGE') ? 'storage' : (String(result.code || '').includes('DOCUMENT') ? 'documents' : (String(result.code || '').includes('PHOTO') ? 'pictures' : fallbackFeature))));
    showEntitlementUpgrade(feature, result.message);
    return true;
  }

  async function performSubscriptionAction(action, payload = {}) {
    if (!customerSession.authenticated) {
      setDeviceVerificationModal({ visible: true, purpose: 'billing' });
      return { ok: false };
    }
    setBilling((current) => ({ ...current, status: 'updating', message: 'Updating your subscription securely...' }));
    const result = await postJson('/.netlify/functions/stripe-subscription', { action, requestId: crypto.randomUUID(), ...payload });
    if (!result.ok) {
      setBilling((current) => ({
        ...current,
        status: 'error',
        loaded: true,
        message: result.message || 'The subscription change could not be completed.',
        duplicateSubscriptionIds: result.duplicateSubscriptionIds || []
      }));
      return result;
    }
    if (result.entitlements) updateEntitlements(result.entitlements);
    applySubscriptionResult(result, { status: 'success', message: result.message });
    showMessage(result.message || 'Subscription updated.', 'success');
    return result;
  }

  function reviewSubscriptionChange() {
    const currentSubscription = billing.subscription || customerSession.subscription || null;
    const currentPlan = publicPlans.find((plan) => plan.code === currentSubscription?.planCode) || null;
    const targetPlan = publicPlans.find((plan) => plan.code === billing.planCode) || null;
    if (!targetPlan) return;
    const mode = subscriptionChangeMode(currentSubscription, currentPlan, targetPlan, billing.interval);
    if (mode === 'none') {
      setBilling((current) => ({ ...current, status: 'ready', message: 'That plan and billing period are already active.' }));
      return;
    }
    const amount = billingPriceLabel(targetPlan, billing.interval);
    setSubscriptionActionModal({
      visible: true,
      action: 'change_subscription',
      title: mode === 'immediate' ? 'Confirm plan upgrade' : 'Schedule subscription change',
      message: mode === 'immediate'
        ? `Upgrade to ${targetPlan.displayName} with ${billingIntervalLabel(billing.interval).toLowerCase()} billing at ${amount}. The higher plan becomes active immediately and Stripe may add a prorated adjustment to your next invoice.`
        : `Change to ${targetPlan.displayName} with ${billingIntervalLabel(billing.interval).toLowerCase()} billing at ${amount}. Your current plan stays active until the next renewal, when this change will take effect.`,
      planCode: targetPlan.code,
      interval: billing.interval,
      mode
    });
  }

  function reviewSubscriptionCancellation() {
    const subscription = billing.subscription || customerSession.subscription || null;
    setSubscriptionActionModal({
      visible: true,
      action: 'cancel_at_period_end',
      title: 'Cancel at the end of this period?',
      message: `Your subscription and cloud services remain available until ${formatAccountDate(subscription?.currentPeriodEnd, true)}. No further renewal will be taken after that date.`,
      planCode: '', interval: '', mode: 'scheduled'
    });
  }

  function reviewSubscriptionReactivation() {
    setSubscriptionActionModal({
      visible: true,
      action: 'reactivate',
      title: 'Keep this subscription active?',
      message: 'The scheduled cancellation will be removed and the subscription will renew normally on its current renewal date.',
      planCode: '', interval: '', mode: 'immediate'
    });
  }

  async function confirmSubscriptionAction() {
    const pending = subscriptionActionModal;
    if (!pending.visible || !pending.action) return;
    const payload = pending.action === 'change_subscription' ? { planCode: pending.planCode, billingInterval: pending.interval } : {};
    const result = await performSubscriptionAction(pending.action, payload);
    if (result?.ok) setSubscriptionActionModal({ visible: false, action: '', title: '', message: '', planCode: '', interval: '', mode: '' });
  }

  async function startStripeCheckout() {
    if (!customerSession.authenticated) {
      setDeviceVerificationModal({ visible: true, purpose: 'billing' });
      return;
    }
    const selectedPlan = publicPlans.find((plan) => plan.code === (billing.planCode || bootstrap.planCode)) || null;
    if (!selectedPlan || !planIntervalAmount(selectedPlan, billing.interval)) {
      setBilling((current) => ({ ...current, status: 'error', message: `${billingIntervalLabel(billing.interval)} billing is not available for this plan.` }));
      return;
    }
    if (!billingTermsAccepted) {
      setBilling((current) => ({ ...current, status: 'error', message: 'Please read and agree to the Subscription, Cancellation & Refund Policy before continuing to Stripe Checkout.' }));
      return;
    }
    setBilling((current) => ({ ...current, status: 'opening-checkout', message: 'Opening secure Stripe Checkout...' }));
    const result = await postJson('/.netlify/functions/stripe-checkout', {
      planCode: selectedPlan.code,
      billingInterval: billing.interval,
      billingTermsAccepted: true,
      billingTermsVersion: LEGAL_VERSION,
      requestId: crypto.randomUUID()
    });
    if (!result.ok || !result.checkoutUrl) {
      setBilling((current) => ({ ...current, status: 'error', message: result.message || 'Stripe Checkout could not be opened.' }));
      return;
    }
    window.location.assign(result.checkoutUrl);
  }

  async function openStripePortal() {
    if (!customerSession.authenticated) {
      setDeviceVerificationModal({ visible: true, purpose: 'billing' });
      return;
    }
    setBilling((current) => ({ ...current, status: 'opening-portal', message: 'Opening Stripe Customer Portal...' }));
    const result = await postJson('/.netlify/functions/stripe-portal', {});
    if (!result.ok || !result.portalUrl) {
      setBilling((current) => ({ ...current, status: 'error', message: result.message || 'The billing portal could not be opened.' }));
      return;
    }
    window.location.assign(result.portalUrl);
  }

  function saveSyncSafety(patch) {
    setSyncSafety((current) => {
      const next = persistSyncSafetyState({ ...current, ...patch });
      return next;
    });
  }

  function closeSyncSafetyModal() {
    setSyncSafetyModal((current) => ({ ...current, visible: false }));
  }

  function showBackupFailurePopup(message, options = {}) {
    setSyncPromptShown(true);
    const sessionRequired = Boolean(options.sessionRequired);
    const itemCount = Number(options.itemCount ?? getVisibleVaultItems(options.items || items).length);
    saveSyncSafety({
      state: sessionRequired ? 'verification-required' : 'backup-pending',
      pending: true,
      conflict: false,
      sessionRequired,
      message,
      itemCount,
      lastFailureAt: new Date().toISOString(),
      acknowledgedAt: ''
    });
    setSyncSafetyModal({
      visible: true,
      mode: sessionRequired ? 'verification-required' : 'backup-failed',
      title: sessionRequired ? 'Verify this device to protect your latest changes' : 'Your latest changes are saved on this device only',
      message: sessionRequired
        ? 'Your vault change is safe on this device, but secure backup cannot continue until this device is verified. Do not clear this device or replace its vault copy.'
        : 'Your vault change is safe on this device, but it has not yet been backed up. It will not appear on your other devices until the backup succeeds.',
      details: { originalMessage: message, itemCount }
    });
  }

  function showConflictPopup(latest, localEnvelope, localItemCountOverride = null) {
    setSyncPromptShown(true);
    const localItemCount = Number(localItemCountOverride ?? getVisibleVaultItems(items).length);
    const cloudItemCount = Number(latest?.snapshot?.item_count || 0);
    saveSyncSafety({
      state: 'conflict',
      pending: true,
      conflict: true,
      sessionRequired: false,
      message: 'Different vault changes were found on this device and in secure backup. Nothing was replaced.',
      itemCount: localItemCount,
      lastFailureAt: new Date().toISOString(),
      acknowledgedAt: ''
    });
    setSyncSafetyModal({
      visible: true,
      mode: 'conflict',
      title: 'Choose the current vault copy',
      message: 'Two different vault copies were found. The newer recorded copy is marked Recommended. Tap the copy you want to keep.',
      details: { latest, localEnvelope, localItemCount, cloudItemCount }
    });
  }

  async function recordSyncEvent(eventType, status, details = {}) {
    try {
      await postJson('/.netlify/functions/sync-vault', {
        action: 'record_event',
        eventType,
        status,
        itemCount: Number(details.itemCount ?? getVisibleVaultItems(items).length),
        message: String(details.message || '').slice(0, 500),
        deviceId: getSyncDeviceId(),
        metadata: { deviceType: friendlyDeviceType(), source: details.source || 'vault-app', ...details.metadata }
      });
    } catch {
      // Diagnostics must never block the encrypted vault.
    }
  }

  async function retryPendingBackup() {
    closeSyncSafetyModal();
    if (!featureIncluded('cloudBackupSync')) {
      showEntitlementUpgrade('cloudBackupSync', 'Cloud backup and sync are not included in the current plan. Your encrypted vault remains available locally on this device.');
      return;
    }
    if (!customerSession.authenticated) {
      await openDeviceVerification();
      return;
    }
    setSyncPromptShown(false);
    saveSyncSafety({ state: 'backing-up', pending: false, conflict: false, sessionRequired: false, message: 'Protecting your latest changes...' });
    const result = await syncEncryptedVault({ envelope: getLocalEnvelope(), nextItems: items, silent: false, retry: true });
    if (result?.ok) showMessage('Your latest vault changes are now backed up and available on your devices.', 'success');
  }

  function handleVaultStatusCheck() {
    const action = syncSafetyModal.details?.action || '';
    closeSyncSafetyModal();
    if (action === 'session-check') {
      window.dispatchEvent(new Event('password-encrypt-session-check'));
      showMessage('Checking device verification status...');
      return;
    }
    refreshVaultAndBackup();
  }

  function acknowledgeBackupWarning() {
    saveSyncSafety({ acknowledgedAt: new Date().toISOString() });
    closeSyncSafetyModal();
  }

  function chooseOtpChannel(nextChannel) {
    const channel = SMS_AUTH_VERIFICATION_UI_ENABLED && nextChannel === 'sms' ? 'sms' : 'email';
    setOtpChannel(channel);
    setOtpTest({
      status: 'not-requested',
      challengeId: '',
      code: '',
      input: '',
      message: channel === 'sms' ? 'Tap Send SMS code when you are ready.' : 'Tap Send email code when you are ready.',
      verified: false,
      expiresAt: ''
    });
  }

  function openDeviceVerification() {
    closeSyncSafetyModal();
    setOtpChannel('email');
    setOtpTest({
      status: 'not-requested',
      challengeId: '',
      code: '',
      input: '',
      message: 'Request an email verification code when you are ready.',
      verified: false,
      expiresAt: ''
    });
    setDeviceVerificationModal({ visible: true, purpose: syncSafety.pending ? 'finish-backup' : 'verify-device' });
  }

  async function keepThisDeviceCopy() {
    closeSyncSafetyModal();
    const result = await syncEncryptedVault({ envelope: getLocalEnvelope(), nextItems: items, silent: false, explicitConflictChoice: true });
    if (result?.ok) {
      saveSyncSafety({ state: 'up-to-date', pending: false, conflict: false, sessionRequired: false, message: 'Your vault is up to date.', lastSuccessAt: new Date().toISOString(), acknowledgedAt: '' });
      showMessage('This device’s vault is now backed up and available on your other devices.', 'success');
    }
  }

  async function useSecureBackupCopy() {
    const latest = syncSafetyModal.details?.latest;
    closeSyncSafetyModal();
    if (!masterPassword || !latest?.snapshot) {
      openVaultSafetySettings();
      showMessage('Unlock the vault with your master password before choosing the secure backup copy.', 'warning');
      return;
    }
    try {
      const result = await restoreLatestCloudVault(masterPassword, { showSuccess: false, reason: 'explicit-cloud-choice', forceCloud: true, latestOverride: latest });
      if (result?.restored) {
        saveSyncSafety({ state: 'up-to-date', pending: false, conflict: false, sessionRequired: false, message: 'Your vault is up to date.', lastSuccessAt: new Date().toISOString(), lastSnapshotId: result.latest?.snapshot?.id || '', acknowledgedAt: '' });
        showMessage('The secure backup copy is now active on this device.', 'success');
      }
    } catch {
      showBackupFailurePopup('The secure backup copy could not be opened. Nothing was changed.', { itemCount: getVisibleVaultItems(items).length });
    }
  }

  async function confirmDangerAction() {
    const action = syncSafetyModal.details?.action;
    closeSyncSafetyModal();
    if (action === 'end-session') await performEndCustomerSession();
    if (action === 'clear-local') performClearLocalVault();
    if (action === 'restore-cloud') await restoreCloudToThisDevice(true);
    if (action === 'lock-vault') lockVault('Vault locked.', { force: true });
  }

  function toastTypeFromMessage(text) {
    const value = String(text || '').toLowerCase();
    if (value.includes('failed') || value.includes('could not') || value.includes('wrong') || value.includes('error') || value.includes('not ready') || value.includes('nothing was saved') || value.includes('needs attention')) return 'error';
    if (value.includes('warning') || value.includes('bootstrap') || value.includes('confirm') || value.includes('not synced') || value.includes('pending')) return 'warning';
    if (value.includes('copied')) return 'copy';
    if (value.includes('complete') || value.includes('verified') || value.includes('saved') || value.includes('ready') || value.includes('passed') || value.includes('restored') || value.includes('unlocked') || value.includes('synced')) return 'success';
    return 'info';
  }

  function showToast(text, type = 'info') {
    const id = crypto.randomUUID();
    const visualType = type === 'error' || type === 'warning' ? 'error' : 'success';
    setToasts((current) => [...current.slice(-3), { id, text, type: visualType }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, visualType === 'error' ? 5200 : 3600);
  }

  function showMessage(text, type) {
    const safeText = String(text || '');
    setMessage(safeText);
    if (safeText.trim()) showToast(safeText, type || toastTypeFromMessage(safeText));
  }

  function dismissToast(id) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function showVerifyOverlay(status, title, message, options = {}) {
    setVerifyOverlay({ visible: true, status, title, message, focusMasterPassword: !!options.focusMasterPassword });
  }

  function hideVerifyOverlay() {
    setVerifyOverlay((current) => ({ ...current, visible: false }));
  }

  function focusMasterPassword() {
    const returnToLockedVault = !locked && hasLocalVault;

    if (returnToLockedVault) {
      setActivePage('vault');
      setMasterPassword('');
      setShowUnlockPassword(true);
      setLocked(true);
      showMessage('Account verified. Enter your master password to check for newer cloud changes.', 'success');
    }

    setMasterPasswordFieldArmed(true);

    const focusField = (attempt = 0) => {
      const field = document.getElementById('master-password-input');
      if (!field && attempt < 8) {
        window.setTimeout(() => focusField(attempt + 1), 80);
        return;
      }
      if (field) {
        field.readOnly = false;
        field.scrollIntoView({ behavior: 'smooth', block: 'center' });
        try {
          field.focus({ preventScroll: true });
        } catch (error) {
          field.focus();
        }
        field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };

    window.setTimeout(() => focusField(), returnToLockedVault ? 140 : 40);
  }

  function armMasterPasswordField(event) {
    if (event?.currentTarget) event.currentTarget.readOnly = false;
    if (masterPasswordFieldArmed) return;
    setMasterPassword('');
    setMasterPasswordFieldArmed(true);
  }

  useEffect(() => {
    if (!locked || !hasLocalVault || masterPasswordFieldArmed) return undefined;
    setMasterPassword('');
    const clearBackgroundAutofill = () => {
      const field = masterPasswordInputRef.current;
      if (field && field.value) field.value = '';
    };
    clearBackgroundAutofill();
    const timer = window.setInterval(clearBackgroundAutofill, 200);
    return () => window.clearInterval(timer);
  }, [locked, hasLocalVault, masterPasswordFieldArmed]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      capturedPasswordEncryptInstallPrompt = event;
      window.__passwordEncryptInstallPrompt = event;
      installPromptRef.current = event;
      setInstallPromptReady(true);
      if (!isPasswordEncryptInstalled()) {
        setInstallStatus('ready');
        setInstallMessage('Password-Encrypt is ready to install on this device.');
      }
    };
    const handleAppInstalled = () => {
      capturedPasswordEncryptInstallPrompt = null;
      window.__passwordEncryptInstallPrompt = null;
      installPromptRef.current = null;
      setInstallPromptReady(false);
      setInstallStatus('installed');
      setInstallMessage('Password-Encrypt is installed and ready to open like an app.');
    };
    if (isPasswordEncryptInstalled()) {
      setInstallStatus('installed');
      setInstallMessage('Password-Encrypt is already installed on this device.');
    } else if (capturedPasswordEncryptInstallPrompt || window.__passwordEncryptInstallPrompt) {
      capturedPasswordEncryptInstallPrompt = capturedPasswordEncryptInstallPrompt || window.__passwordEncryptInstallPrompt;
      installPromptRef.current = capturedPasswordEncryptInstallPrompt;
      setInstallPromptReady(true);
      setInstallStatus('ready');
      setInstallMessage('Password-Encrypt is ready to install on this device.');
    }
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useLayoutEffect(() => {
    if (!isCreateAccountPopupOpen) return;
    const body = createAccountPopupBodyRef.current;
    if (!body) return;
    body.scrollTop = 0;
    if (typeof body.scrollTo === 'function') body.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [isCreateAccountPopupOpen, landingOnboardingStep]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const workerUrl = `/sw.js?v=${encodeURIComponent(VERSION)}`;
    const registerWorker = () => navigator.serviceWorker.register(workerUrl, { updateViaCache: 'none' }).then((registration) => registration.update().catch(() => null)).catch(() => null);
    registerWorker();
    window.addEventListener('online', registerWorker);
    return () => window.removeEventListener('online', registerWorker);
  }, []);

  useEffect(() => {
    if (!locked && masterPassword) {
      const timeout = setTimeout(() => lockVault('Vault auto-locked after inactivity.'), 10 * 60 * 1000);
      return () => clearTimeout(timeout);
    }
  }, [locked, masterPassword, items]);

  useEffect(() => {
    const phoneE164 = bootstrap.phoneE164 || buildPhoneE164(bootstrap.phoneCountryCode, bootstrap.phoneNumber);
    const account = { ...bootstrap, phoneCountryCode: normaliseCountryCode(bootstrap.phoneCountryCode || '+254') || '+254', phoneCountryIso: getCountryByCode(bootstrap.phoneCountryCode || '+254', bootstrap.phoneCountryIso).iso, phoneNumber: String(bootstrap.phoneNumber || '').trim(), phoneE164 };
    localStorage.setItem(BOOTSTRAP_KEY, JSON.stringify(account));
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  }, [bootstrap]);

  useEffect(() => {
    let cancelled = false;
    const loadPublicPlans = () => {
      fetch('/.netlify/functions/public-plans')
        .then((response) => response.json())
        .then((result) => {
          if (cancelled || !result?.ok || !Array.isArray(result.plans)) return;
          setPublicPlans(result.plans.map((plan) => ({
            code: plan.code,
            displayName: plan.display_name,
            description: plan.description,
            currency: plan.currency,
            monthlyPriceMinor: Number(plan.monthly_price_minor || 0),
            quarterlyPriceMinor: Number(plan.quarterly_price_minor || 0),
            annualPriceMinor: Number(plan.annual_price_minor || 0),
            trialDays: Number(plan.trial_days || 0),
            maxUsers: Number(plan.max_users || 1),
            itemLimit: Number(plan.item_limit || 0),
            storageLimitMb: Number(plan.storage_limit_mb || 0),
            documentLimit: Number(plan.document_limit || 0),
            photoLimit: Number(plan.photo_limit || 0),
            features: Array.isArray(plan.features) ? plan.features.filter(Boolean) : [],
            featureFlags: { ...DEFAULT_ENTITLEMENTS.features, ...(plan.feature_flags || {}), multiUser: false, sharing: false },
            isFeatured: Boolean(plan.is_featured),
            displayOrder: Number(plan.display_order || 0),
            stripeSyncStatus: plan.stripe_sync_status || '',
            stripeMonthlyReady: Boolean(plan.stripe_monthly_price_id),
            stripeQuarterlyReady: Boolean(plan.stripe_quarterly_price_id),
            stripeAnnualReady: Boolean(plan.stripe_annual_price_id)
          })));
        })
        .catch(() => null);
    };
    loadPublicPlans();
    window.addEventListener('online', loadPublicPlans);
    return () => {
      cancelled = true;
      window.removeEventListener('online', loadPublicPlans);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let sessionCheckPromise = null;
    let lastSessionCheckStartedAt = 0;

    async function checkSecureSession({ force = false } = {}) {
      if (onboardingSessionIsolationRef.current) return null;
      if (sessionCheckPromise) return sessionCheckPromise;
      if (!force && Date.now() - lastSessionCheckStartedAt < 1200) return null;
      lastSessionCheckStartedAt = Date.now();

      sessionCheckPromise = (async () => {
        try {
          const csrfToken = sessionStorage.getItem('mp_customer_csrf') || '';
          const response = await fetch('/.netlify/functions/session-status', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'content-type': 'application/json', 'x-mp-request': '1', ...(csrfToken ? { 'x-mp-csrf': csrfToken } : {}) },
            body: JSON.stringify({ action: 'status', ...accountDeviceMetadata() })
          });
          const result = await response.json().catch(() => ({ ok: false, message: 'Device verification returned an invalid response.' }));
          if (result?.csrfToken) sessionStorage.setItem('mp_customer_csrf', result.csrfToken);
          if (cancelled) return result;

          // A temporary function/database failure must not convert a previously
          // verified device into an unverified one. Keep the last known session
          // state and expose a separate Vault Status check-needed state instead.
          if (!response.ok || result?.ok === false) {
            setCustomerSession((current) => ({
              ...current,
              checked: true,
              accessCode: 'SESSION_CHECK_FAILED',
              message: result?.message || 'Device verification could not be checked.'
            }));
            return result;
          }

          if (result?.authenticated) {
            setBootstrap((currentBootstrap) => {
              const next = {
                ...currentBootstrap,
                tenantId: result.tenantId || currentBootstrap.tenantId,
                userId: result.userId || currentBootstrap.userId,
                displayName: result.account?.displayName || currentBootstrap.displayName,
                email: result.account?.email || currentBootstrap.email,
                phoneE164: result.account?.phoneE164 || currentBootstrap.phoneE164,
                accountName: result.account?.accountName || currentBootstrap.accountName,
                tenantName: result.account?.accountName || currentBootstrap.tenantName,
                planCode: result.account?.planCode || currentBootstrap.planCode,
                planStatus: result.account?.planStatus || currentBootstrap.planStatus,
                accountStatus: result.account?.accountStatus || currentBootstrap.accountStatus,
                tenantRole: result.account?.tenantRole || currentBootstrap.tenantRole,
                trialStartedAt: result.account?.trialStartedAt || currentBootstrap.trialStartedAt || '',
                trialEndsAt: result.account?.trialEndsAt || currentBootstrap.trialEndsAt || '',
                trialDaysRemaining: result.account?.trialDaysRemaining ?? currentBootstrap.trialDaysRemaining ?? null,
                onboardingCompletedAt: result.account?.onboardingCompletedAt || currentBootstrap.onboardingCompletedAt || '',
                accountVerified: true,
                otpStatus: 'Device verified'
              };
              localStorage.setItem(ACCOUNT_KEY, JSON.stringify(next));
              return next;
            });
            if (result.entitlements) updateEntitlements(result.entitlements);
            const cloudAccess = result.cloudAccess !== false;
            setCustomerSession({ checked: true, authenticated: true, cloudAccess, accessCode: result.accessCode || '', tenantId: result.tenantId || '', userId: result.userId || '', message: result.message || (cloudAccess ? 'This device is verified for secure backup and syncing.' : 'Cloud features are paused for this account.'), subscription: result.subscription || null, stripeConfigured: Boolean(result.stripeConfigured), session: result.session || null, deletion: result.deletion || null });
            setBilling((current) => ({ ...current, subscription: result.subscription || null, stripeConfigured: Boolean(result.stripeConfigured), planCode: result.subscription?.planCode || result.account?.planCode || current.planCode || 'personal' }));
            setAccountStatus({ state: cloudAccess ? 'ready' : 'access-paused', message: result.message || (cloudAccess ? 'Cloud backup and secure syncing are active on this device.' : 'Cloud backup and syncing are currently paused.') });
          } else {
            setCustomerSession({ checked: true, authenticated: false, cloudAccess: false, accessCode: result?.code || 'SESSION_REQUIRED', tenantId: '', userId: '', message: result?.message || 'Verify this device to enable secure backup and syncing.', subscription: null, stripeConfigured: Boolean(result?.stripeConfigured) });
            setAccountStatus({ state: 'session-needed', message: result?.message || 'Verify this device to enable secure backup and syncing.' });
          }
          return result;
        } catch (error) {
          if (!cancelled) {
            setCustomerSession((current) => ({ ...current, checked: true, accessCode: 'SESSION_CHECK_FAILED', message: 'Device verification could not be checked.' }));
          }
          return null;
        }
      })();

      try {
        return await sessionCheckPromise;
      } finally {
        sessionCheckPromise = null;
      }
    }

    const refreshVisibleSession = () => {
      if (document.visibilityState === 'visible') checkSecureSession();
    };
    const forceSessionCheck = () => checkSecureSession({ force: true });
    const renewalTimer = window.setInterval(checkSecureSession, 6 * 60 * 60 * 1000);
    checkSecureSession({ force: true });
    window.addEventListener('online', refreshVisibleSession);
    window.addEventListener('focus', refreshVisibleSession);
    window.addEventListener('password-encrypt-session-check', forceSessionCheck);
    document.addEventListener('visibilitychange', refreshVisibleSession);
    return () => {
      cancelled = true;
      window.clearInterval(renewalTimer);
      window.removeEventListener('online', refreshVisibleSession);
      window.removeEventListener('focus', refreshVisibleSession);
      window.removeEventListener('password-encrypt-session-check', forceSessionCheck);
      document.removeEventListener('visibilitychange', refreshVisibleSession);
    };
    // Session checks are deliberately single-flight so app-open focus/visibility
    // events cannot race a 24-hour session rotation and accidentally clear a
    // freshly renewed cookie.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    pushActivationPromptShownRef.current = false;
    setPushActivationPromptOpen(false);
  }, [customerSession.userId]);

  useEffect(() => {
    if (!customerSession.authenticated) {
      setPushNotifications((current) => ({ ...current, loaded: false, loading: false, permission: pushPermissionState(), enabledThisDevice: false, activeCount: 0, message: '' }));
      return;
    }
    loadPushNotificationStatus({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerSession.authenticated, customerSession.userId]);

  useEffect(() => {
    if (locked || !customerSession.authenticated || !pushNotifications.loaded || pushActivationPromptShownRef.current) return;
    if (!pushNotifications.supported || !pushNotifications.configured || pushNotifications.enabledThisDevice) return;
    if (isPushActivationPromptSuppressed(customerSession)) return;
    pushActivationPromptShownRef.current = true;
    setPushActivationPromptOpen(true);
  }, [locked, customerSession.authenticated, customerSession.tenantId, customerSession.userId, pushNotifications.loaded, pushNotifications.supported, pushNotifications.configured, pushNotifications.enabledThisDevice]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const openTarget = params.get('open');
    if (!['emergency', 'notifications', 'settings'].includes(openTarget || '')) return;
    if (locked || !customerSession.authenticated) return;
    setActivePage('settings');
    setActiveSettingsSection(openTarget === 'settings' ? 'overview' : openTarget === 'emergency' ? 'emergency-nominate' : openTarget);
    params.delete('open');
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash || ''}`);
    scrollSettingsToTop();
  }, [locked, customerSession.authenticated]);

  useEffect(() => {
    if (!hasLocalVault || !customerSession.authenticated) return;
    const envelope = getLocalEnvelope();
    const localOwner = vaultOwnerBindingFromEnvelope(envelope || {});
    const sessionOwner = { tenantId: String(customerSession.tenantId || ''), userId: String(customerSession.userId || '') };
    if (!hasCompleteVaultOwnerBinding(localOwner) || !hasCompleteVaultOwnerBinding(sessionOwner) || vaultOwnerBindingsMatch(localOwner, sessionOwner)) return;
    const note = 'Password-Encrypt detected that this browser session changed to a different account. The local vault has been locked and no account data was mixed.';
    if (!locked) lockVault(note, { force: true });
    setAccountStatus({ state: 'account-mismatch', message: note });
    showVerifyOverlay('error', 'Different account detected', note);
  }, [customerSession.authenticated, customerSession.tenantId, customerSession.userId, hasLocalVault]);

  useEffect(() => {
    if (locked || billing.returnState) return;
    const params = new URLSearchParams(window.location.search);
    const returnState = params.get('billing') || '';
    if (!returnState) return;
    const sessionId = params.get('session_id') || '';
    setBilling((current) => ({ ...current, returnState, status: returnState === 'success' ? 'processing' : 'ready', message: returnState === 'success' ? 'Stripe is confirming your subscription...' : returnState === 'cancelled' ? 'Checkout was cancelled. No subscription change was made.' : 'Billing details were updated.' }));
    openSubscriptionSettings();
    window.history.replaceState(window.history.state || {}, document.title, window.location.pathname);

    if (returnState === 'success' && sessionId) {
      let cancelled = false;
      (async () => {
        await fetch(`/.netlify/functions/stripe-checkout-status?session_id=${encodeURIComponent(sessionId)}`, { credentials: 'same-origin' }).catch(() => null);
        for (let attempt = 0; attempt < 6 && !cancelled; attempt += 1) {
          const result = await refreshCustomerSubscription({ message: 'Stripe is confirming your subscription...' });
          if (['active', 'trialing'].includes(String(result?.subscription?.status || '').toLowerCase())) {
            setBilling((current) => ({ ...current, status: 'success', message: 'Your subscription is active.' }));
            showMessage('Subscription active.', 'success');
            break;
          }
          await new Promise((resolve) => window.setTimeout(resolve, 1800));
        }
      })();
      return () => { cancelled = true; };
    }
    if (returnState === 'cancelled') {
      postJson('/.netlify/functions/stripe-checkout-cancel', { requestId: crypto.randomUUID() }).then(() => refreshCustomerSubscription({ message: 'Checkout was cancelled. No subscription change was made.' })).catch(() => null);
      showMessage('Checkout cancelled. No payment was taken.', 'error');
    }
    if (returnState === 'portal-return') refreshCustomerSubscription();
  }, [locked, billing.returnState]);

  useEffect(() => {
    if (locked) return;
    if (!items.some(isEmergencyAccessHubItem)) return;
    const next = items.filter((item) => !isEmergencyAccessHubItem(item));
    saveItems(next, { autoSync: true, silentAutoSync: true, refreshEmergencyPackage: false }).catch(() => null);
  }, [locked, items]);

  useEffect(() => {
    if (!locked) setEmergencyDraft(getEmergencyAccessPlan(items));
  }, [locked, items]);

  useEffect(() => {
    if (locked || !isOnline || !customerSession.authenticated || !masterPassword) return;
    scheduleEmergencyPackageMaintenance(items, 'vault_open_or_online');
  }, [locked, isOnline, customerSession.authenticated]);

  useEffect(() => {
    const popupOpen = isItemPopupOpen || Boolean(viewItemId) || Boolean(pendingDeleteItemId) || isFolderPopupOpen || isFolderListPopupOpen || folderManager.visible || isCreateAccountPopupOpen || isOpenVaultChoicePopupOpen || isCreateVaultPopupOpen || syncSafetyModal.visible || deviceVerificationModal.visible || subscriptionActionModal.visible || entitlementModal.visible || accountSecurityModal.visible || accountRecoveryModal.visible || trustedPersonHelpOpen || emergencyImportState.visible || exitAppConfirmationOpen;
    document.body.classList.toggle('app-popup-open', popupOpen);
    if (popupOpen) {
      window.requestAnimationFrame(() => {
        const active = document.activeElement;
        const editable = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement || active?.getAttribute?.('contenteditable') === 'true';
        if (editable) active.blur();
      });
    }
    return () => document.body.classList.remove('app-popup-open');
  }, [isItemPopupOpen, viewItemId, pendingDeleteItemId, isFolderPopupOpen, isFolderListPopupOpen, folderManager.visible, isCreateAccountPopupOpen, isOpenVaultChoicePopupOpen, isCreateVaultPopupOpen, syncSafetyModal.visible, deviceVerificationModal.visible, subscriptionActionModal.visible, entitlementModal.visible, accountSecurityModal.visible, accountSecurityModal.challengeId, accountRecoveryModal.visible, accountRecoveryModal.step, landingOnboardingStep, otpTest.challengeId, trustedPersonHelpOpen, emergencyImportState.visible, exitAppConfirmationOpen]);

  // Ver-1.006: Vault Status is the single repair entry point.
  // Routine sync problems no longer open an automatic delayed warning popup.


  useEffect(() => {
    async function tryAutomaticRetry() {
      if (locked || !featureIncluded('cloudBackupSync') || !syncSafety.pending || syncSafety.conflict || !customerSession.authenticated || customerSession.cloudAccess === false || syncing || syncOperationRef.current || syncRetryRef.current || !navigator.onLine) return;
      syncRetryRef.current = true;
      try {
        await syncEncryptedVault({ envelope: getLocalEnvelope(), nextItems: items, silent: true, retry: true, suppressFailureModal: true });
      } finally {
        syncRetryRef.current = false;
      }
    }
    const onlineHandler = () => tryAutomaticRetry();
    window.addEventListener('online', onlineHandler);
    const timer = window.setTimeout(tryAutomaticRetry, 2600);
    return () => {
      window.removeEventListener('online', onlineHandler);
      window.clearTimeout(timer);
    };
  }, [locked, syncSafety.pending, syncSafety.conflict, customerSession.authenticated, customerSession.cloudAccess, syncing, items]);

  useEffect(() => {
    const runCleanup = () => processPendingDocumentDeletions();
    runCleanup();
    window.addEventListener('online', runCleanup);
    return () => window.removeEventListener('online', runCleanup);
  }, [locked, customerSession.authenticated, bootstrap.tenantId, bootstrap.userId, syncSafety.pending, entitlements.features.cloudBackupSync]);

  useEffect(() => {
    if (!locked) setIsCreateVaultPopupOpen(false);
  }, [locked]);

  useEffect(() => {
    if (locked || activeSettingsSection !== 'emergency-nominate' || !customerSession.authenticated || !emergencyDraft.invitationId) return;

    let stopped = false;
    let checking = false;
    const checkCurrentEmergencyStage = async () => {
      if (stopped || checking || document.visibilityState === 'hidden') return;
      checking = true;
      try {
        await checkEmergencyInvitationStatus({ silent: true, automatic: true });
      } finally {
        checking = false;
      }
    };

    // Check immediately when Trusted Person Access opens, then keep the owner-side
    // progress current while this screen remains open. Acceptance itself is saved
    // immediately by the public response endpoint; this poll only refreshes the
    // owner's view and never controls release of the emergency package.
    checkCurrentEmergencyStage();
    const timer = window.setInterval(checkCurrentEmergencyStage, 30000);
    const visibilityHandler = () => {
      if (document.visibilityState === 'visible') checkCurrentEmergencyStage();
    };
    document.addEventListener('visibilitychange', visibilityHandler);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visibilityHandler);
    };
  }, [
    locked, activeSettingsSection, customerSession.authenticated, emergencyDraft.invitationId,
    emergencyDraft.invitationStatus, emergencyDraft.invitationAcceptedAt, emergencyDraft.requestStatus,
    emergencyDraft.requestId, emergencyDraft.requestWaitingEndsAt, items
  ]);

  async function fetchLatestCloudSnapshot(account = bootstrap) {
    if (!featureIncluded('cloudBackupSync')) return { ok: false, code: 'PLAN_FEATURE_REQUIRED', feature: 'cloudBackupSync', upgradeRequired: true, entitlements, hasSnapshot: false, message: 'Cloud backup and sync are not included in the current plan.' };
    if (!account.tenantId || !account.userId) return { ok: false, hasSnapshot: false, message: 'Account identity is not verified on this device yet.' };
    const response = await fetch('/.netlify/functions/sync-vault');
    const result = await response.json().catch(() => ({ ok: false, message: 'Secure backup returned an invalid response.' }));
    return response.ok ? result : { ...result, ok: false, httpStatus: response.status };
  }

  async function restoreLatestCloudVault(passwordToUse, { showSuccess = true, reason = 'manual', account = bootstrap, forceCloud = false, latestOverride = null } = {}) {
    const checkedAt = new Date().toISOString();
    setDeviceStatus((current) => ({
      ...current,
      state: 'checking-cloud',
      label: 'Checking whether your vault is up to date...',
      lastCloudCheckAt: checkedAt
    }));
    const latest = latestOverride || await fetchLatestCloudSnapshot(account);
    if (!latest?.ok) {
      if (latest?.code === 'PLAN_FEATURE_REQUIRED') {
        if (latest.entitlements) updateEntitlements(latest.entitlements);
        const note = latest.message || 'Cloud backup and sync are not included in the current plan.';
        setDeviceStatus((current) => ({ ...current, state: 'plan-feature-required', label: note, lastCloudCheckAt: checkedAt }));
        setCustomerSession((current) => ({ ...current, cloudAccess: false, accessCode: 'PLAN_FEATURE_REQUIRED', message: note }));
        saveSyncSafety({ state: 'plan-local-only', pending: false, conflict: false, sessionRequired: false, message: note, itemCount: getVisibleVaultItems(items).length, lastFailureAt: '', acknowledgedAt: '' });
        if (reason !== 'unlock') showEntitlementUpgrade('cloudBackupSync', note);
        return { restored: false, latest, planFeatureRequired: true };
      }
      const sessionRequired = latest?.code === 'SESSION_REQUIRED' || Number(latest?.httpStatus || 0) === 401;
      const note = sessionRequired
        ? 'Verify this device to continue secure backup and syncing.'
        : (latest?.message || 'Secure backup could not be checked. This device kept its current vault copy.');
      setDeviceStatus((current) => ({ ...current, state: sessionRequired ? 'session-needed' : 'cloud-check-failed', label: note, lastCloudCheckAt: checkedAt }));
      if (sessionRequired) {
        setCustomerSession({ checked: true, authenticated: false, cloudAccess: false, accessCode: 'SESSION_REQUIRED', tenantId: '', userId: '', message: 'Verify this device to enable secure backup and syncing.' });
        setAccountStatus({ state: 'session-needed', message: 'Verify this device to enable secure backup and syncing.' });
      }
      const unsyncedEnvelope = getLocalEnvelope();
      if (unsyncedEnvelope && !unsyncedEnvelope.cloudSnapshotId) {
        saveSyncSafety({ state: sessionRequired ? 'verification-required' : 'backup-pending', pending: true, conflict: false, sessionRequired, message: sessionRequired ? 'Verify this device to finish backing up changes stored here.' : 'Changes stored on this device are still waiting for backup.', lastFailureAt: new Date().toISOString(), acknowledgedAt: '' });
      }
      return { restored: false, latest, sessionRequired };
    }
    if (!latest?.hasSnapshot || !latest.snapshot) {
      const localEnvelope = getLocalEnvelope();
      if (localEnvelope) {
        saveSyncSafety({ state: 'backup-pending', pending: true, conflict: false, sessionRequired: false, message: 'This device has the only current vault copy. Back it up before using another device.', itemCount: getVisibleVaultItems(items).length, lastFailureAt: '', acknowledgedAt: '' });
        setDeviceStatus((current) => ({ ...current, state: 'local-newer', label: 'This device has the only current vault copy. Nothing was replaced.', lastCloudCheckAt: checkedAt }));
        return { restored: false, localNewer: true, latest, localEnvelope };
      }
      setDeviceStatus((current) => ({ ...current, state: 'no-cloud-snapshot', label: 'No secure backup exists yet. Nothing was changed.', lastCloudCheckAt: checkedAt }));
      return { restored: false, latest };
    }

    const localEnvelope = getLocalEnvelope();
    const freshness = forceCloud ? 'cloud-newer-clean' : compareLocalAndCloudVault(localEnvelope, latest.snapshot);
    if (freshness === 'same') {
      saveSyncSafety({ state: 'up-to-date', pending: false, conflict: false, sessionRequired: false, message: 'Your vault is up to date.', lastSuccessAt: latest.snapshot.created_at || latest.snapshot.client_updated_at || new Date().toISOString(), lastSnapshotId: latest.snapshot.id || '', acknowledgedAt: '' });
      setDeviceStatus({ state: 'up-to-date', label: 'Your vault is up to date on this device.', lastCloudCheckAt: checkedAt, lastRestoreAt: '', latestSnapshotId: latest.snapshot.id || '', latestCloudItemCount: Number(latest.snapshot.item_count || 0), source: reason === 'unlock' ? 'checked-on-unlock' : 'cloud-check' });
      return { restored: false, upToDate: true, latest };
    }
    if (freshness === 'local-newer') {
      saveSyncSafety({ state: 'backup-pending', pending: true, conflict: false, sessionRequired: false, message: 'Changes from this device are waiting to be backed up.', itemCount: getVisibleVaultItems(items).length, lastFailureAt: new Date().toISOString(), acknowledgedAt: '' });
      setDeviceStatus({ state: 'local-newer', label: 'This device has changes that are waiting to be backed up. Nothing was replaced.', lastCloudCheckAt: checkedAt, lastRestoreAt: '', latestSnapshotId: latest.snapshot.id || '', latestCloudItemCount: Number(latest.snapshot.item_count || 0), source: 'newer-local-vault-protected' });
      return { restored: false, localNewer: true, latest, localEnvelope };
    }
    if (freshness === 'conflict') {
      setDeviceStatus({ state: 'conflict', label: 'Different changes were found on this device and in secure backup. Nothing was replaced.', lastCloudCheckAt: checkedAt, lastRestoreAt: '', latestSnapshotId: latest.snapshot.id || '', latestCloudItemCount: Number(latest.snapshot.item_count || 0), source: 'conflict-protected' });
      let localItemCount = getVisibleVaultItems(items).length;
      try {
        const localItemsForCount = localEnvelope ? await decryptEnvelope(localEnvelope, passwordToUse) : [];
        localItemCount = getVisibleVaultItems(localItemsForCount).length;
      } catch {
        // The normal unlock path will show a password error if the local copy cannot be opened.
      }
      showConflictPopup(latest, localEnvelope, localItemCount);
      await recordSyncEvent('vault_conflict_detected', 'warning', { itemCount: localItemCount, message: 'Different local and cloud vault branches detected.', source: reason });
      return { restored: false, conflict: true, latest, localEnvelope };
    }

    const restoredItems = await decryptEnvelope(latest.snapshot, passwordToUse);
    storeCloudSnapshotLocally(latest.snapshot, account);
    setHasLocalVault(true);
    setCreateMode(false);
    setConfirmMasterPassword('');
    setItems(restoredItems);
    const snapshotCount = Number(latest.snapshotCount || snapshotHistory.total || 1);
    setSyncStatus((current) => ({ ...current, state: 'success', message: `Your vault is up to date. ${restoredItems.length} item(s) are available on this device.`, lastSyncAt: latest.snapshot.created_at || latest.snapshot.client_updated_at || new Date().toISOString(), lastSnapshotId: latest.snapshot.id || current.lastSnapshotId, itemCount: Number(latest.snapshot.item_count ?? getVisibleVaultItems(restoredItems).length), snapshotCount }));
    saveSyncSafety({ state: 'up-to-date', pending: false, conflict: false, sessionRequired: false, message: 'Your vault is up to date.', itemCount: Number(latest.snapshot.item_count ?? getVisibleVaultItems(restoredItems).length), lastSuccessAt: latest.snapshot.created_at || latest.snapshot.client_updated_at || new Date().toISOString(), lastSnapshotId: latest.snapshot.id || '', acknowledgedAt: '' });
    setDeviceStatus({ state: 'cloud-restored', label: `This device is now using the latest secure vault copy. ${restoredItems.length} item(s) loaded.`, lastCloudCheckAt: new Date().toISOString(), lastRestoreAt: new Date().toISOString(), latestSnapshotId: latest.snapshot.id || '', latestCloudItemCount: Number(latest.snapshot.item_count ?? getVisibleVaultItems(restoredItems).length), source: reason === 'unlock' ? 'auto-pulled-on-unlock' : 'explicit-cloud-copy' });
    await recordSyncEvent('cloud_copy_loaded', 'success', { itemCount: restoredItems.length, source: reason, metadata: { snapshotId: latest.snapshot.id || '' } });
    scheduleEmergencyPackageMaintenance(restoredItems, 'cloud_restore');
    if (showSuccess) showMessage(`Your vault is up to date. ${restoredItems.length} item(s) are available on this device.`, 'success');
    return { restored: true, items: restoredItems, latest };
  }

  async function ensureAccountIdentity({ silent = false } = {}) {
    if (customerSession.authenticated && bootstrap.tenantId && bootstrap.userId) {
      const sessionOwner = { tenantId: String(customerSession.tenantId || ''), userId: String(customerSession.userId || '') };
      const bootstrapOwner = vaultOwnerBindingFromAccount(bootstrap);
      if (hasCompleteVaultOwnerBinding(sessionOwner) && !vaultOwnerBindingsMatch(sessionOwner, bootstrapOwner)) {
        const note = 'The verified browser session belongs to a different Password-Encrypt account. No vault or cloud action was performed.';
        if (!silent) showMessage(note, 'error');
        return { ok: false, code: 'ACCOUNT_SESSION_MISMATCH', message: note };
      }
      return { ok: true, account: bootstrap, result: { authenticated: true } };
    }
    const checked = validateAccountIdentity(bootstrap);
    if (!checked.ok) {
      setAccountStatus({ state: 'needs-details', message: checked.message });
      if (!silent) showMessage(checked.message, 'warning');
      return { ok: false, message: checked.message };
    }

    const payload = {
      ...bootstrap,
      email: checked.email,
      phoneCountryCode: checked.phoneCountryCode,
      phoneNumber: checked.phoneNumber,
      phoneE164: checked.phoneE164,
      displayName: String(bootstrap.displayName || '').trim() || 'Vault User',
      tenantName: String(bootstrap.tenantName || '').trim() || `${checked.phoneE164} Vault`,
      accountLoginFoundation: true,
      saasAccountFoundation: true,
      accountName: bootstrap.accountName || bootstrap.tenantName || 'Private Vault',
      planCode: bootstrap.planCode || 'personal_free',
      planStatus: bootstrap.planStatus || 'trial_pending',
      accountStatus: bootstrap.accountStatus || 'active',
      tenantRole: bootstrap.tenantRole || 'primary_owner',
      otpStatus: 'pending'
    };

    setAccountStatus({ state: 'checking', message: 'Checking your account details...' });
    try {
      const result = await postJson('/.netlify/functions/bootstrap-admin', payload);
      if (!result.ok) {
        const note = result.message || 'Account identity could not be saved.';
        setAccountStatus({ state: 'error', message: note });
        if (!silent) showMessage(note, 'error');
        return { ok: false, message: note };
      }
      const next = {
        ...bootstrap,
        ...payload,
        tenantId: result.tenantId || bootstrap.tenantId,
        userId: result.userId || bootstrap.userId,
        phoneE164: result.phoneE164 || payload.phoneE164,
        accountVerified: false,
        otpStatus: 'OTP verification required',
        accountName: result.accountName || payload.accountName || payload.tenantName,
        planCode: result.planCode || payload.planCode || 'personal_free',
        planStatus: result.planStatus || payload.planStatus || 'trial_pending',
        accountStatus: result.accountStatus || payload.accountStatus || 'active',
        tenantRole: result.tenantRole || payload.tenantRole || 'primary_owner'
      };
      setBootstrap(next);
      setAccountStatus({ state: 'verification-required', message: result.message || 'Verify the one-time code to enable secure backup and syncing.' });
      if (!silent) showMessage(result.message || 'Verify the one-time code to enable secure backup and syncing.');
      return { ok: true, account: next, result };
    } catch (error) {
      const note = `Could not save account details. ${error.message || 'Please try again.'}`;
      setAccountStatus({ state: 'error', message: note });
      if (!silent) showMessage(note, 'error');
      return { ok: false, message: note };
    }
  }

  async function requestSmsOtp(options = {}) {
    const popupFlow = Boolean(options.popupFlow || deviceVerificationModal.visible);
    const checked = validateAccountIdentity(bootstrap);
    if (!checked.ok) {
      setOtpTest((current) => ({ ...current, status: 'needs-details', message: checked.message, verified: false }));
      if (!popupFlow) showMessage(checked.message, 'warning');
      return;
    }
    if (!checked.phoneE164) {
      const note = 'Add your mobile number before requesting an SMS code.';
      setOtpTest((current) => ({ ...current, status: 'needs-details', message: note, verified: false }));
      if (!popupFlow) showMessage(note, 'warning');
      return;
    }
    setOtpTest((current) => ({ ...current, status: 'requesting', code: '', message: 'Sending your SMS code...', verified: false }));
    if (!popupFlow) showVerifyOverlay('working', 'Sending your code', 'We are sending a one-time code to your mobile number.');
    try {
      const accountCheck = await ensureAccountIdentity({ silent: true });
      if (!accountCheck.ok) throw new Error(accountCheck.message || 'Account identity is not ready yet.');
      const result = await postJson('/.netlify/functions/request-sms-otp', {
        phoneCountryCode: checked.phoneCountryCode,
        phoneNumber: checked.phoneNumber,
        phoneE164: checked.phoneE164,
        purpose: 'secure_customer_session'
      });
      if (!result.ok) throw new Error(result.message || 'Could not send the SMS code.');
      setOtpTest({
        status: result.smsSent ? 'sent-sms' : 'sent-sms-test',
        challengeId: result.challengeId || '',
        code: result.testOtpCode || '',
        input: '',
        message: result.message || 'Enter the code sent to your mobile number.',
        verified: false,
        expiresAt: result.expiresAt || ''
      });
      if (!popupFlow) {
        showVerifyOverlay('success', 'Code sent', result.smsSent ? 'Check your text messages and enter the six-digit code.' : 'Your local test code is ready.');
        showMessage(result.smsSent ? 'SMS code sent. Check your text messages.' : 'Local SMS test code created.', result.smsSent ? 'success' : 'warning');
      }
    } catch (error) {
      const note = `Could not send the SMS code. ${error.message || 'Please try again.'}`;
      setOtpTest((current) => ({ ...current, status: 'error', message: note, verified: false }));
      if (!popupFlow) {
        showVerifyOverlay('error', 'Something went wrong', 'We could not send the SMS code. Check the mobile number and try again.');
        showMessage(note, 'error');
      }
    }
  }


  async function requestSelectedOtp(options = {}) {
    if (SMS_AUTH_VERIFICATION_UI_ENABLED && otpChannel === 'sms') {
      await requestSmsOtp(options);
      return;
    }
    await requestEmailOtp(options);
  }

  async function requestEmailOtp(options = {}) {
    const popupFlow = Boolean(options.popupFlow || deviceVerificationModal.visible);
    const checked = validateAccountIdentity(bootstrap);
    if (!checked.ok) {
      setOtpTest((current) => ({ ...current, status: 'needs-details', message: checked.message, verified: false }));
      if (!popupFlow) showMessage(checked.message, 'warning');
      return;
    }
    if (!checked.email) {
      const note = 'Add your backup email before requesting a code.';
      setOtpTest((current) => ({ ...current, status: 'needs-details', message: note, verified: false }));
      if (!popupFlow) showMessage(note, 'warning');
      return;
    }
    setOtpTest((current) => ({ ...current, status: 'requesting', code: '', message: 'Sending your email code...', verified: false }));
    if (!popupFlow) showVerifyOverlay('working', 'Sending your code', 'We are sending a one-time code to your email address.');
    try {
      const accountCheck = await ensureAccountIdentity({ silent: true });
      if (!accountCheck.ok) throw new Error(accountCheck.message || 'Account identity is not ready yet.');
      const result = await postJson('/.netlify/functions/request-email-otp-test', {
        email: checked.email,
        purpose: 'new_device_restore_email_test'
      });
      if (!result.ok) throw new Error(result.message || 'Could not send email code.');
      setOtpTest({
        status: result.emailSent ? 'sent-email' : 'sent-email' ,
        challengeId: result.challengeId || '',
        code: result.testOtpCode || '',
        input: '',
        message: result.message || 'Enter the code sent to your email.',
        verified: false,
        expiresAt: result.expiresAt || ''
      });
      if (!popupFlow) {
        showVerifyOverlay('success', 'Code sent', result.emailSent ? 'Check your email and enter the six-digit code.' : 'Your code is ready. Enter the code shown on screen.');
        showMessage(result.emailSent ? 'Email code sent. Please check your inbox.' : 'Email code created. Enter the code shown to continue.', result.emailSent ? 'success' : 'warning');
      }
    } catch (error) {
      const note = `Could not send email code. ${error.message || 'Please try again.'}`;
      setOtpTest((current) => ({ ...current, status: 'error', message: note, verified: false }));
      if (!popupFlow) {
        showVerifyOverlay('error', 'Something went wrong', 'We could not send the code. Please check your details and try again.');
        showMessage(note, 'error');
      }
    }
  }

  async function verifyTestOtp() {
    const popupFlow = Boolean(deviceVerificationModal.visible);
    const verificationPurpose = deviceVerificationModal.purpose || '';
    if (!otpTest.challengeId) {
      const note = 'Request a one-time code first.';
      setOtpTest((current) => ({ ...current, status: 'needs-code', message: note, verified: false }));
      if (!popupFlow) showMessage(note, 'warning');
      return;
    }
    const code = String(otpTest.input || '').replace(/\D/g, '');
    if (code.length !== 6) {
      const note = 'Enter the six-digit code.';
      setOtpTest((current) => ({ ...current, status: 'needs-code', message: note, verified: false }));
      if (!popupFlow) showMessage(note, 'warning');
      return;
    }
    setOtpTest((current) => ({ ...current, status: 'verifying', message: 'Checking your code...' }));
    if (!popupFlow) showVerifyOverlay('working', 'Verifying your account', 'Please wait while we check your one-time code.');
    try {
      const result = await postJson('/.netlify/functions/verify-otp-test', {
        challengeId: otpTest.challengeId,
        code,
        ...accountDeviceMetadata()
      });
      if (!result.ok) throw new Error(result.message || 'Code verification failed.');
      const nextAccount = {
        ...bootstrap,
        tenantId: result.tenantId || bootstrap.tenantId,
        userId: result.userId || bootstrap.userId,
        accountName: result.account?.accountName || bootstrap.accountName,
        tenantName: result.account?.accountName || bootstrap.tenantName,
        planCode: result.account?.planCode || bootstrap.planCode,
        planStatus: result.account?.planStatus || bootstrap.planStatus,
        accountStatus: result.account?.accountStatus || bootstrap.accountStatus,
        tenantRole: result.account?.tenantRole || bootstrap.tenantRole,
        trialDays: Number(result.account?.trialDays || bootstrap.trialDays || 0),
        trialStartedAt: result.account?.trialStartedAt || bootstrap.trialStartedAt || '',
        trialEndsAt: result.account?.trialEndsAt || bootstrap.trialEndsAt || '',
        onboardingCompletedAt: result.onboardingCompleted ? new Date().toISOString() : bootstrap.onboardingCompletedAt || '',
        accountVerified: true,
        otpStatus: 'Device verified'
      };
      setBootstrap(nextAccount);
      if (result.entitlements) updateEntitlements(result.entitlements);
      const verifiedCloudAccess = result.cloudAccess !== false;
      const verifiedMessage = result.message || (verifiedCloudAccess ? 'This device is verified for secure backup and syncing.' : 'This device is verified. The vault remains local because cloud backup is not included in the current plan.');
      setCustomerSession({ checked: true, authenticated: true, cloudAccess: verifiedCloudAccess, accessCode: result.accessCode || '', tenantId: result.tenantId || bootstrap.tenantId || '', userId: result.userId || bootstrap.userId || '', message: verifiedMessage, entitlements: result.entitlements || entitlements });
      setOtpTest((current) => ({
        ...current,
        status: 'verified',
        verified: true,
        message: verifiedCloudAccess ? 'Device verified. Secure backup and syncing are active.' : 'Device verified. This plan keeps the vault on this device.'
      }));
      setAccountStatus({ state: verifiedCloudAccess ? 'ready' : 'plan-local-only', message: verifiedMessage });
      if (popupFlow) setDeviceVerificationModal({ visible: false, purpose: '' });
      if (verificationPurpose === 'billing') {
        openSubscriptionSettings();
        await refreshCustomerSubscription();
      }

      const shouldFinishPendingBackup = featureIncluded('cloudBackupSync') && result.cloudAccess !== false && syncSafety.pending && !syncSafety.conflict && Boolean(getLocalEnvelope());
      if (shouldFinishPendingBackup) {
        showVerifyOverlay('working', 'Finishing secure backup', 'Your device is verified. We are now backing up the latest vault changes.');
        const backupResult = await syncEncryptedVault({
          envelope: getLocalEnvelope(),
          nextItems: items,
          account: nextAccount,
          sessionVerified: true,
          silent: true,
          retry: true
        });
        if (backupResult?.ok) {
          closeSyncSafetyModal();
          showVerifyOverlay('success', 'Backup complete', 'Your latest vault changes are securely backed up and available on your verified devices.');
          if (!popupFlow) showMessage('Device verified and backup completed.', 'success');
        } else if (backupResult?.conflict) {
          hideVerifyOverlay();
        } else {
          showVerifyOverlay('error', 'Backup still needs attention', 'Your device was verified, but the latest backup did not complete. Follow the Vault Safety message to try again.');
        }
      } else {
        showVerifyOverlay('success', 'Device verified', verifiedCloudAccess ? 'Secure backup and syncing are now active on this device.' : 'This device is verified. Your encrypted vault remains available locally.');
        if (!popupFlow) showMessage(verifiedCloudAccess ? 'Device verified. Secure backup and syncing are active.' : 'Device verified. This plan keeps the vault local to this device.', 'success');
      }
    } catch (error) {
      const note = `Code did not verify. ${error.message || ''}`.trim();
      setOtpTest((current) => ({ ...current, status: 'error', verified: false, message: note }));
      if (!popupFlow) {
        showVerifyOverlay('error', 'Something went wrong', 'The code did not verify. Please check the code and try again.');
        showMessage(note, 'error');
      }
    }
  }

  async function performEndCustomerSession() {
    try {
      const result = await postJson('/.netlify/functions/session-status', { action: 'logout' });
      setCustomerSession({ checked: true, authenticated: false, cloudAccess: false, accessCode: 'SESSION_REQUIRED', tenantId: '', userId: '', message: result.message || 'This device is no longer verified.' });
      setAccountStatus({ state: 'session-needed', message: 'Verify this device again before secure backup or syncing can continue.' });
      showMessage('Device verification ended on this device.', 'success');
    } catch {
      showMessage('Device verification could not be ended. Please try again.', 'error');
    }
  }

  async function endCustomerSession() {
    if (featureIncluded('cloudBackupSync') && syncSafety.pending) {
      setSyncSafetyModal({ visible: true, mode: 'danger', title: 'Back up your changes before ending verification', message: 'This device has vault changes that are not safely backed up yet.', details: { action: 'end-session', warning: 'Ending verification now will prevent this device from finishing the backup until you verify it again.' } });
      return;
    }
    await performEndCustomerSession();
  }

  function confirmSecureDevicePasswordCheck() {
    setPasswordCheckNotice('');
    const confirmedRecord = markSecureDevicePasswordConfirmed();
    if (confirmedRecord) {
      setBiometricUnlock(confirmedRecord);
      setBiometricStatus((current) => ({ ...current, state: 'enabled' }));
    }
    return confirmedRecord;
  }

  async function openVaultWithPassword(password, options = {}) {
    const fromBiometric = options.fromBiometric === true;
    showVerifyOverlay('working', fromBiometric ? 'Checking secure device unlock' : 'Opening your vault', fromBiometric ? 'Use the device method your browser offers, such as PIN, fingerprint, face unlock, passkey or device lock. If you do not trust the method shown, cancel and use your password.' : 'Please wait while we verify your account and unlock this device.');
    try {
      const localVault = readStoredVault();
      let activeAccount = bootstrap;
      const localEnvelope = localVault ? JSON.parse(localVault.raw) : null;
      const localOwner = vaultOwnerBindingFromEnvelope(localEnvelope || {});
      const verifiedSessionOwner = customerSession.authenticated
        ? { tenantId: String(customerSession.tenantId || ''), userId: String(customerSession.userId || '') }
        : {};
      const browserAccountOwner = hasCompleteVaultOwnerBinding(verifiedSessionOwner) ? verifiedSessionOwner : vaultOwnerBindingFromAccount(bootstrap);

      if (localVault && hasCompleteVaultOwnerBinding(localOwner) && hasCompleteVaultOwnerBinding(browserAccountOwner) && !vaultOwnerBindingsMatch(localOwner, browserAccountOwner)) {
        const note = 'This browser is currently linked to a different Password-Encrypt account than the encrypted vault stored on this device. The vault has not been opened. End or verify the correct account session before trying again.';
        showVerifyOverlay('error', 'Different account detected', note);
        showMessage(note, 'error');
        return;
      }

      if (!localVault) {
        if (fromBiometric) {
          showVerifyOverlay('error', 'Master password needed', 'Secure device unlock can only be used after this device already has a local encrypted vault.', { focusMasterPassword: true });
          showMessage('Use your master password first on this device.');
          return;
        }
        const accountCheck = await ensureAccountIdentity({ silent: true });
        if (!accountCheck.ok) return;
        const verifiedOnboardingSession = newCustomerOnboardingEntry && customerSession.authenticated;
        if (!otpTest.verified && !verifiedOnboardingSession) {
          showVerifyOverlay('error', 'Verify your account first', 'Please verify your email before creating or restoring a vault on this device.');
          showMessage('Please verify your account before creating or restoring a vault on this device.', 'warning');
          return;
        }
        activeAccount = accountCheck.account;
      }

      const canCheckCloud = featureIncluded('cloudBackupSync') && Boolean(activeAccount.tenantId && activeAccount.userId);

      let cloudCheckResult = null;
      if (canCheckCloud) {
        try {
          cloudCheckResult = await restoreLatestCloudVault(password, { showSuccess: false, reason: 'unlock', account: activeAccount, forceCloud: false });
          if (cloudCheckResult.restored) {
            setMasterPassword(password);
            backNavigationStateRef.current.locked = false;
            backNavigationStateRef.current.activePage = 'home';
            setLocked(false);
            if (!fromBiometric) confirmSecureDevicePasswordCheck();
            showVerifyOverlay('success', 'Vault updated', 'The latest protected vault copy has been loaded on this device.');
            showMessage(`Latest cloud changes loaded. ${cloudCheckResult.items.length} item(s) are now available on this device.`, 'success');
            if (options.setupBiometricAfterPassword) await setupBiometricUnlockForPassword(password, { fromLoginIcon: true });
            return;
          }
        } catch (cloudError) {
          setDeviceStatus((current) => ({
            ...current,
            state: 'cloud-decrypt-failed',
            label: 'Your cloud backup could not be opened with that master password. Nothing was changed on this device.',
            lastCloudCheckAt: new Date().toISOString()
          }));
          if (!localVault) {
            showMessage('That master password could not open your cloud backup. Nothing was changed on this device.');
            return;
          }
          if (!hasCompleteVaultOwnerBinding(localOwner) && customerSession.authenticated) {
            const note = 'Password-Encrypt could not prove that this older local vault belongs to the account currently verified in this browser. The local fallback was blocked so one account cannot be opened under another account’s session. Verify the correct account or contact support before continuing.';
            showVerifyOverlay('error', 'Account and vault do not match safely', note);
            showMessage(note, 'error');
            return;
          }
        }
      }

      if (localVault) {
        const existing = await decryptVault(password);
        if (!existing) throw new Error('Vault could not be decrypted.');
        setMasterPassword(password);
        setItems(existing);
        if (!hasCompleteVaultOwnerBinding(localOwner) && cloudCheckResult?.latest?.snapshot) {
          const currentEnvelope = getLocalEnvelope();
          const exactCloudMatch = cloudSnapshotMatchesEnvelope(cloudCheckResult.latest.snapshot, currentEnvelope);
          const provenLocalDescendant = Boolean(cloudCheckResult.localNewer && currentEnvelope?.baseCloudSnapshotId && String(currentEnvelope.baseCloudSnapshotId) === String(cloudCheckResult.latest.snapshot.id || ''));
          if (exactCloudMatch || provenLocalDescendant) persistCurrentVaultOwnerBinding(activeAccount);
        }
        setDeviceStatus((current) => ({
          ...current,
          state: cloudCheckResult?.conflict ? 'conflict' : cloudCheckResult?.localNewer ? 'local-newer' : cloudCheckResult?.sessionRequired ? 'session-needed' : fromBiometric ? 'secure-device-unlock' : (canCheckCloud ? 'local-fallback' : 'local-only'),
          label: cloudCheckResult?.conflict
            ? 'Different changes were found on this device and in secure backup. Nothing was replaced.'
            : cloudCheckResult?.localNewer
              ? 'This device has changes waiting to be backed up. Nothing was replaced.'
              : cloudCheckResult?.sessionRequired
                ? 'This device opened its local vault. Verify this device to continue secure backup and syncing.'
                : fromBiometric
                  ? 'Secure device unlock opened the local vault after checking for newer secure changes.'
                  : (canCheckCloud ? 'This device unlocked from its local vault after a safe backup check.' : 'This device unlocked locally. Add and verify your account details to enable secure backup.'),
          source: cloudCheckResult?.conflict ? 'conflict-protected' : cloudCheckResult?.localNewer ? 'newer-local-vault-protected' : fromBiometric ? 'secure-device-local-vault' : 'local-vault'
        }));
        if (!fromBiometric) confirmSecureDevicePasswordCheck();
        backNavigationStateRef.current.locked = false;
        backNavigationStateRef.current.activePage = 'home';
        setLocked(false);
        if (cloudCheckResult?.conflict) {
          hideVerifyOverlay();
          showMessage('Vault opened from this device. Different changes were found elsewhere, so nothing was replaced.', 'warning');
        } else if (cloudCheckResult?.localNewer && featureIncluded('cloudBackupSync')) {
          const pendingSync = await syncEncryptedVault({ envelope: cloudCheckResult.localEnvelope || getLocalEnvelope(), nextItems: existing, silent: true });
          if (pendingSync?.ok) {
            showMessage('Vault opened. Your latest changes are backed up and available on your devices.', 'success');
          } else {
            showMessage('Vault opened. Your latest changes are safe on this device, but backup still needs attention.', 'warning');
          }
        } else if (cloudCheckResult?.sessionRequired) {
          showMessage('Vault opened from this device. Verify this device to continue secure backup and syncing.', 'warning');
        } else if (cloudCheckResult?.upToDate) {
          showMessage(fromBiometric ? 'Vault opened with secure device unlock. This device is up to date.' : 'Vault unlocked. This device is up to date.', 'success');
        } else {
          showMessage(fromBiometric ? 'Vault opened with secure device unlock.' : (canCheckCloud ? 'Vault unlocked locally. Your cloud backup was checked safely.' : 'Vault unlocked locally. Save your account details to enable cloud restore.'));
        }
        if (!cloudCheckResult?.conflict) showVerifyOverlay('success', 'Vault unlocked', fromBiometric ? 'Your device verified you and checked for newer secure changes.' : 'Your vault is open on this device.');
        if (options.setupBiometricAfterPassword && !fromBiometric) await setupBiometricUnlockForPassword(password, { fromLoginIcon: true });
        return;
      }

      if (!createMode) {
        if (existingCustomerEntry) {
          showVerifyOverlay('error', 'Existing vault not found', 'We could not restore an existing secure backup for this verified account. No new vault was created.');
          showMessage('We could not restore an existing vault for this account. No new vault was created. Contact support if you believe a secure backup should be available.', 'warning');
          return;
        }
        setCreateMode(true);
        showMessage('We could not restore a vault for this account. Only continue if you want to create a new vault on this device.');
        return;
      }

      if (password !== confirmMasterPassword) {
        showMessage('The two master password entries do not match. Nothing has been saved.');
        return;
      }

      const newVaultEnvelope = await encryptVault(starterItems, password, activeAccount);
      setMasterPassword(password);
      setHasLocalVault(true);
      setCreateMode(false);
      setConfirmMasterPassword('');
      setItems(starterItems);
      clearPendingOnboardingAccount();
      onboardingSessionIsolationRef.current = false;
      setOnboardingSecurityWarning('');
      const cloudBackupAvailable = featureIncluded('cloudBackupSync');
      saveSyncSafety(cloudBackupAvailable
        ? { state: 'backup-pending', pending: true, conflict: false, sessionRequired: !customerSession.authenticated, message: 'Your new vault is saved on this device and is waiting to be backed up.', itemCount: getVisibleVaultItems(starterItems).length, lastFailureAt: '', acknowledgedAt: '' }
        : { state: 'plan-local-only', pending: false, conflict: false, sessionRequired: false, message: 'Your new encrypted vault is saved locally. Cloud backup and sync are not included in the current plan.', itemCount: getVisibleVaultItems(starterItems).length, lastFailureAt: '', acknowledgedAt: '' });
      if (!fromBiometric) confirmSecureDevicePasswordCheck();
      backNavigationStateRef.current.locked = false;
      backNavigationStateRef.current.activePage = 'home';
      setLocked(false);
      if (options.afterCreateOnboardingInstall) hideVerifyOverlay();
      else showVerifyOverlay('success', 'Vault created', 'Your encrypted vault has been created on this device.');
      if (cloudBackupAvailable) {
        const initialBackup = await syncEncryptedVault({ envelope: newVaultEnvelope, nextItems: starterItems, silent: true });
        if (initialBackup?.ok) showMessage('New secure vault created and backed up.', 'success');
        else showMessage('New secure vault created on this device. Backup needs attention.', 'warning');
      } else {
        showMessage('New encrypted vault created locally. Cloud backup is not included in this plan.', 'success');
      }
      if (options.setupBiometricAfterPassword) await setupBiometricUnlockForPassword(password, { fromLoginIcon: true });
      if (options.afterCreateOnboardingInstall) {
        window.history.replaceState({ onboardingInstall: true }, '', '/vault?entry=install');
        setShowInstallOnboarding(true);
        setActivePage('home');
        window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
      }
    } catch (error) {
      showVerifyOverlay('error', 'Something went wrong', 'We could not unlock your vault. Please check your master password and try again.');
      showMessage('Could not unlock. Check your master password. Nothing new was saved.');
    }
  }

  async function verifyOnboardingSessionMatchesAccount() {
    const expected = readPendingOnboardingAccount() || vaultOwnerBindingFromAccount(bootstrap);
    if (!hasCompleteVaultOwnerBinding(expected)) {
      const note = 'The new account identity could not be confirmed. Return to Account Setup and verify the account again before creating a vault.';
      setOnboardingSecurityWarning(note);
      return { ok: false, message: note };
    }
    try {
      const result = await postJson('/.netlify/functions/session-status', { action: 'status', ...accountDeviceMetadata() });
      if (!result.ok || !result.authenticated) {
        const note = result.message || 'The verified account session is no longer active.';
        setOnboardingSecurityWarning(note);
        setCustomerSession({ checked: true, authenticated: false, cloudAccess: false, accessCode: result.code || 'SESSION_REQUIRED', tenantId: '', userId: '', message: note });
        return { ok: false, message: note };
      }
      const liveBinding = { tenantId: String(result.tenantId || ''), userId: String(result.userId || '') };
      if (!vaultOwnerBindingsMatch(expected, liveBinding)) {
        const note = 'A different Password-Encrypt account is still verified in this browser. To protect both vaults, no vault was created. Return to Account Setup and verify this account again.';
        setOnboardingSecurityWarning(note);
        setCustomerSession({ checked: true, authenticated: true, cloudAccess: result.cloudAccess !== false, accessCode: 'ACCOUNT_SESSION_MISMATCH', tenantId: liveBinding.tenantId, userId: liveBinding.userId, message: note });
        return { ok: false, mismatch: true, message: note };
      }
      setCustomerSession((current) => ({ ...current, checked: true, authenticated: true, cloudAccess: result.cloudAccess !== false, accessCode: result.accessCode || '', tenantId: liveBinding.tenantId, userId: liveBinding.userId, message: result.message || current.message }));
      setOnboardingSecurityWarning('');
      return { ok: true, account: { ...bootstrap, tenantId: liveBinding.tenantId, userId: liveBinding.userId } };
    } catch (error) {
      const note = 'Password-Encrypt could not confirm which account is verified in this browser. No vault was created. Please try verification again.';
      setOnboardingSecurityWarning(note);
      return { ok: false, message: note, error };
    }
  }

  async function createVaultFromOnboarding(event) {
    event.preventDefault();
    if (hasLocalVault) {
      showMessage('This device already contains a local vault. New-account onboarding will not overwrite it.', 'warning');
      return;
    }
    const enteredEmail = String(onboardingVaultDraft.email || '').trim().toLowerCase();
    const enteredPhone = buildPhoneE164(onboardingVaultDraft.phoneCountryCode || '+254', onboardingVaultDraft.phoneNumber || '');
    const verifiedEmail = String(bootstrap.email || '').trim().toLowerCase();
    const verifiedPhone = bootstrap.phoneE164 || buildPhoneE164(bootstrap.phoneCountryCode || '+254', bootstrap.phoneNumber || '');
    if (!enteredEmail || !enteredEmail.includes('@')) {
      showMessage('Enter the email address linked to the account.', 'warning');
      return;
    }
    if (!enteredPhone) {
      showMessage('Enter the mobile number linked to the account.', 'warning');
      return;
    }
    if (verifiedEmail && enteredEmail !== verifiedEmail) {
      showMessage('Use the same email address you verified during account setup.', 'warning');
      return;
    }
    if (verifiedPhone && enteredPhone !== verifiedPhone) {
      showMessage('Use the same mobile number you entered during account setup.', 'warning');
      return;
    }
    if (!customerSession.checked) {
      showMessage('Please wait while Password-Encrypt checks your verified account session.', 'warning');
      return;
    }
    if (!customerSession.authenticated) {
      showMessage('Your account verification session is no longer active. Return to the landing page and verify the account again.', 'warning');
      return;
    }
    const liveSession = await verifyOnboardingSessionMatchesAccount();
    if (!liveSession.ok) {
      showVerifyOverlay('error', 'Different account session detected', liveSession.message || 'No vault was created.');
      showMessage(liveSession.message || 'No vault was created.', 'error');
      return;
    }
    if (masterPassword.length < 8) {
      showMessage('Use at least 8 characters for your master password.');
      return;
    }
    if (masterPassword !== confirmMasterPassword) {
      showMessage('The two master password entries do not match. Nothing has been saved.');
      return;
    }
    await openVaultWithPassword(masterPassword, { afterCreateOnboardingInstall: true });
  }

  async function unlockVault(event) {
    event.preventDefault();
    setSuppressUnlockAutofocus(false);
    if (masterPassword.length < 8) {
      showMessage('Use at least 8 characters for your master password.');
      return;
    }
    await openVaultWithPassword(masterPassword);
  }

  async function setupBiometricUnlockForPassword(password, options = {}) {
    if (!featureIncluded('secureDeviceUnlock')) {
      showEntitlementUpgrade('secureDeviceUnlock', 'Secure device unlock is not included in the current plan. Your master password will continue to open the local encrypted vault.');
      return false;
    }
    if (!isBiometricUnlockSupported()) {
      showMessage('Secure device unlock is not supported on this browser or device.');
      return false;
    }
    if (!password || password.length < 8) {
      showMessage('Enter your password first, then tap the secure key icon to set up quick unlock on this device.');
      focusMasterPassword();
      return false;
    }
    try {
      setBiometricStatus((current) => ({ ...current, state: 'setting-up' }));
      showVerifyOverlay('working', 'Setting up secure device unlock', 'Your browser will ask for a local device check, such as PIN, fingerprint, face unlock, passkey or device lock. If you do not trust the method shown, cancel and keep using your password.');
      const userLabel = bootstrap.email || bootstrap.displayName || 'Password-Encrypt user';
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: { name: 'Password-Encrypt' },
          user: {
            id: crypto.getRandomValues(new Uint8Array(32)),
            name: userLabel,
            displayName: bootstrap.displayName || userLabel
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 }
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred'
          },
          attestation: 'none',
          timeout: 60000
        }
      });
      if (!credential?.rawId) throw new Error('Your device did not return a local credential.');
      const wrapped = await wrapMasterPasswordForBiometric(password);
      const record = {
        credentialId: arrayBufferToBase64Url(credential.rawId),
        label: friendlyBiometricName(),
        userLabel,
        createdAt: new Date().toISOString(),
        lastPasswordCheckAt: new Date().toISOString(),
        quickUnlockCount: 0,
        ...wrapped
      };
      saveBiometricUnlockRecord(record);
      setBiometricUnlock(record);
      setBiometricStatus({ supported: true, label: record.label, state: 'enabled' });
      showVerifyOverlay('success', 'Secure device unlock enabled', 'This device can now open your local vault from the secure key icon.');
      showMessage('Secure device unlock enabled on this device.', 'success');
      return true;
    } catch (error) {
      setBiometricStatus((current) => ({ ...current, state: biometricUnlock ? 'enabled' : 'available' }));
      showVerifyOverlay('error', 'Secure device setup not saved', 'The device verification was cancelled or could not be completed. Your password still opens the vault.');
      showMessage('Secure device unlock was not enabled on this device.', 'warning');
      return false;
    }
  }

  async function enableBiometricUnlock() {
    if (!featureIncluded('secureDeviceUnlock')) {
      showEntitlementUpgrade('secureDeviceUnlock', 'Secure device unlock is not included in the current plan. Your master password will continue to open the local encrypted vault.');
      return;
    }
    await setupBiometricUnlockForPassword(masterPassword);
  }

  async function handleBiometricIconAction(event) {
    event?.stopPropagation?.();
    masterPasswordInputRef.current?.blur?.();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setSuppressUnlockAutofocus(true);
    if (!featureIncluded('secureDeviceUnlock')) {
      showEntitlementUpgrade('secureDeviceUnlock', 'Secure device unlock is not included in the current plan. Your master password will continue to open the local encrypted vault.');
      return;
    }
    if (!biometricUnlock) {
      showVerifyOverlay('error', 'Secure device unlock is not set up', 'Unlock with your master password, then open Settings → Secure device unlock to set this device up. The key icon is only used to open your device security prompt.');
      return;
    }
    await unlockWithBiometric();
  }

  async function disableBiometricUnlock() {
    localStorage.removeItem(BIOMETRIC_UNLOCK_KEY);
    await deleteBiometricDeviceKey();
    setBiometricUnlock(null);
    setBiometricStatus((current) => ({ ...current, state: current.supported ? 'available' : 'unsupported' }));
    showMessage('Secure device unlock removed from this device.', 'success');
  }

  async function unlockWithBiometric() {
    if (!featureIncluded('secureDeviceUnlock')) {
      showEntitlementUpgrade('secureDeviceUnlock', 'Secure device unlock is not included in the current plan. Your master password will continue to open the local encrypted vault.');
      return;
    }
    const record = readBiometricUnlockRecord();
    if (!record) {
      showMessage('Secure device unlock has not been enabled on this device yet.');
      return;
    }
    if (!isBiometricUnlockSupported()) {
      showMessage('Secure device unlock is not available on this browser or device.');
      return;
    }
    const reminderReason = getSecureDevicePasswordReminderReason(record);
    if (reminderReason) {
      const passwordCheckMessage = `${reminderReason} Type your master password and tap Unlock Local Vault. After a successful password unlock, the secure device counter will restart.`;
      setPasswordCheckNotice(passwordCheckMessage);
      showVerifyOverlay('error', 'Password check required', passwordCheckMessage, { focusMasterPassword: false });
      showMessage('Password check required.', 'warning');
      return;
    }
    try {
      setSuppressUnlockAutofocus(true);
      showVerifyOverlay('working', 'Checking secure device unlock', 'Use the device method your browser offers to continue. If you do not trust the method shown, cancel and use your password instead.');
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ type: 'public-key', id: base64UrlToArrayBuffer(record.credentialId) }],
          userVerification: 'required',
          timeout: 60000
        }
      });
      if (!assertion?.rawId) throw new Error('Secure device verification was not completed.');
      const unlockedMasterPassword = await unwrapMasterPasswordForBiometric(record);
      setMasterPassword(unlockedMasterPassword);
      await openVaultWithPassword(unlockedMasterPassword, { fromBiometric: true });
      const usedRecord = markSecureDeviceQuickUnlockUsed(record);
      if (usedRecord) setBiometricUnlock(usedRecord);
    } catch (error) {
      showVerifyOverlay('error', 'Secure device unlock failed', 'Use your master password or try secure device unlock again.', { focusMasterPassword: false });
      showMessage('Secure device unlock failed. Use your master password or try again.', 'warning');
    }
  }

  async function saveItems(nextItems, options = {}) {
    setItems(nextItems);
    const envelope = await encryptVault(nextItems, masterPassword, bootstrap);
    const itemCount = getVisibleVaultItems(nextItems).length;
    if (options.refreshEmergencyPackage !== false) {
      scheduleEmergencyPackageMaintenance(nextItems, options.emergencyRefreshReason || 'vault_change');
    }

    if (options.autoSync && !featureIncluded('cloudBackupSync')) {
      const note = 'Your latest changes are encrypted and saved locally. Cloud backup and sync are not included in the current plan.';
      setSyncPromptShown(true);
      setSyncStatus((current) => ({ ...current, state: 'local-only', message: note, itemCount }));
      saveSyncSafety({ state: 'plan-local-only', pending: false, conflict: false, sessionRequired: false, message: note, itemCount, lastFailureAt: '', acknowledgedAt: '' });
      return { ok: true, localOnly: true, planLimited: true, code: 'PLAN_FEATURE_REQUIRED', feature: 'cloudBackupSync', envelope };
    }

    if (options.autoSync && typeof navigator !== 'undefined' && navigator.onLine === false) {
      const note = 'Your latest changes are encrypted and saved on this device. They will be backed up automatically when your internet connection returns.';
      const showOfflinePopup = !offlineSaveNoticeShownRef.current;
      offlineSaveNoticeShownRef.current = true;
      setSyncPromptShown(true);
      setSyncStatus({
        state: 'warning',
        message: 'Saved offline. Backup pending.',
        lastSyncAt: syncStatus.lastSyncAt,
        lastSnapshotId: syncStatus.lastSnapshotId,
        itemCount,
        snapshotCount: snapshotHistory.total
      });
      saveSyncSafety({
        state: 'backup-pending',
        pending: true,
        conflict: false,
        sessionRequired: false,
        message: note,
        itemCount,
        lastFailureAt: '',
        acknowledgedAt: ''
      });
      if (showOfflinePopup) {
        setSyncSafetyModal({
          visible: true,
          mode: 'offline-saved',
          title: 'Saved offline',
          message: note,
          details: { itemCount }
        });
      } else {
        showMessage('Saved offline. Backup pending.', 'success');
      }
      return { ok: true, localOnly: true, offline: true, offlineNoticeShown: showOfflinePopup, envelope };
    }

    if (options.autoSync) {
      setSyncPromptShown(false);
      saveSyncSafety({
        state: 'backing-up',
        pending: false,
        conflict: false,
        sessionRequired: false,
        message: 'Protecting your latest changes...',
        itemCount,
        lastFailureAt: '',
        acknowledgedAt: ''
      });
      return syncEncryptedVault({ envelope, nextItems, silent: options.silentAutoSync === true });
    }
    saveSyncSafety({
      state: 'backup-pending',
      pending: true,
      conflict: false,
      sessionRequired: false,
      message: 'Your latest changes are saved on this device and are waiting to be backed up.',
      itemCount,
      lastFailureAt: '',
      acknowledgedAt: ''
    });
    return { ok: true, localOnly: true, envelope };
  }

  function lockVault(note = 'Vault locked.', options = {}) {
    if (featureIncluded('cloudBackupSync') && syncSafety.pending && note === 'Vault locked.' && options.force !== true) {
      setSyncSafetyModal({ visible: true, mode: 'danger', title: 'Your latest changes are not backed up yet', message: 'The vault can be locked safely, but backup cannot retry until you unlock it again.', details: { action: 'lock-vault', warning: 'Your changes will remain encrypted on this device only until backup succeeds.' } });
      return;
    }
    setSuppressUnlockAutofocus(true);
    setLocked(true);
    setItems([]);
    setShowSecrets({});
    setMasterPassword('');
    setConfirmMasterPassword('');
    setMasterPasswordFieldArmed(false);
    showMessage(note, 'success');
    window.setTimeout(() => {
      showVerifyOverlay('success', 'Vault locked', 'Your passwords are securely encrypted and locked.');
    }, 80);
  }



  function performClearLocalVault() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(SALT_KEY);
    localStorage.removeItem(LEGACY_SALT_KEY);
    localStorage.removeItem(BIOMETRIC_UNLOCK_KEY);
    localStorage.removeItem(SYNC_SAFETY_KEY);
    deleteBiometricDeviceKey();
    setBiometricUnlock(null);
    setSyncSafety(readSyncSafetyState());
    setHasLocalVault(false);
    setCreateMode(true);
    setMasterPassword('');
    setConfirmMasterPassword('');
    setMasterPasswordFieldArmed(false);
    showMessage(featureIncluded('cloudBackupSync')
      ? 'The vault copy on this device was cleared. Your secure backup was not deleted.'
      : 'The encrypted vault copy on this device was cleared.', 'success');
  }

  function resetLocalVaultOnDevice() {
    const localOnlyAtRisk = !featureIncluded('cloudBackupSync');
    setSyncSafetyModal({
      visible: true,
      mode: 'danger',
      title: localOnlyAtRisk ? 'Clear the only current vault copy on this device?' : syncSafety.pending ? 'Unprotected changes may be lost' : 'Clear this device’s vault copy?',
      message: localOnlyAtRisk ? 'Cloud backup is not included in the current plan. Clearing this device can permanently remove the latest vault copy.' : syncSafety.pending ? 'This device has changes that have not been backed up.' : 'This removes the encrypted vault copy from this device only.',
      details: { action: 'clear-local', warning: syncSafety.pending ? 'Continuing will permanently remove the changes that exist only on this device.' : 'You will need to verify this device and enter the master password to use the vault here again.' }
    });
  }

  function emptyForm(categoryToKeep = form.category) {
    return { title: '', category: categoryToKeep || 'Passwords', url: '', username: '', password: '', notes: '', favourite: false, file: null, cardName: '', cardNickname: '', cardNumber: '', cardExpiry: '', cardCcv: '' };
  }

  function storedDocumentDeletionEntry(item) {
    const file = item?.payload?.file;
    const documentId = file?.externalDocumentId || (file?.storedExternally ? item?.id : '');
    if (!documentId || !bootstrap.tenantId || !bootstrap.userId) return null;
    return { documentId, tenantId: bootstrap.tenantId, userId: bootstrap.userId };
  }

  async function removeStoredDocumentBlob(entry, { silent = false } = {}) {
    if (!entry?.documentId || !entry?.tenantId || !entry?.userId) return { ok: false, message: 'Document cleanup details are incomplete.' };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, offline: true, message: 'Document cleanup is waiting for an internet connection.' };
    try {
      const csrfToken = sessionStorage.getItem('mp_customer_csrf') || '';
      const response = await fetch(`/.netlify/functions/document-blob?documentId=${encodeURIComponent(entry.documentId)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'x-mp-request': '1', ...(csrfToken ? { 'x-mp-csrf': csrfToken } : {}) }
      });
      const result = await response.json().catch(() => ({ ok: false, message: 'Document cleanup returned an invalid response.' }));
      if (!response.ok || !result.ok) return { ...result, ok: false, httpStatus: response.status };
      removePendingDocumentDeletion(entry);
      if (result.entitlements) updateEntitlements(result.entitlements);
      if (!silent) showMessage('Encrypted file storage removed.', 'success');
      return result;
    } catch (error) {
      return { ok: false, offline: typeof navigator !== 'undefined' && navigator.onLine === false, message: error.message || 'Document cleanup could not complete.' };
    }
  }

  async function cleanupStoredDocumentAfterVaultSave(item, syncResult, { silent = false } = {}) {
    const entry = storedDocumentDeletionEntry(item);
    if (!entry) return { ok: true, skipped: true };
    const cloudFeatureIncluded = featureIncluded('cloudBackupSync');
    const cloudCopySafe = !cloudFeatureIncluded || Boolean(syncResult?.ok && !syncResult?.offline && !syncResult?.localOnly);
    if (!customerSession.authenticated || typeof navigator === 'undefined' || navigator.onLine === false || !cloudCopySafe) {
      queuePendingDocumentDeletion(entry);
      if (!silent) showMessage('Document deleted on this device. Encrypted storage cleanup will finish when the latest vault copy is safely backed up.', 'warning');
      return { ok: true, queued: true };
    }
    const removed = await removeStoredDocumentBlob(entry, { silent: true });
    if (!removed.ok) {
      queuePendingDocumentDeletion(entry);
      if (!silent) showMessage('Document deleted on this device. Encrypted storage cleanup will retry automatically.', 'warning');
      return { ok: true, queued: true, cleanupError: removed.message || '' };
    }
    return removed;
  }

  async function processPendingDocumentDeletions() {
    if (locked || !customerSession.authenticated || typeof navigator === 'undefined' || navigator.onLine === false) return;
    if (featureIncluded('cloudBackupSync') && syncSafety.pending) return;
    const accountEntries = readPendingDocumentDeletions().filter((entry) => entry.tenantId === bootstrap.tenantId && entry.userId === bootstrap.userId);
    for (const entry of accountEntries) {
      const result = await removeStoredDocumentBlob(entry, { silent: true });
      if (!result.ok) break;
    }
  }

  async function uploadEncryptedDocumentBlob(fileInfo, documentId, blobKind = 'document') {
    if (!fileInfo?.dataUrl) return fileInfo;
    const isPicture = blobKind === 'picture';
    const featureKey = isPicture ? 'pictures' : 'documents';
    const label = isPicture ? 'picture' : 'document';
    if (!bootstrap.tenantId || !bootstrap.userId) {
      throw new Error(`Save your account details before storing ${isPicture ? 'pictures' : 'documents'}.`);
    }
    const encryptedFile = await encryptDocumentData(fileInfo.dataUrl, masterPassword);
    const chunks = [];
    for (let index = 0; index < encryptedFile.encryptedBlob.length; index += ENCRYPTED_FILE_CHUNK_CHARACTERS) {
      chunks.push(encryptedFile.encryptedBlob.slice(index, index + ENCRYPTED_FILE_CHUNK_CHARACTERS));
    }
    const init = await postJson('/.netlify/functions/document-blob', {
      action: 'init_chunked',
      documentId,
      blobKind,
      fileName: fileInfo.name,
      fileType: fileInfo.type || 'application/octet-stream',
      fileExtension: fileInfo.extension || getFileExtension(fileInfo.name),
      fileSize: fileInfo.size || 0,
      encryptedStorageBytes: Math.max(Number(fileInfo.size || 0), Math.ceil((encryptedFile.encryptedBlob.length * 3) / 4)),
      chunkCount: chunks.length,
      localSalt: encryptedFile.localSalt,
      localIv: encryptedFile.localIv,
      clientUpdatedAt: new Date().toISOString()
    });
    if (!init.ok) {
      if (handleEntitlementError(init, featureKey)) { const error = new Error(init.message || `Your ${label} plan limit has been reached.`); error.entitlementHandled = true; throw error; }
      throw new Error(init.message || `${isPicture ? 'Picture' : 'Document'} file could not be stored separately.`);
    }
    let result;
    try {
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        const chunkResult = await postJson('/.netlify/functions/document-blob', {
          action: 'upload_chunk',
          documentId,
          chunkIndex,
          chunkCount: chunks.length,
          chunkData: chunks[chunkIndex]
        });
        if (!chunkResult.ok) throw new Error(chunkResult.message || `Encrypted ${label} upload stopped before it was complete.`);
      }
      result = await postJson('/.netlify/functions/document-blob', { action: 'finalize_chunked', documentId });
      if (!result.ok) {
        if (handleEntitlementError(result, featureKey)) { const error = new Error(result.message || `Your ${label} plan limit has been reached.`); error.entitlementHandled = true; throw error; }
        throw new Error(result.message || `${isPicture ? 'Picture' : 'Document'} file could not be finalised.`);
      }
    } catch (error) {
      // A newly selected file is uploaded under its own blob id. If chunking fails,
      // remove that incomplete blob so it cannot consume the customer's plan allowance.
      await removeStoredDocumentBlob({ documentId, tenantId: bootstrap.tenantId, userId: bootstrap.userId }, { silent: true }).catch(() => null);
      throw error;
    }
    if (result.entitlements) updateEntitlements(result.entitlements);
    return {
      name: fileInfo.name,
      type: fileInfo.type || 'application/octet-stream',
      size: fileInfo.size || 0,
      extension: fileInfo.extension || getFileExtension(fileInfo.name),
      storageMode: 'chunked_external_encrypted_blob',
      externalDocumentId: documentId,
      storedExternally: true,
      blobKind,
      storedAt: new Date().toISOString()
    };
  }

  async function loadStoredDocumentDataUrl(item) {
    const file = item?.payload?.file;
    const itemType = effectiveVaultItemType(item);
    const isPicture = itemType === PICTURES_CATEGORY || file?.blobKind === 'picture';
    const label = isPicture ? 'picture' : 'document';
    if (!file) throw new Error(`No ${label} file is attached to this item.`);
    if (file.dataUrl) return file.dataUrl;
    const documentId = file.externalDocumentId || item.id;
    if (!file.storedExternally || !documentId) throw new Error(`This ${label} file is not available.`);
    if (!bootstrap.tenantId || !bootstrap.userId) throw new Error(`Save your account details before opening stored ${isPicture ? 'pictures' : 'documents'}.`);
    const response = await fetch(`/.netlify/functions/document-blob?documentId=${encodeURIComponent(documentId)}`, { credentials: 'same-origin' });
    const result = await response.json();
    if (!response.ok || !result.ok || !result.document) throw new Error(result.message || `${isPicture ? 'Picture' : 'Document'} could not be loaded.`);
    const record = { ...result.document };
    if (String(record?.metadata?.storageMode || '') === 'chunked_encrypted_file_v1') {
      const chunkCount = Number(record?.metadata?.chunkCount || 0);
      if (!chunkCount) throw new Error(`This encrypted ${label} upload is incomplete.`);
      const chunks = [];
      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        const chunkResponse = await fetch(`/.netlify/functions/document-blob?action=chunk&documentId=${encodeURIComponent(documentId)}&chunkIndex=${chunkIndex}`, { credentials: 'same-origin' });
        const chunkResult = await chunkResponse.json();
        if (!chunkResponse.ok || !chunkResult.ok) throw new Error(chunkResult.message || `Encrypted ${label} data could not be loaded.`);
        chunks.push(String(chunkResult.chunkData || ''));
      }
      record.encrypted_blob = chunks.join('');
    }
    return decryptDocumentData(record, masterPassword);
  }

  async function downloadStoredDocument(item) {
    const isPicture = effectiveVaultItemType(item) === PICTURES_CATEGORY || item?.payload?.file?.blobKind === 'picture';
    setDownloadingDocId(item?.id || 'file');
    try {
      const dataUrl = await loadStoredDocumentDataUrl(item);
      triggerDocumentDownload(item, dataUrl);
      showMessage(`${isPicture ? 'Picture' : 'Document'} downloaded securely.`, 'success');
    } catch (error) {
      showMessage(error.message || `${isPicture ? 'Picture' : 'Document'} could not be downloaded. Please try again.`, 'error');
    } finally {
      setDownloadingDocId('');
    }
  }

  async function shareStoredDocument(item) {
    const isPicture = effectiveVaultItemType(item) === PICTURES_CATEGORY || item?.payload?.file?.blobKind === 'picture';
    const label = isPicture ? 'picture' : 'document';
    if (!navigator?.share) {
      showMessage(`${isPicture ? 'Picture' : 'Document'} sharing is not available in this browser. Use Download instead.`, 'warning');
      return;
    }
    setSharingDocId(item?.id || 'file');
    try {
      const dataUrl = await loadStoredDocumentDataUrl(item);
      const { bytes, mimeType } = dataUrlToBytes(dataUrl);
      const storedFile = item?.payload?.file || {};
      const fileName = safeDownloadFileName(storedFile.name || `${item?.title || label}.${storedFile.extension || (isPicture ? 'jpg' : 'txt')}`);
      const shareFile = new File([bytes], fileName, { type: storedFile.type || mimeType || 'application/octet-stream' });
      if (navigator.canShare && !navigator.canShare({ files: [shareFile] })) {
        throw new Error(`This device cannot share this ${label} type directly. Use Download instead.`);
      }
      await navigator.share({ files: [shareFile], title: fileName });
    } catch (error) {
      if (error?.name !== 'AbortError') showMessage(error.message || `The ${label} could not be shared.`, 'error');
    } finally {
      setSharingDocId('');
    }
  }

  async function previewStoredPicture(item) {
    setPicturePreview({ itemId: item?.id || '', dataUrl: '', busy: true });
    try {
      const dataUrl = await loadStoredDocumentDataUrl(item);
      setPicturePreview({ itemId: item?.id || '', dataUrl, busy: false });
    } catch (error) {
      setPicturePreview({ itemId: '', dataUrl: '', busy: false });
      showMessage(error.message || 'The picture could not be opened.', 'error');
    }
  }

  async function saveItem(event) {
    event.preventDefault();
    if (isSavingItem) return;
    if (form.category !== CARDS_CATEGORY && !form.title.trim()) return showMessage(editingItemId ? 'Add a title before updating this item.' : 'Add a title first.');

    setIsSavingItem(true);
    try {
      const isDocument = form.category === DOCUMENTS_CATEGORY;
      const isPicture = form.category === PICTURES_CATEGORY;
      const isFileUpload = isDocument || isPicture;
      const fileFeatureKey = isPicture ? 'pictures' : 'documents';
      const fileLabel = isPicture ? 'picture' : 'document';
      const isCard = form.category === CARDS_CATEGORY;
      const itemLimit = Number(entitlements?.limits?.itemLimit || 0);
      const currentItemCount = getVisibleVaultItems(items).length;
      if (!editingItemId && itemLimit > 0 && currentItemCount >= itemLimit) {
        showEntitlementUpgrade('items', `This plan includes up to ${itemLimit} vault item${itemLimit === 1 ? '' : 's'}. Delete an item or review your plan before adding another.`);
        return;
      }
      if (isFileUpload && !featureIncluded(fileFeatureKey)) {
        showEntitlementUpgrade(fileFeatureKey, `Encrypted ${fileLabel} storage is not included in the current plan. Passwords and other local vault items remain available.`);
        return;
      }
      const fileLimit = Number(isPicture ? entitlements?.limits?.photoLimit || 0 : entitlements?.limits?.documentLimit || 0);
      const currentFileUsage = Number(isPicture ? entitlements?.usage?.pictures || 0 : entitlements?.usage?.documents || 0);
      if (isFileUpload && !editingItemId && fileLimit > 0 && currentFileUsage >= fileLimit) {
        showEntitlementUpgrade(fileFeatureKey, `This plan includes ${fileLimit} encrypted ${fileLabel}${fileLimit === 1 ? '' : 's'}. Upgrade or ask Admin for an override to store another ${fileLabel}.`);
        return;
      }
      if (isFileUpload && !editingItemId && form.file?.dataUrl && Number(entitlements?.limits?.storageLimitMb || 0) > 0) {
        const estimatedEncryptedBytes = new TextEncoder().encode(String(form.file.dataUrl || '')).length + 16;
        const projectedStorage = Number(entitlements?.usage?.storageBytes || 0) + estimatedEncryptedBytes;
        if (projectedStorage > Number(entitlements.limits.storageLimitMb) * 1024 * 1024) {
          showEntitlementUpgrade('storage', `This upload would exceed the ${entitlements.limits.storageLimitMb} MB total account storage allowance.`);
          return;
        }
      }
      if (isCard) {
        const cardDigits = onlyDigits(form.cardNumber);
        if (!form.cardName.trim()) {
          showMessage('Add the name on the card before saving.', 'warning');
          return;
        }
        if (!form.cardNickname.trim()) {
          showMessage('Add a card nickname before saving.', 'warning');
          return;
        }
        if (cardDigits.length !== 16) {
          showMessage('Card number must be 16 digits.', 'warning');
          return;
        }
        if (!form.cardExpiry.trim()) {
          showMessage('Add the card expiry before saving.', 'warning');
          return;
        }
        if (!onlyDigits(form.cardCcv)) {
          showMessage('Add the card CCV before saving.', 'warning');
          return;
        }
      }
      if (isFileUpload && !editingItemId && !form.file?.dataUrl) {
        showMessage(`Choose a ${fileLabel} to store first.`, 'warning');
        return;
      }
      if (isFileUpload && !form.file) {
        showMessage(`Choose a ${fileLabel} to store first.`, 'warning');
        return;
      }
      const itemIdForSave = editingItemId || crypto.randomUUID();
      // A new/replacement file gets its own storage id. This keeps an existing stored
      // file intact until the replacement has been encrypted and uploaded successfully.
      const fileBlobIdForSave = isFileUpload && form.file?.dataUrl
        ? crypto.randomUUID()
        : (form.file?.externalDocumentId || itemIdForSave);
      const storedDocumentFile = isFileUpload ? await uploadEncryptedDocumentBlob(form.file, fileBlobIdForSave, isPicture ? 'picture' : 'document') : null;
      const notesValue = form.category === 'Checklists' ? normaliseChecklistNotes(form.notes) : form.notes.trim();
      const itemPayload = {
        title: isCard ? form.cardNickname.trim() : form.title.trim(),
        category: form.category,
        favourite: !!form.favourite,
        payload: isCard ? {
          url: '',
          username: '',
          password: '',
          notes: notesValue,
          file: null,
          cardName: form.cardName.trim(),
          cardNickname: form.cardNickname.trim(),
          cardNumber: onlyDigits(form.cardNumber),
          cardExpiry: form.cardExpiry.trim(),
          cardCcv: onlyDigits(form.cardCcv)
        } : {
          url: form.category === 'Checklists' ? '' : form.url.trim(),
          username: ['Notes', 'Checklists', DOCUMENTS_CATEGORY, PICTURES_CATEGORY].includes(form.category) ? '' : form.username.trim(),
          password: ['Notes', 'Checklists', DOCUMENTS_CATEGORY, PICTURES_CATEGORY].includes(form.category) ? '' : form.password,
          notes: notesValue,
          file: storedDocumentFile
        },
        updatedAt: new Date().toISOString()
      };

      if (editingItemId) {
        const itemIdBeingEdited = editingItemId;
        const previousItem = items.find((item) => item.id === itemIdBeingEdited);
        if (!previousItem) {
          setEditingItemId('');
          showMessage('That item is no longer available to edit. Nothing was changed.');
          return;
        }
        const next = items.map((item) => item.id === itemIdBeingEdited ? { ...item, ...itemPayload } : item);
        const syncResult = await saveItems(next, { autoSync: true, silentAutoSync: true, suppressSyncWarning: true });
        const previousExternalDocumentId = previousItem.payload?.file?.externalDocumentId || (previousItem.payload?.file?.storedExternally ? previousItem.id : '');
        const nextExternalDocumentId = storedDocumentFile?.externalDocumentId || '';
        const removedExternalDocument = [DOCUMENTS_CATEGORY, PICTURES_CATEGORY].includes(previousItem.category) && ![DOCUMENTS_CATEGORY, PICTURES_CATEGORY].includes(form.category) && previousItem.payload?.file?.storedExternally;
        const replacedExternalDocument = [DOCUMENTS_CATEGORY, PICTURES_CATEGORY].includes(previousItem.category)
          && [DOCUMENTS_CATEGORY, PICTURES_CATEGORY].includes(form.category)
          && previousItem.payload?.file?.storedExternally
          && nextExternalDocumentId
          && previousExternalDocumentId
          && nextExternalDocumentId !== previousExternalDocumentId;
        const cleanupResult = (removedExternalDocument || replacedExternalDocument) ? await cleanupStoredDocumentAfterVaultSave(previousItem, syncResult, { silent: true }) : null;
        const editedCategory = form.category;
        setEditingItemId('');
        setForm(emptyForm(editedCategory));
        setShowFormSecret(false);
        setItemCredentialFieldsArmed({ username: false, password: false });
        setIsItemPopupOpen(false);
        setViewItemId(itemIdBeingEdited);
        if (syncResult?.offline) {
          // The one-time offline popup or compact offline toast already confirms the local save.
        } else if (cleanupResult?.queued) {
          showMessage('Item updated. Encrypted file cleanup will finish automatically when the latest vault copy is protected.', 'warning');
        } else if (syncResult?.ok) {
          showMessage('Item updated.', 'success');
        } else {
          showMessage('Item updated on this device. Backup needs attention.', 'warning');
        }
        return;
      }

      const newItem = {
        id: itemIdForSave,
        ...itemPayload
      };
      const next = [newItem, ...items];
      const syncResult = await saveItems(next, { autoSync: true, silentAutoSync: true, suppressSyncWarning: true });
      setForm(emptyForm(form.category));
      setShowFormSecret(false);
      setItemCredentialFieldsArmed({ username: false, password: false });
      setIsItemPopupOpen(false);
      setViewItemId(newItem.id);
      if (syncResult?.offline) {
        // The one-time offline popup or compact offline toast already confirms the local save.
      } else if (syncResult?.ok) {
        showMessage('Item saved.', 'success');
      }
    } catch (error) {
      if (!error.entitlementHandled) showMessage(error.message || 'Item could not be saved. Please try again.', 'error');
    } finally {
      setIsSavingItem(false);
    }
  }

  function startEditItem(item) {
    setEditingItemId(item.id);
    setForm({
      title: item.title || '',
      category: item.category || 'Passwords',
      url: item.payload?.url || '',
      username: item.payload?.username || '',
      password: item.payload?.password || '',
      notes: item.payload?.notes || '',
      favourite: !!item.favourite,
      file: item.payload?.file || null,
      cardName: item.payload?.cardName || '',
      cardNickname: item.payload?.cardNickname || item.title || '',
      cardNumber: item.payload?.cardNumber || '',
      cardExpiry: item.payload?.cardExpiry || '',
      cardCcv: item.payload?.cardCcv || ''
    });
    setShowFormSecret(false);
    setItemCredentialFieldsArmed({ username: true, password: true });
    setCategory(item.category || '');
    setViewItemId('');
    setIsItemPopupOpen(true);
    showMessage(`Editing ${item.title || 'selected item'}. Save changes or cancel edit.`);
  }

  function cancelEdit() {
    const keepCategory = form.category;
    setEditingItemId('');
    setForm(emptyForm(keepCategory));
    setShowFormSecret(false);
    setItemCredentialFieldsArmed({ username: false, password: false });
    setIsItemPopupOpen(false);
  }

  function requestDeleteItem(item) {
    if (!item?.id) return;
    setPendingDeleteItemId(item.id);
  }

  function cancelDeleteItem() {
    setPendingDeleteItemId('');
  }

  async function confirmDeleteItem() {
    const id = pendingDeleteItemId;
    if (!id) return;
    setPendingDeleteItemId('');
    await deleteItem(id);
  }

  async function deleteItem(id) {
    if (viewItemId === id) setViewItemId('');
    const itemToDelete = items.find((item) => item.id === id) || null;
    const syncResult = await saveItems(items.filter((item) => item.id !== id), { autoSync: true, silentAutoSync: true });
    const cleanupResult = itemToDelete?.payload?.file?.storedExternally
      ? await cleanupStoredDocumentAfterVaultSave(itemToDelete, syncResult, { silent: true })
      : null;
    if (!bootstrap.tenantId || !bootstrap.userId) {
      showMessage('Item deleted on this device. Save your account details to enable protected cloud services.', 'warning');
    } else if (syncResult?.offline) {
      // The offline save confirmation already covers this local change; document cleanup is queued when needed.
    } else if (cleanupResult?.queued) {
      showMessage('Item deleted. Encrypted file storage cleanup will finish automatically after the latest vault copy is protected.', 'warning');
    } else if (syncResult?.ok) {
      showMessage(itemToDelete?.payload?.file?.storedExternally ? 'Item and encrypted file storage deleted.' : 'Item deleted.', 'success');
    }
  }

  async function toggleFavourite(id) {
    const next = items.map((item) => item.id === id ? { ...item, favourite: !item.favourite, updatedAt: new Date().toISOString() } : item);
    await saveItems(next, { autoSync: true, silentAutoSync: true });
  }

  async function copyText(label, value) {
    if (!value) return showMessage(`Nothing to copy for ${label}.`);
    await navigator.clipboard.writeText(value);
    showMessage(`${label} copied.`);
  }

  function clearForm() {
    if (editingItemId) return cancelEdit();
    setForm(emptyForm(form.category));
    setShowFormSecret(false);
    showMessage('Form cleared.');
  }

  async function checkDbHealth() {
    setDbStatus({ checked: true, connected: false, message: 'Checking connection...' });
    try {
      const result = await fetch('/.netlify/functions/db-health').then((res) => res.json());
      setDbStatus({ checked: true, connected: !!result.connected && !!result.schema_ready, message: result.connected && result.schema_ready ? 'Cloud backup connection ready.' : result.message || 'Cloud backup is not ready yet.' });
      showMessage(result.connected && result.schema_ready ? 'Cloud backup connection is ready.' : result.message || 'Cloud backup is not ready yet.');
    } catch (error) {
      setDbStatus({ checked: true, connected: false, message: 'Could not check the connection. Please try again.' });
      showMessage('Could not check the connection. Please try again.');
    }
  }

  async function bootstrapAdmin(event) {
    event.preventDefault();
    const checked = validateAccountIdentity(bootstrap);
    if (!checked.ok) {
      showMessage(checked.message, 'warning');
      return;
    }
    const email = checked.email;
    setSyncing(true);
    showMessage('Saving account details...');
    try {
      const profilePayload = { ...bootstrap, email, displayName: bootstrap.displayName, phoneCountryCode: checked.phoneCountryCode, phoneNumber: checked.phoneNumber, phoneE164: checked.phoneE164, accountName: bootstrap.accountName || bootstrap.tenantName || 'Private Vault' };
      const result = await postJson(customerSession.authenticated ? '/.netlify/functions/account-profile' : '/.netlify/functions/bootstrap-admin', profilePayload);
      if (result.ok) {
        const next = { ...bootstrap, email, phoneCountryCode: checked.phoneCountryCode, phoneNumber: checked.phoneNumber, phoneE164: result.phoneE164 || checked.phoneE164, tenantId: result.tenantId || bootstrap.tenantId, userId: result.userId || bootstrap.userId, accountVerified: customerSession.authenticated, otpStatus: customerSession.authenticated ? 'Device verified' : 'OTP verification required', accountName: result.accountName || bootstrap.accountName || bootstrap.tenantName, planCode: result.planCode || bootstrap.planCode || 'personal', planStatus: result.planStatus || bootstrap.planStatus || 'trial_pending', accountStatus: result.accountStatus || bootstrap.accountStatus || 'active', tenantRole: result.tenantRole || bootstrap.tenantRole || 'primary_owner' };
        setBootstrap(next);
        if (!customerSession.authenticated) setAccountStatus({ state: 'verification-required', message: result.message || 'Verify the one-time code to enable secure backup and syncing.' });
        showMessage(result.message || 'Account details saved.');
        if (masterPassword && customerSession.authenticated) {
          window.setTimeout(async () => {
            try {
              const restore = await restoreLatestCloudVault(masterPassword, { showSuccess: false, reason: 'bootstrap' });
              if (restore.restored) showMessage(`Your account is ready and the latest cloud backup was restored to this device. ${restore.items.length} item(s) loaded.`);
            } catch (error) {
              showMessage('Admin is ready. Cloud restore was checked, but this device kept its current local vault.');
            }
          }, 250);
        }
      } else {
        showMessage(`${result.message || 'Account setup did not complete.'}${result.error ? ` Error: ${result.error}` : ''}`);
      }
    } catch (error) {
      showMessage(`Could not save account details. ${error.message || 'Please try again.'}`);
    } finally {
      setSyncing(false);
    }
  }

  async function loadSnapshotHistory(shouldShowMessage = true) {
    if (!featureIncluded('cloudBackupSync')) {
      const note = 'Recovery points are not included in the current plan because cloud backup and sync are unavailable.';
      setSnapshotHistory((current) => ({ ...current, loaded: true, loading: false, message: note }));
      if (shouldShowMessage) showEntitlementUpgrade('cloudBackupSync', note);
      return null;
    }
    if (!bootstrap.tenantId || !bootstrap.userId) {
      const note = 'Save your account details first so backup history can be loaded.';
      setSnapshotHistory((current) => ({ ...current, loaded: true, loading: false, message: note }));
      if (shouldShowMessage) showMessage(note);
      return null;
    }
    setSnapshotHistory((current) => ({ ...current, loading: true, message: 'Loading backup history...' }));
    try {
      const result = await fetch('/.netlify/functions/sync-vault?history=1').then((res) => res.json());
      if (!result.ok) throw new Error(result.message || result.error || 'Could not load backup history.');
      const next = {
        loaded: true,
        loading: false,
        total: Number(result.snapshotCount || 0),
        snapshots: result.snapshots || [],
        message: result.snapshotCount ? `${result.snapshotCount} backup(s) found.` : 'No cloud backups found yet.'
      };
      setSnapshotHistory(next);
      setSyncStatus((current) => ({ ...current, snapshotCount: next.total }));
      if (shouldShowMessage) showMessage(next.message);
      return next;
    } catch (error) {
      const note = `Could not load backup history. ${error.message || ''}`.trim();
      setSnapshotHistory((current) => ({ ...current, loaded: true, loading: false, message: note }));
      if (shouldShowMessage) showMessage(note);
      return null;
    }
  }

  async function syncEncryptedVault(options = {}) {
    if (!featureIncluded('cloudBackupSync')) {
      const note = 'Cloud backup and sync are not included in the current plan. Your encrypted local vault remains available.';
      saveSyncSafety({ state: 'plan-local-only', pending: false, conflict: false, sessionRequired: false, message: note, itemCount: getVisibleVaultItems(options.nextItems || items).length, lastFailureAt: '', acknowledgedAt: '' });
      if (!options.silent) showEntitlementUpgrade('cloudBackupSync', note);
      return { ok: false, localOnly: true, planLimited: true, code: 'PLAN_FEATURE_REQUIRED', feature: 'cloudBackupSync', upgradeRequired: true, message: note };
    }
    const effectiveItems = options.nextItems || items;
    const envelope = options.envelope || getLocalEnvelope();
    const silent = Boolean(options.silent);
    const activeAccount = options.account || bootstrap;
    const hasVerifiedSession = (customerSession.authenticated && customerSession.cloudAccess !== false) || options.sessionVerified === true;
    const itemCount = getVisibleVaultItems(effectiveItems).length;
    if (!envelope) {
      const note = 'No encrypted vault copy was found on this device.';
      setSyncStatus({ state: 'error', message: note, lastSyncAt: '', lastSnapshotId: '', itemCount, snapshotCount: snapshotHistory.total });
      if (!options.suppressFailureModal) showBackupFailurePopup(note, { itemCount, items: effectiveItems });
      if (!silent) showMessage(note, 'error');
      return { ok: false, message: note };
    }
    if (!activeAccount.tenantId || !activeAccount.userId || !hasVerifiedSession) {
      const note = 'Verify this device to back up your latest vault changes.';
      setSyncStatus({ state: 'warning', message: note, lastSyncAt: syncStatus.lastSyncAt, lastSnapshotId: syncStatus.lastSnapshotId, itemCount, snapshotCount: snapshotHistory.total });
      if (!options.suppressFailureModal) showBackupFailurePopup(note, { sessionRequired: true, itemCount, items: effectiveItems });
      if (!silent) showMessage('Changes are safe on this device, but device verification is required before backup can continue.', 'warning');
      await recordSyncEvent('backup_waiting_for_verification', 'warning', { itemCount, message: note });
      return { ok: false, sessionRequired: true, message: note };
    }
    const envelopeOwner = vaultOwnerBindingFromEnvelope(envelope);
    const verifiedSessionOwner = customerSession.authenticated
      ? { tenantId: String(customerSession.tenantId || ''), userId: String(customerSession.userId || '') }
      : {};
    const targetOwner = hasCompleteVaultOwnerBinding(verifiedSessionOwner) ? verifiedSessionOwner : vaultOwnerBindingFromAccount(activeAccount);
    if (hasCompleteVaultOwnerBinding(envelopeOwner) && hasCompleteVaultOwnerBinding(targetOwner) && !vaultOwnerBindingsMatch(envelopeOwner, targetOwner)) {
      const note = 'This encrypted vault belongs to a different Password-Encrypt account than the currently verified browser session. Backup was blocked and nothing was uploaded.';
      setSyncStatus({ state: 'error', message: note, lastSyncAt: syncStatus.lastSyncAt, lastSnapshotId: syncStatus.lastSnapshotId, itemCount, snapshotCount: snapshotHistory.total });
      saveSyncSafety({ state: 'account-mismatch', pending: true, conflict: false, sessionRequired: true, message: note, itemCount, lastFailureAt: new Date().toISOString(), acknowledgedAt: '' });
      if (!silent) showMessage(note, 'error');
      return { ok: false, code: 'ACCOUNT_VAULT_MISMATCH', accountMismatch: true, message: note };
    }
    if (syncOperationRef.current) {
      return { ok: false, inProgress: true, message: 'A secure backup is already in progress.' };
    }
    syncOperationRef.current = true;
    setSyncing(true);
    setSyncStatus({ state: 'syncing', message: 'Protecting your latest vault changes...', lastSyncAt: syncStatus.lastSyncAt, lastSnapshotId: syncStatus.lastSnapshotId, itemCount, snapshotCount: snapshotHistory.total });
    try {
      const result = await postJson('/.netlify/functions/sync-vault', {
        encryptedBlob: envelope.encrypted,
        localSalt: envelope.salt,
        localIv: envelope.iv,
        itemCount,
        clientUpdatedAt: envelope.updatedAt,
        baseSnapshotId: envelope.baseCloudSnapshotId || '',
        deviceId: getSyncDeviceId(),
        deviceType: friendlyDeviceType(),
        explicitConflictChoice: Boolean(options.explicitConflictChoice)
      });
      if (!result.ok) {
        if (handleEntitlementError(result, 'cloudBackupSync')) {
          const note = result.message || 'The current plan limit has been reached.';
          const itemLimitReached = result.code === 'ITEM_LIMIT_REACHED';
          saveSyncSafety({
            state: itemLimitReached ? 'backup-pending' : 'plan-local-only',
            pending: itemLimitReached,
            conflict: false,
            sessionRequired: false,
            message: note,
            itemCount,
            lastFailureAt: itemLimitReached ? new Date().toISOString() : '',
            acknowledgedAt: ''
          });
          setCustomerSession((current) => ({ ...current, checked: true, authenticated: true, cloudAccess: itemLimitReached ? current.cloudAccess !== false : false, accessCode: result.code || 'PLAN_FEATURE_REQUIRED', message: note, entitlements: result.entitlements || current.entitlements }));
          return { ...result, planLimited: true };
        }
        const conflictBlocked = result.code === 'VAULT_CONFLICT' || Number(result.httpStatus || 0) === 409;
        if (conflictBlocked) {
          const latest = await fetchLatestCloudSnapshot(activeAccount);
          const localEnvelope = getLocalEnvelope() || envelope;
          if (latest?.hasSnapshot && latest.snapshot && cloudSnapshotMatchesEnvelope(latest.snapshot, localEnvelope)) {
            const matchedEnvelope = {
              ...localEnvelope,
              cloudSnapshotId: latest.snapshot.id || '',
              baseCloudSnapshotId: latest.snapshot.id || ''
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(matchedEnvelope));
            const lastSyncAt = latest.snapshot.created_at || latest.snapshot.client_updated_at || new Date().toISOString();
            setSyncStatus({ state: 'success', message: `Your vault is up to date. ${latest.snapshot.item_count ?? itemCount} item(s) are protected and available on your devices.`, lastSyncAt, lastSnapshotId: latest.snapshot.id || '', itemCount: Number(latest.snapshot.item_count ?? itemCount), snapshotCount: snapshotHistory.total || 1 });
            saveSyncSafety({ state: 'up-to-date', pending: false, conflict: false, sessionRequired: false, message: 'Your vault is up to date.', itemCount: Number(latest.snapshot.item_count ?? itemCount), lastSuccessAt: lastSyncAt, lastSnapshotId: latest.snapshot.id || '', acknowledgedAt: '' });
            closeSyncSafetyModal();
            setSyncPromptShown(false);
            return { ok: true, reusedExistingBackup: true, snapshotId: latest.snapshot.id || '', verified: latest };
          }
          setSyncStatus({ state: 'warning', message: 'Different vault changes were found. Nothing was replaced.', lastSyncAt: '', lastSnapshotId: latest?.snapshot?.id || '', itemCount, snapshotCount: snapshotHistory.total });
          if (latest?.hasSnapshot && latest.snapshot) showConflictPopup(latest, localEnvelope, itemCount);
          else showBackupFailurePopup('A possible vault conflict was detected. Nothing was replaced. Open Vault Safety before continuing.', { itemCount, items: effectiveItems });
          return { ...result, conflict: true, message: result.message || 'Different vault changes were found. Nothing was replaced.' };
        }
        const sessionRequired = result.code === 'SESSION_REQUIRED' || Number(result.httpStatus || 0) === 401;
        const accessPaused = ['TRIAL_EXPIRED', 'TRIAL_CANCELLED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_VERIFICATION_REQUIRED'].includes(String(result.code || ''));
        const note = sessionRequired
          ? 'Verify this device to finish backing up your latest changes.'
          : (result.message || 'Secure backup did not complete.');
        setSyncStatus({ state: sessionRequired ? 'warning' : 'error', message: note, lastSyncAt: '', lastSnapshotId: '', itemCount, snapshotCount: snapshotHistory.total });
        if (sessionRequired) {
          setCustomerSession({ checked: true, authenticated: false, cloudAccess: false, accessCode: 'SESSION_REQUIRED', tenantId: '', userId: '', message: 'Verify this device to enable secure backup and syncing.' });
          setAccountStatus({ state: 'session-needed', message: 'Verify this device to enable secure backup and syncing.' });
        } else if (accessPaused) {
          setCustomerSession((current) => ({ ...current, checked: true, authenticated: true, cloudAccess: false, accessCode: result.code || 'ACCOUNT_ACCESS_PAUSED', message: note }));
          setAccountStatus({ state: 'access-paused', message: note });
        }
        if (!options.suppressFailureModal) showBackupFailurePopup(note, { sessionRequired, itemCount, items: effectiveItems });
        if (!silent) showMessage('Your changes are safe on this device, but secure backup needs attention.', sessionRequired ? 'warning' : 'error');
        await recordSyncEvent('backup_failed', sessionRequired ? 'warning' : 'error', { itemCount, message: note });
        return { ...result, sessionRequired, message: note };
      }
      if (result.entitlements) updateEntitlements(result.entitlements);
      const verified = await fetchLatestCloudSnapshot(activeAccount);
      const verifiedSnapshot = verified?.snapshot || null;
      const verifiedMatchesThisDevice = cloudSnapshotMatchesEnvelope(verifiedSnapshot, envelope);
      const finalSnapshotId = verifiedMatchesThisDevice
        ? (verifiedSnapshot?.id || result.snapshotId || '')
        : (result.snapshotId || envelope.cloudSnapshotId || '');
      const savedEnvelope = {
        ...envelope,
        cloudSnapshotId: finalSnapshotId,
        baseCloudSnapshotId: finalSnapshotId || envelope.baseCloudSnapshotId || envelope.cloudSnapshotId || ''
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedEnvelope));
      const history = await loadSnapshotHistory(false);
      const lastSyncAt = new Date().toISOString();
      const snapshotCount = history?.total || snapshotHistory.total || (verified?.hasSnapshot ? 1 : 0);
      const note = verified?.hasSnapshot
        ? `Your vault is up to date. ${verifiedSnapshot?.item_count ?? itemCount} item(s) are protected and available on your devices.`
        : 'Your latest changes were backed up. Backup details are still updating.';
      setSyncStatus({ state: 'success', message: note, lastSyncAt, lastSnapshotId: verifiedSnapshot?.id || result.snapshotId || '', itemCount: Number(verifiedSnapshot?.item_count ?? itemCount), snapshotCount });
      saveSyncSafety({ state: 'up-to-date', pending: false, conflict: false, sessionRequired: false, message: 'Your vault is up to date.', itemCount: Number(verifiedSnapshot?.item_count ?? itemCount), lastSuccessAt: lastSyncAt, lastSnapshotId: verifiedSnapshot?.id || result.snapshotId || '', acknowledgedAt: '' });
      if (syncSafetyModal.mode === 'backup-failed' || syncSafetyModal.mode === 'verification-required') closeSyncSafetyModal();
      setSyncPromptShown(false);
      if (!silent) showMessage(note, 'success');
      return { ...result, verified };
    } catch (error) {
      const note = `Secure backup did not complete. ${error.message || 'Please try again.'}`;
      setSyncStatus({ state: 'error', message: note, lastSyncAt: '', lastSnapshotId: '', itemCount, snapshotCount: snapshotHistory.total });
      if (!options.suppressFailureModal) showBackupFailurePopup(note, { itemCount, items: effectiveItems });
      if (!silent) showMessage('Your changes are safe on this device, but secure backup needs attention.', 'error');
      await recordSyncEvent('backup_failed', 'error', { itemCount, message: note });
      return { ok: false, message: note };
    } finally {
      syncOperationRef.current = false;
      setSyncing(false);
    }
  }

  async function restoreCloudToThisDevice(confirmed = false) {
    if (!featureIncluded('cloudBackupSync')) {
      showEntitlementUpgrade('cloudBackupSync', 'Checking other devices and recovery copies requires cloud backup and sync. Your encrypted local vault remains available.');
      return;
    }
    if (!masterPassword) return showMessage('Unlock the vault first, then check for the latest secure copy.', 'warning');
    if (cloudChangeCheckBusy) return;
    if (syncSafety.pending && !confirmed) {
      setSyncSafetyModal({
        visible: true,
        mode: 'danger',
        title: 'This device has changes waiting for backup',
        message: 'Checking another copy while this device has unprotected changes could put those changes at risk.',
        details: { action: 'restore-cloud', warning: 'Back up this device first unless you deliberately want to discard its pending changes.' }
      });
      return;
    }
    setCloudChangeCheckBusy(true);
    showMessage('Checking secure backup for changes from another device...');
    try {
      const result = await restoreLatestCloudVault(masterPassword, { showSuccess: true, reason: 'manual-check', forceCloud: false });
      if (result?.upToDate) showMessage('Check complete. This device already has the latest protected vault copy.', 'success');
      else if (result?.localNewer) showMessage('Check complete. This device has newer changes waiting to be backed up.', 'warning');
      else if (result?.sessionRequired) showMessage('Check paused. Verify this device before checking the protected cloud copy.', 'warning');
      else if (!result?.restored && !result?.conflict && !result?.planFeatureRequired) showMessage(result?.latest?.message || 'Check complete. No secure backup was found and this device was not changed.', 'warning');
    } catch {
      showMessage('The secure backup could not be opened with this master password. This device was not changed.', 'error');
    } finally {
      setCloudChangeCheckBusy(false);
    }
  }


  async function refreshVaultAndBackup() {
    if (syncing || syncOperationRef.current) return;
    if (!featureIncluded('cloudBackupSync')) {
      showEntitlementUpgrade('cloudBackupSync', 'Refreshing across devices and backing up changes requires cloud backup and sync. Your encrypted local vault remains available.');
      return;
    }
    if (!navigator.onLine) {
      setSyncSafetyModal({
        visible: true,
        mode: 'offline',
        title: 'No internet connection',
        message: 'The vault saved on this device is still available. Reconnect before checking secure backup or syncing changes.',
        details: null
      });
      return;
    }
    if (!masterPassword) {
      showMessage('Unlock the vault with your master password before refreshing.', 'warning');
      return;
    }
    if (!customerSession.authenticated || customerSession.cloudAccess === false) {
      openDeviceVerification();
      return;
    }

    setSyncing(true);
    try {
      const check = await restoreLatestCloudVault(masterPassword, { showSuccess: false, reason: 'manual-refresh', forceCloud: false });
      if (check?.sessionRequired) {
        openDeviceVerification();
        return;
      }
      if (check?.conflict) return;

      if (check?.localNewer) {
        const backup = await syncEncryptedVault({ envelope: check.localEnvelope || getLocalEnvelope(), nextItems: items, silent: true, retry: true });
        if (backup?.ok) showMessage('Vault refreshed and your latest changes were backed up.', 'success');
        return;
      }

      if (check?.restored) {
        showMessage('Vault refreshed. Newer changes from secure backup are now on this device.', 'success');
        return;
      }

      if (check?.upToDate) {
        showMessage('Vault refreshed. Everything is up to date.', 'success');
        return;
      }

      if (!check?.latest?.hasSnapshot && getLocalEnvelope()) {
        const backup = await syncEncryptedVault({ envelope: getLocalEnvelope(), nextItems: items, silent: true, retry: true });
        if (backup?.ok) showMessage('Vault refreshed and backed up securely.', 'success');
        return;
      }

      showMessage(check?.latest?.message || 'Vault refresh completed. Nothing was changed.', 'success');
    } catch (error) {
      showMessage(`Vault refresh did not complete. ${error.message || 'Please try again.'}`, 'error');
    } finally {
      setSyncing(false);
    }
  }


  const visibleItems = useMemo(() => getVisibleVaultItems(items), [items]);
  const customFolders = useMemo(() => getCustomFolders(items), [items]);
  const savedFolderOrder = useMemo(() => getFolderOrder(items), [items]);
  const favouriteFolderNames = useMemo(() => getFavouriteFolders(items), [items]);
  const selectableFolders = useMemo(() => [...BUILT_IN_CATEGORIES, ...customFolders], [customFolders]);

  const filteredItems = useMemo(() => {
    const activeSearch = query.trim().toLowerCase();
    const hasFolder = Boolean(category);
    if (!activeSearch && !hasFolder) return [];
    return visibleItems.filter((item) => {
      const text = `${item.title} ${item.category} ${item.payload?.emergencyImport?.sourceCategory || ''} ${item.payload?.url || ''} ${item.payload?.username || ''} ${item.payload?.notes || ''}`.toLowerCase();
      const matchesSearch = activeSearch ? text.includes(activeSearch) : true;
      const matchesFolder = activeSearch ? true : (!category ? true : category === 'All' ? true : category === FAVOURITES_VIEW ? Boolean(item.favourite) : item.category === category);
      return matchesSearch && matchesFolder;
    }).sort(compareVaultResults);
  }, [visibleItems, query, category]);

  const folderChips = useMemo(() => {
    const baseFolders = [
      { name: 'All', count: visibleItems.length, folderFavourite: favouriteFolderNames.includes('All'), custom: false, fixed: true },
      ...BUILT_IN_CATEGORIES.map((cat) => ({ name: cat, count: visibleItems.filter((item) => item.category === cat).length, folderFavourite: favouriteFolderNames.includes(cat), custom: false, fixed: false })),
      ...customFolders.map((cat) => ({ name: cat, count: visibleItems.filter((item) => item.category === cat).length, folderFavourite: favouriteFolderNames.includes(cat), custom: true, fixed: false }))
    ];
    const first = baseFolders.find((folder) => folder.name === 'All');
    const rest = baseFolders.filter((folder) => folder.name !== 'All');
    const order = savedFolderOrder.filter((name) => rest.some((folder) => folder.name === name));
    const orderedRest = [
      ...order.map((name) => rest.find((folder) => folder.name === name)).filter(Boolean),
      ...rest.filter((folder) => !order.includes(folder.name))
    ];
    return [first, ...orderedRest].filter(Boolean);
  }, [visibleItems, customFolders, savedFolderOrder, favouriteFolderNames]);

  const mobileFolderChips = useMemo(() => {
    const allFolder = folderChips.find((folder) => folder.name === 'All');
    const homeFolders = folderChips.filter((folder) => folder.name !== 'All' && folder.folderFavourite);
    return [allFolder, ...homeFolders].filter(Boolean);
  }, [folderChips]);

  const hasActiveVaultFilter = Boolean(query.trim() || category);
  const viewedItem = viewItemId ? visibleItems.find((item) => item.id === viewItemId) : null;
  const routePath = typeof window !== 'undefined' ? window.location.pathname : '/vault';
  const normalisedRoutePath = routePath.length > 1 ? routePath.replace(/\/+$/, '') : routePath;
  const isVaultRoute = ['/vault', '/app', '/login'].includes(normalisedRoutePath);
  const vaultSearchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search || '') : new URLSearchParams();
  const vaultEntryMode = vaultSearchParams.get('entry') || '';
  const existingCustomerEntry = isVaultRoute && vaultEntryMode === 'existing';
  const newCustomerOnboardingEntry = isVaultRoute && vaultEntryMode === 'onboarding';
  const onboardingInstallEntry = isVaultRoute && vaultEntryMode === 'install';
  const isEmergencyInviteRoute = normalisedRoutePath === '/emergency-invite';
  const isTrustedPersonReminderRoute = normalisedRoutePath === '/trusted-person-confirm';
  const isPublicLandingRoute = !isVaultRoute && !isEmergencyInviteRoute && !isTrustedPersonReminderRoute;

  useLayoutEffect(() => {
    if (!newCustomerOnboardingEntry && !onboardingInstallEntry) return;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [newCustomerOnboardingEntry, onboardingInstallEntry]);

  const hasBackDismissibleLayer = Boolean(
    mobileHeaderMenuOpen
    || exitAppConfirmationOpen
    || accountSecurityModal.visible
    || accountRecoveryModal.visible
    || entitlementModal.visible
    || deviceVerificationModal.visible
    || syncSafetyModal.visible
    || subscriptionActionModal.visible
    || verifyOverlay.visible
    || pendingDeleteItemId
    || viewItemId
    || isItemPopupOpen
    || isFolderPopupOpen
    || isFolderListPopupOpen
    || folderManager.visible
    || signupLegalModal.visible
    || billingLegalModalOpen
    || trustedPersonHelpOpen
    || emergencyImportState.visible
    || isCreateAccountPopupOpen
    || isOpenVaultChoicePopupOpen
    || isCreateVaultPopupOpen
  );

  // Keep the Back handler on the latest rendered UI state immediately. A passive
  // effect can be one render behind when Android dispatches Back during a fast
  // unlock, popup close or Settings-to-home transition.
  backNavigationStateRef.current = {
    locked,
    activePage,
    mobileHeaderMenuOpen,
    exitAppConfirmationOpen,
    accountSecurityModalVisible: accountSecurityModal.visible,
    accountRecoveryModalVisible: accountRecoveryModal.visible,
    entitlementModalVisible: entitlementModal.visible,
    deviceVerificationModalVisible: deviceVerificationModal.visible,
    syncSafetyModalVisible: syncSafetyModal.visible,
    subscriptionActionModalVisible: subscriptionActionModal.visible,
    verifyOverlayVisible: verifyOverlay.visible,
    pendingDeleteItemId: Boolean(pendingDeleteItemId),
    viewItemId: Boolean(viewItemId),
    isItemPopupOpen,
    isFolderPopupOpen,
    isFolderListPopupOpen,
    folderManagerVisible: folderManager.visible,
    signupLegalModalVisible: signupLegalModal.visible,
    billingLegalModalOpen,
    trustedPersonHelpOpen,
    isCreateAccountPopupOpen,
    isOpenVaultChoicePopupOpen,
    isCreateVaultPopupOpen,
    hasBackDismissibleLayer,
    isVaultRoute
  };

  function consumeVaultBackAction() {
    const state = backNavigationStateRef.current;
    const customOverlayOpen = Boolean(document.querySelector('.custom-select-menu, .country-picker-layer'));

    if (customOverlayOpen) {
      window.dispatchEvent(new CustomEvent('my-passwords-close-overlay'));
      return true;
    }
    if (state.exitAppConfirmationOpen) { backNavigationStateRef.current.exitAppConfirmationOpen = false; setExitAppConfirmationOpen(false); return true; }
    if (state.accountSecurityModalVisible) { backNavigationStateRef.current.accountSecurityModalVisible = false; closeAccountSecurityModal(); return true; }
    if (state.accountRecoveryModalVisible) { backNavigationStateRef.current.accountRecoveryModalVisible = false; setAccountRecoveryModal({ visible: false, step: 'contact', channel: 'email', contact: '', challengeId: '', code: '', testOtpCode: '', message: '', busy: false }); return true; }
    if (state.entitlementModalVisible) { backNavigationStateRef.current.entitlementModalVisible = false; setEntitlementModal({ visible: false, feature: '', title: '', message: '' }); return true; }
    if (state.deviceVerificationModalVisible) { backNavigationStateRef.current.deviceVerificationModalVisible = false; setDeviceVerificationModal({ visible: false, purpose: '' }); return true; }
    if (state.syncSafetyModalVisible) { backNavigationStateRef.current.syncSafetyModalVisible = false; closeSyncSafetyModal(); return true; }
    if (state.subscriptionActionModalVisible) { backNavigationStateRef.current.subscriptionActionModalVisible = false; setSubscriptionActionModal({ visible: false, action: '', title: '', message: '', planCode: '', interval: '', mode: '' }); return true; }
    if (state.verifyOverlayVisible) { backNavigationStateRef.current.verifyOverlayVisible = false; hideVerifyOverlay(); return true; }
    if (state.pendingDeleteItemId) { backNavigationStateRef.current.pendingDeleteItemId = false; cancelDeleteItem(); return true; }
    if (state.viewItemId) { backNavigationStateRef.current.viewItemId = false; closeViewItem(); return true; }
    if (state.isItemPopupOpen) { backNavigationStateRef.current.isItemPopupOpen = false; closeItemPopup(); return true; }
    if (state.isFolderPopupOpen) { backNavigationStateRef.current.isFolderPopupOpen = false; closeFolderPopup(); return true; }
    if (state.folderManagerVisible) { backNavigationStateRef.current.folderManagerVisible = false; closeFolderManager(); return true; }
    if (state.isFolderListPopupOpen) { backNavigationStateRef.current.isFolderListPopupOpen = false; setIsFolderListPopupOpen(false); return true; }
    if (state.signupLegalModalVisible) { backNavigationStateRef.current.signupLegalModalVisible = false; setSignupLegalModal((current) => ({ ...current, visible: false })); return true; }
    if (state.billingLegalModalOpen) { backNavigationStateRef.current.billingLegalModalOpen = false; setBillingLegalModalOpen(false); return true; }
    if (state.trustedPersonHelpOpen) { backNavigationStateRef.current.trustedPersonHelpOpen = false; setTrustedPersonHelpOpen(false); return true; }
    if (state.isCreateAccountPopupOpen) { backNavigationStateRef.current.isCreateAccountPopupOpen = false; setIsCreateAccountPopupOpen(false); return true; }
    if (state.isOpenVaultChoicePopupOpen) { backNavigationStateRef.current.isOpenVaultChoicePopupOpen = false; setIsOpenVaultChoicePopupOpen(false); return true; }
    if (state.isCreateVaultPopupOpen) { backNavigationStateRef.current.isCreateVaultPopupOpen = false; setIsCreateVaultPopupOpen(false); return true; }
    if (state.mobileHeaderMenuOpen) { backNavigationStateRef.current.mobileHeaderMenuOpen = false; setMobileHeaderMenuOpen(false); return true; }

    if (state.locked) return false;

    if (state.activePage !== 'home') {
      backNavigationStateRef.current.activePage = 'home';
      setActivePage('home');
      setActiveSettingsSection('overview');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return true;
    }

    backNavigationStateRef.current.exitAppConfirmationOpen = true;
    setExitAppConfirmationOpen(true);
    return true;
  }

  consumeVaultBackActionRef.current = consumeVaultBackAction;

  function destroyVaultCloseWatcher() {
    const watcher = vaultCloseWatcherRef.current;
    vaultCloseWatcherRef.current = null;
    if (!watcher) return;
    try {
      watcher.destroy();
    } catch {
      // A watcher can already be inactive after dispatching its close event.
    }
  }

  function armVaultCloseWatcher() {
    if (!vaultCloseWatcherEnabledRef.current || vaultCloseWatcherRef.current || typeof window.CloseWatcher !== 'function') return false;

    try {
      const watcher = new window.CloseWatcher();
      vaultCloseWatcherRef.current = watcher;

      watcher.addEventListener('close', () => {
        if (vaultCloseWatcherRef.current === watcher) vaultCloseWatcherRef.current = null;
        if (!vaultCloseWatcherEnabledRef.current) return;

        const consumed = consumeVaultBackActionRef.current();
        if (!consumed) {
          vaultCloseWatcherEnabledRef.current = false;
          try {
            window.history.back();
          } catch {
            // With no dismissible app state, the next native Back request exits.
          }
          return;
        }

        // The HTML standard deactivates this watcher after its close handler
        // returns. Re-arm in a microtask so the replacement is independent,
        // rather than being grouped with the watcher that is still closing.
        // Microtasks run before another hardware Back request can be delivered.
        window.queueMicrotask(() => {
          if (vaultCloseWatcherEnabledRef.current) armVaultCloseWatcher();
        });
      }, { once: true });

      return true;
    } catch {
      vaultCloseWatcherRef.current = null;
      return false;
    }
  }

  const shouldControlVaultCloseRequest = isVaultRoute
    && !isEmergencyInviteRoute
    && (!locked || hasBackDismissibleLayer);

  useLayoutEffect(() => {
    vaultCloseWatcherEnabledRef.current = shouldControlVaultCloseRequest;

    if (!shouldControlVaultCloseRequest) {
      destroyVaultCloseWatcher();
      return undefined;
    }

    if (typeof window.CloseWatcher === 'function') {
      armVaultCloseWatcher();
      return () => {
        vaultCloseWatcherEnabledRef.current = false;
        destroyVaultCloseWatcher();
      };
    }

    // Older desktop browsers still get an Escape-key fallback. No History API
    // guard is installed, so unsupported Android browsers keep native Back.
    const handleEscapeFallback = (event) => {
      if (event.key !== 'Escape') return;
      const consumed = consumeVaultBackActionRef.current();
      if (consumed) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener('keydown', handleEscapeFallback, true);
    return () => {
      vaultCloseWatcherEnabledRef.current = false;
      document.removeEventListener('keydown', handleEscapeFallback, true);
    };
  }, [shouldControlVaultCloseRequest]);

  function confirmExitApp() {
    backNavigationStateRef.current.exitAppConfirmationOpen = false;
    setExitAppConfirmationOpen(false);
    vaultCloseWatcherEnabledRef.current = false;
    destroyVaultCloseWatcher();

    // Installed PWAs may permit window.close(); normal browser tabs usually do
    // not, so fall back to real browser history without adding guard entries.
    try {
      window.close();
    } catch {
      // Continue to the history fallback below.
    }
    window.setTimeout(() => {
      if (document.visibilityState === 'hidden') return;
      try {
        window.history.back();
      } catch {
        // The user can use native Back again if the platform blocks both methods.
      }
    }, 80);
  }

  useEffect(() => {
    if (isEmergencyInviteRoute || (locked && !hasBackDismissibleLayer && !isVaultRoute)) return undefined;
    let touchStartY = 0;

    const rememberTouchStart = (event) => {
      if (event.touches?.length === 1) touchStartY = event.touches[0].clientY;
    };
    const stopPullToRefresh = (event) => {
      if (event.touches?.length !== 1 || document.body.classList.contains('app-popup-open')) return;
      const scrollTop = document.scrollingElement?.scrollTop || window.scrollY || 0;
      const movingDown = event.touches[0].clientY > touchStartY;
      if (scrollTop <= 0 && movingDown && event.cancelable) event.preventDefault();
    };

    document.addEventListener('touchstart', rememberTouchStart, { passive: true });
    document.addEventListener('touchmove', stopPullToRefresh, { passive: false });
    return () => {
      document.removeEventListener('touchstart', rememberTouchStart);
      document.removeEventListener('touchmove', stopPullToRefresh);
    };
  }, [isEmergencyInviteRoute, isVaultRoute, locked, hasBackDismissibleLayer]);

  useEffect(() => {
    if (!isPublicLandingRoute) {
      setShowLandingBackToTop(false);
      return undefined;
    }

    const updateBackToTopVisibility = () => {
      setShowLandingBackToTop(window.scrollY > window.innerHeight);
    };

    updateBackToTopVisibility();
    window.addEventListener('scroll', updateBackToTopVisibility, { passive: true });
    window.addEventListener('resize', updateBackToTopVisibility);

    return () => {
      window.removeEventListener('scroll', updateBackToTopVisibility);
      window.removeEventListener('resize', updateBackToTopVisibility);
    };
  }, [isPublicLandingRoute]);

  useEffect(() => {
    if (!isPublicLandingRoute || typeof IntersectionObserver === 'undefined') return undefined;
    const cards = Array.from(document.querySelectorAll('.landing-plan-reveal'));
    if (!cards.length) return undefined;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduceMotion) {
      cards.forEach((card) => card.classList.add('is-visible'));
      return undefined;
    }

    cards.forEach((card) => card.classList.add('plan-reveal-ready'));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [isPublicLandingRoute, publicPlans.length]);

  function scrollLandingToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  useEffect(() => {
    if (isEmergencyInviteRoute) loadEmergencyInviteStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEmergencyInviteRoute]);

  function openVaultApp() {
    if (isPublicLandingRoute) {
      setIsOpenVaultChoicePopupOpen(true);
      return;
    }
    window.location.assign('/vault?entry=existing');
  }

  function continueExistingCustomerToVault() {
    setIsOpenVaultChoicePopupOpen(false);
    window.location.assign('/vault?entry=existing');
  }

  function startNewCustomerFromVaultChoice() {
    setIsOpenVaultChoicePopupOpen(false);
    openCreateAccountPopup();
  }

  function openCreateAccountPopup(preselectedPlanCode = '') {
    onboardingSessionIsolationRef.current = true;
    clearPendingOnboardingAccount();
    setOnboardingSecurityWarning('');
    setSignupLegalModal({ visible: false, page: 'terms' });
    const preferredPlan = publicPlans.find((plan) => plan.code === preselectedPlanCode)
      || publicPlans[Math.floor(publicPlans.length / 2)]
      || publicPlans[0]
      || null;
    setLandingOnboardingStep(1);
    setLandingSignup({ status: 'idle', message: '', existingAccount: false, tenantId: '', userId: '', planName: '', trialDays: 0, trialStartedAt: '', trialEndsAt: '', welcomeEmailSent: false });
    setLandingOtp({ status: 'idle', channel: 'email', challengeId: '', input: '', message: '', testCode: '', expiresAt: '', emailSendCount: 0, smsFallbackEligible: false });
    setLandingAccountDraft({
      displayName: '',
      email: '',
      phoneCountryCode: '+254',
      phoneCountryIso: 'ke',
      phoneNumber: '',
      phoneE164: '',
      accountName: '',
      planCode: preferredPlan?.code || '',
      legalAccepted: false
    });
    setIsCreateAccountPopupOpen(true);
  }

  function closeCreateAccountPopup() {
    onboardingSessionIsolationRef.current = false;
    clearPendingOnboardingAccount();
    setSignupLegalModal({ visible: false, page: 'terms' });
    setIsCreateAccountPopupOpen(false);
    setLandingOnboardingStep(1);
    setLandingOtp({ status: 'idle', channel: 'email', challengeId: '', input: '', message: '', testCode: '', expiresAt: '', emailSendCount: 0, smsFallbackEligible: false });
  }

  function openSignupLegalDocument(page) {
    const safePage = ['terms', 'privacy', 'billing'].includes(page) ? page : 'terms';
    setSignupLegalModal({ visible: true, page: safePage });
  }

  function closeSignupLegalDocument() {
    setSignupLegalModal((current) => ({ ...current, visible: false }));
  }

  function handleSignupLegalDocumentClick(event) {
    const anchor = event.target?.closest?.('a[href]');
    if (!anchor) return;
    const page = legalPageForPath(anchor.getAttribute('href') || '');
    if (!page) return;
    event.preventDefault();
    setSignupLegalModal({ visible: true, page });
  }

  function updateLandingDraft(patch) {
    setLandingAccountDraft((current) => {
      const next = { ...current, ...patch };
      next.phoneE164 = buildPhoneE164(next.phoneCountryCode || '+254', next.phoneNumber || '');
      return next;
    });
  }

  function cleanLandingDraft() {
    return {
      ...landingAccountDraft,
      phoneCountryCode: normaliseCountryCode(landingAccountDraft.phoneCountryCode || '+254') || '+254',
      phoneNumber: String(landingAccountDraft.phoneNumber || '').trim(),
      phoneE164: buildPhoneE164(landingAccountDraft.phoneCountryCode || '+254', landingAccountDraft.phoneNumber || ''),
      email: String(landingAccountDraft.email || '').trim().toLowerCase(),
      displayName: String(landingAccountDraft.displayName || '').trim(),
      accountName: String(landingAccountDraft.accountName || 'My Private Vault').trim(),
      tenantName: String(landingAccountDraft.accountName || 'My Private Vault').trim(),
      planCode: landingAccountDraft.planCode || 'personal',
      legalAccepted: Boolean(landingAccountDraft.legalAccepted),
      legalVersion: LEGAL_VERSION
    };
  }

  function validateLandingDraft(draft) {
    if (!draft.displayName) return 'Please enter your name.';
    if (!draft.email || !draft.email.includes('@')) return 'Please enter a valid email address for account verification.';
    if (!draft.phoneE164) return 'Please enter a mobile number with country code.';
    if (!draft.accountName) return 'Please enter an account or vault name.';
    if (!draft.planCode) return 'Please choose a subscription plan.';
    if (!draft.legalAccepted) return 'Please read and agree to the Terms of Service and Privacy Policy before continuing.';
    return '';
  }

  async function isolateExistingCustomerSessionForNewOnboarding() {
    try {
      // First refresh CSRF for an already-verified account, then deliberately end
      // that account session before a different tenant is onboarded in this tab.
      const statusResponse = await fetch('/.netlify/functions/session-status', { method: 'GET', credentials: 'same-origin' });
      const status = await statusResponse.json().catch(() => ({}));
      if (status?.csrfToken) sessionStorage.setItem('mp_customer_csrf', status.csrfToken);
      if (status?.authenticated) {
        const ended = await postJson('/.netlify/functions/session-status', { action: 'logout' });
        if (!ended.ok) throw new Error(ended.message || 'The previous account session could not be ended safely.');
      }
      sessionStorage.removeItem('mp_customer_csrf');
      setCustomerSession({ checked: true, authenticated: false, cloudAccess: false, accessCode: 'ONBOARDING_ISOLATED', tenantId: '', userId: '', message: 'New-account onboarding is isolated from any previous customer session.' });
      return true;
    } catch (error) {
      throw new Error(error.message || 'Password-Encrypt could not safely isolate this browser from the previous account session.');
    }
  }

  async function prepareLandingOnboarding() {
    const draft = cleanLandingDraft();
    const validationMessage = validateLandingDraft(draft);
    if (validationMessage) {
      showMessage(validationMessage, 'warning');
      setLandingOnboardingStep(validationMessage.includes('plan') ? 2 : 1);
      return;
    }
    setLandingSignup((current) => ({ ...current, status: 'preparing', message: 'Preparing your secure account...' }));
    try {
      await isolateExistingCustomerSessionForNewOnboarding();
      const result = await postJson('/.netlify/functions/bootstrap-admin', draft);
      if (!result.ok) throw new Error(result.message || 'Account setup could not continue.');
      const nextAccount = {
        ...bootstrap,
        ...draft,
        tenantId: result.tenantId || '',
        userId: result.userId || '',
        accountName: result.accountName || draft.accountName,
        tenantName: result.accountName || draft.accountName,
        planCode: result.planCode || draft.planCode,
        planStatus: result.planStatus || 'signup_pending',
        accountStatus: result.accountStatus || 'pending_verification',
        tenantRole: result.tenantRole || 'primary_owner',
        trialStartedAt: result.trialStartedAt || '',
        trialEndsAt: result.trialEndsAt || '',
        accountVerified: false,
        otpStatus: 'Contact verification required',
        onboardingStatus: result.existingAccount ? 'existing_account_verification' : 'new_account_verification'
      };
      setBootstrap(nextAccount);
      setLandingAccountDraft((current) => ({ ...current, ...draft, planCode: nextAccount.planCode }));
      setLandingSignup({
        status: 'ready-for-otp',
        message: result.message || 'Use email verification to continue.',
        existingAccount: Boolean(result.existingAccount),
        tenantId: result.tenantId || '',
        userId: result.userId || '',
        planName: result.planName || planDisplayName(result.planCode || draft.planCode),
        trialDays: Number(result.trialDays || 0),
        trialStartedAt: result.trialStartedAt || '',
        trialEndsAt: result.trialEndsAt || '',
        welcomeEmailSent: false
      });
      setLandingOtp({ status: 'idle', channel: 'email', challengeId: '', input: '', message: '', testCode: '', expiresAt: '', emailSendCount: 0, smsFallbackEligible: false });
      setLandingOnboardingStep(3);
    } catch (error) {
      setLandingSignup((current) => ({ ...current, status: 'error', message: error.message || 'Account setup could not continue.' }));
      showMessage(error.message || 'Account setup could not continue.', 'error');
    }
  }

  function chooseLandingOtpChannel(nextChannel) {
    setLandingOtp((current) => {
      const channel = nextChannel === 'sms' && current.smsFallbackEligible ? 'sms' : 'email';
      return {
        status: 'idle',
        channel,
        challengeId: '',
        input: '',
        message: '',
        testCode: '',
        expiresAt: '',
        emailSendCount: Number(current.emailSendCount || 0),
        smsFallbackEligible: Boolean(current.smsFallbackEligible)
      };
    });
  }

  async function sendLandingOnboardingOtp() {
    const channel = landingOtp.channel === 'sms' && landingOtp.smsFallbackEligible ? 'sms' : 'email';
    const email = String(landingAccountDraft.email || '').trim().toLowerCase();
    const phoneE164 = landingAccountDraft.phoneE164 || buildPhoneE164(landingAccountDraft.phoneCountryCode, landingAccountDraft.phoneNumber);
    if (channel === 'email' && !email) return;
    if (channel === 'sms' && !phoneE164) return;
    setLandingOtp((current) => ({ ...current, status: 'sending', message: `Sending your ${channel === 'sms' ? 'SMS' : 'email'} verification code...` }));
    try {
      const result = channel === 'sms'
        ? await postJson('/.netlify/functions/request-sms-otp', {
            phoneCountryCode: landingAccountDraft.phoneCountryCode,
            phoneNumber: landingAccountDraft.phoneNumber,
            phoneE164,
            purpose: 'production_onboarding'
          })
        : await postJson('/.netlify/functions/request-email-otp-test', { email, purpose: 'production_onboarding' });
      const nextEmailSendCount = channel === 'email'
        ? Number(result.onboardingEmailSendCount ?? landingOtp.emailSendCount ?? 0)
        : Number(landingOtp.emailSendCount || 0);
      const nextSmsFallbackEligible = channel === 'email'
        ? Boolean(result.smsFallbackEligible)
        : Boolean(landingOtp.smsFallbackEligible);

      if (!result.ok) {
        setLandingOtp((current) => {
          const smsWindowExpired = channel === 'sms' && result.code === 'SMS_FALLBACK_NOT_AVAILABLE';
          return {
            ...current,
            status: 'error',
            channel: smsWindowExpired ? 'email' : channel,
            challengeId: smsWindowExpired ? '' : current.challengeId,
            message: result.message || `The ${channel === 'sms' ? 'SMS' : 'email'} code could not be sent.`,
            emailSendCount: channel === 'email' ? Number(result.onboardingEmailSendCount ?? current.emailSendCount ?? 0) : Number(current.emailSendCount || 0),
            smsFallbackEligible: smsWindowExpired
              ? false
              : (channel === 'email' ? Boolean(result.smsFallbackEligible || current.smsFallbackEligible) : Boolean(current.smsFallbackEligible))
          };
        });
        return;
      }
      setLandingOtp({
        status: 'sent',
        channel,
        challengeId: result.challengeId || '',
        input: '',
        message: result.message || `Enter the code sent to your ${channel === 'sms' ? 'mobile number' : 'email'}.`,
        testCode: result.testOtpCode || '',
        expiresAt: result.expiresAt || '',
        emailSendCount: nextEmailSendCount,
        smsFallbackEligible: nextSmsFallbackEligible
      });
    } catch (error) {
      setLandingOtp((current) => ({ ...current, status: 'error', message: error.message || `The ${channel === 'sms' ? 'SMS' : 'email'} code could not be sent.` }));
    }
  }


  async function verifyLandingOnboardingOtp() {
    const code = String(landingOtp.input || '').replace(/\D/g, '');
    if (!landingOtp.challengeId) {
      setLandingOtp((current) => ({ ...current, status: 'error', message: `Request a ${current.channel === 'sms' ? 'SMS' : 'email'} code first.` }));
      return;
    }
    if (code.length !== 6) {
      setLandingOtp((current) => ({ ...current, status: 'error', message: 'Enter the six-digit code.' }));
      return;
    }
    setLandingOtp((current) => ({ ...current, status: 'verifying', message: 'Verifying your account...' }));
    try {
      const result = await postJson('/.netlify/functions/verify-otp-test', { challengeId: landingOtp.challengeId, code, ...accountDeviceMetadata() });
      if (!result.ok) throw new Error(result.message || 'The code could not be verified.');
      const nextAccount = {
        ...bootstrap,
        tenantId: result.tenantId || bootstrap.tenantId,
        userId: result.userId || bootstrap.userId,
        accountName: result.account?.accountName || bootstrap.accountName,
        tenantName: result.account?.accountName || bootstrap.tenantName,
        planCode: result.account?.planCode || bootstrap.planCode,
        planName: result.account?.planName || planDisplayName(result.account?.planCode || bootstrap.planCode),
        planStatus: result.account?.planStatus || bootstrap.planStatus,
        accountStatus: result.account?.accountStatus || bootstrap.accountStatus,
        tenantRole: result.account?.tenantRole || bootstrap.tenantRole,
        trialDays: Number(result.account?.trialDays || 0),
        trialStartedAt: result.account?.trialStartedAt || '',
        trialEndsAt: result.account?.trialEndsAt || '',
        onboardingCompletedAt: result.onboardingCompleted ? new Date().toISOString() : bootstrap.onboardingCompletedAt || '',
        accountVerified: true,
        otpStatus: 'Device verified',
        onboardingStatus: 'complete'
      };
      setBootstrap(nextAccount);
      if (result.entitlements) updateEntitlements(result.entitlements);
      setCustomerSession({ checked: true, authenticated: true, cloudAccess: result.cloudAccess !== false, accessCode: result.accessCode || '', tenantId: result.tenantId || '', userId: result.userId || '', message: result.message || 'This device is verified.', entitlements: result.entitlements || entitlements });
      savePendingOnboardingAccount({ ...nextAccount, tenantId: result.tenantId || nextAccount.tenantId, userId: result.userId || nextAccount.userId });
      onboardingSessionIsolationRef.current = true;
      setOnboardingSecurityWarning('');
      setLandingSignup((current) => ({
        ...current,
        status: 'complete',
        message: result.message || 'Your account is ready.',
        planName: result.account?.planName || current.planName || planDisplayName(nextAccount.planCode),
        trialDays: Number(result.account?.trialDays || current.trialDays || 0),
        trialStartedAt: result.account?.trialStartedAt || current.trialStartedAt || '',
        trialEndsAt: result.account?.trialEndsAt || current.trialEndsAt || '',
        welcomeEmailSent: Boolean(result.welcomeEmailSent)
      }));
      setLandingOtp((current) => ({ ...current, status: 'verified', message: result.message || 'Account verified.' }));
      setLandingOnboardingStep(4);
    } catch (error) {
      setLandingOtp((current) => ({ ...current, status: 'error', message: error.message || 'The code could not be verified.' }));
    }
  }

  function finishLandingOnboarding() {
    const target = landingSignup.existingAccount ? '/vault?entry=existing' : '/vault?entry=onboarding';
    if (landingSignup.existingAccount) {
      onboardingSessionIsolationRef.current = false;
      clearPendingOnboardingAccount();
    } else {
      savePendingOnboardingAccount({ ...bootstrap, tenantId: landingSignup.tenantId || bootstrap.tenantId, userId: landingSignup.userId || bootstrap.userId });
      onboardingSessionIsolationRef.current = true;
    }
    if (!landingSignup.existingAccount) {
      setOnboardingVaultDraft({
        email: bootstrap.email || landingAccountDraft.email || '',
        phoneCountryCode: bootstrap.phoneCountryCode || landingAccountDraft.phoneCountryCode || '+254',
        phoneCountryIso: bootstrap.phoneCountryIso || landingAccountDraft.phoneCountryIso || 'ke',
        phoneNumber: bootstrap.phoneNumber || landingAccountDraft.phoneNumber || ''
      });
    }
    setOnboardingSecretFieldsArmed({ master: false, confirm: false });
    setMessage('');
    setToasts([]);
    // Change the SPA route before closing the account-setup popup so React's next
    // render goes directly to vault setup instead of briefly revealing the landing page.
    window.history.replaceState({ onboarding: true }, '', target);
    setIsCreateAccountPopupOpen(false);
  }


  async function waitForPasswordEncryptInstallPrompt(timeoutMs = 4500) {
    const existing = installPromptRef.current || capturedPasswordEncryptInstallPrompt || window.__passwordEncryptInstallPrompt || null;
    if (existing) return existing;
    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.ready.catch(() => null);
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (event = null) => {
        if (settled) return;
        settled = true;
        window.removeEventListener('beforeinstallprompt', onPrompt);
        window.clearTimeout(timer);
        resolve(event || installPromptRef.current || capturedPasswordEncryptInstallPrompt || window.__passwordEncryptInstallPrompt || null);
      };
      const onPrompt = (event) => {
        event.preventDefault();
        capturedPasswordEncryptInstallPrompt = event;
        window.__passwordEncryptInstallPrompt = event;
        installPromptRef.current = event;
        setInstallPromptReady(true);
        finish(event);
      };
      const timer = window.setTimeout(() => finish(null), timeoutMs);
      window.addEventListener('beforeinstallprompt', onPrompt, { once: true });
    });
  }

  async function installPasswordEncryptApp() {
    if (isPasswordEncryptInstalled()) {
      setInstallStatus('installed');
      setInstallMessage('Password-Encrypt is already installed on this device.');
      return;
    }
    setInstallStatus('prompting');
    setInstallMessage('Preparing the Password-Encrypt installation prompt...');
    const promptEvent = await waitForPasswordEncryptInstallPrompt();
    if (!promptEvent) {
      setInstallStatus('manual');
      const ua = navigator.userAgent || '';
      const chromiumDesktop = /Chrome\/|Edg\//i.test(ua) && !/Android|iPhone|iPad|Mobile/i.test(ua);
      setInstallMessage(chromiumDesktop
        ? 'Chrome has not made the native install prompt available yet. Keep this page open briefly and try Install again, or use the install icon in the address bar / browser menu.'
        : passwordEncryptInstallInstructions());
      return;
    }
    setInstallMessage('Your browser is opening the Password-Encrypt installation prompt...');
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      capturedPasswordEncryptInstallPrompt = null;
      window.__passwordEncryptInstallPrompt = null;
      installPromptRef.current = null;
      setInstallPromptReady(false);
      if (choice?.outcome === 'accepted') {
        setInstallStatus('installed');
        setInstallMessage('Installation accepted. Password-Encrypt can now be opened from your device like an app.');
      } else {
        setInstallStatus('declined');
        setInstallMessage('Installation was not completed. You can choose Install again when Chrome offers the prompt, or use the browser install icon.');
      }
    } catch {
      setInstallStatus('manual');
      setInstallMessage('The native install prompt was not available. Use the browser install icon/menu, or try Install again after a few seconds.');
    }
  }

  function finishInstallOnboarding() {
    setShowInstallOnboarding(false);
    window.history.replaceState({}, '', '/vault');
    setActivePage('home');
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  }

  function openVaultSection(cat) {
    setCategory(cat);
    setActivePage('home');
    setIsFolderListPopupOpen(false);
  }


  function openAddItem() {
    const itemLimit = Number(entitlements?.limits?.itemLimit || 0);
    const currentItemCount = getVisibleVaultItems(items).length;
    if (itemLimit > 0 && currentItemCount >= itemLimit) {
      showEntitlementUpgrade('items', `This plan includes up to ${itemLimit} vault item${itemLimit === 1 ? '' : 's'}. Delete an item or review your plan before adding another.`);
      return;
    }
    const preferredCategory = category && !['All', FAVOURITES_VIEW].includes(category) ? category : 'Passwords';
    setEditingItemId('');
    setForm(emptyForm(preferredCategory));
    setShowFormSecret(false);
    setItemCredentialFieldsArmed({ username: false, password: false });
    setIsItemPopupOpen(true);
  }

  function closeFolderPopup() {
    setIsFolderPopupOpen(false);
    setNewFolderName('');
    setIsSavingFolder(false);
  }

  async function createCustomFolder(event) {
    event.preventDefault();
    if (isSavingFolder) return;
    const folderName = normaliseFolderName(newFolderName);
    if (!folderName) return showMessage('Enter a folder name first.', 'warning');
    const allFolders = [...BUILT_IN_CATEGORIES, ...customFolders];
    if (folderExists(folderName, allFolders)) {
      showMessage('That folder already exists.', 'warning');
      return;
    }
    setIsSavingFolder(true);
    try {
      const currentOrder = folderChips.map((folder) => folder.name).filter((name) => name !== 'All');
      const nextOrder = currentOrder.includes(folderName) ? currentOrder : [...currentOrder, folderName];
      const next = upsertFolderMetaItem(items, [...customFolders, folderName], nextOrder);
      await saveItems(next, { autoSync: true, silentAutoSync: true });
      setCategory(folderName);
      closeFolderPopup();
      showMessage('Folder created successfully.', 'success');
    } catch (error) {
      showMessage('Folder could not be created. Please try again.', 'error');
    } finally {
      setIsSavingFolder(false);
    }
  }

  async function persistFolderOrder(nextOrder) {
    const cleanOrder = uniqueFolderList(nextOrder).filter((name) => name !== 'All');
    const next = upsertFolderMetaItem(items, customFolders, cleanOrder, favouriteFolderNames);
    await saveItems(next, { autoSync: true, silentAutoSync: true });
  }

  async function reorderFolder(sourceName, targetName) {
    if (!sourceName || !targetName || sourceName === targetName || sourceName === 'All' || targetName === 'All') return;
    const currentOrder = folderChips.map((folder) => folder.name).filter((name) => name !== 'All');
    const withoutSource = currentOrder.filter((name) => name !== sourceName);
    const targetIndex = withoutSource.indexOf(targetName);
    if (targetIndex < 0) return;
    const nextOrder = [...withoutSource.slice(0, targetIndex), sourceName, ...withoutSource.slice(targetIndex)];
    await persistFolderOrder(nextOrder);
  }

  async function toggleFolderFavourite(folderName) {
    if (!folderName) return;
    const nextFavourites = favouriteFolderNames.includes(folderName)
      ? favouriteFolderNames.filter((name) => name !== folderName)
      : [...favouriteFolderNames, folderName];
    const currentOrder = folderChips.map((folder) => folder.name).filter((name) => name !== 'All');
    const next = upsertFolderMetaItem(items, customFolders, currentOrder, nextFavourites);
    await saveItems(next, { autoSync: true, silentAutoSync: true });
  }

  function openFolderManager(folder) {
    if (!folder?.custom) return;
    setIsFolderListPopupOpen(false);
    setFolderManager({ visible: true, originalName: folder.name, name: folder.name, itemCount: Number(folder.count || 0), busy: false, confirmDelete: false, message: '' });
  }

  function closeFolderManager() {
    setFolderManager({ visible: false, originalName: '', name: '', itemCount: 0, busy: false, confirmDelete: false, message: '' });
  }

  async function renameCustomFolder(event) {
    event.preventDefault();
    if (folderManager.busy) return;
    const originalName = normaliseFolderName(folderManager.originalName);
    const nextName = normaliseFolderName(folderManager.name);
    if (!originalName || !customFolders.some((folder) => folder.toLowerCase() === originalName.toLowerCase())) {
      setFolderManager((current) => ({ ...current, message: 'This custom folder could not be found.' }));
      return;
    }
    if (!nextName) {
      setFolderManager((current) => ({ ...current, message: 'Enter a folder name first.' }));
      return;
    }
    const otherFolders = [...BUILT_IN_CATEGORIES, ...customFolders.filter((folder) => folder.toLowerCase() !== originalName.toLowerCase())];
    if (folderExists(nextName, otherFolders)) {
      setFolderManager((current) => ({ ...current, message: 'That folder name is already in use.' }));
      return;
    }
    if (nextName === originalName) {
      closeFolderManager();
      return;
    }

    setFolderManager((current) => ({ ...current, busy: true, message: '' }));
    try {
      const now = new Date().toISOString();
      const renamedItems = items.map((item) => !isInternalMetaItem(item) && String(item.category || '').toLowerCase() === originalName.toLowerCase()
        ? { ...item, category: nextName, payload: isEmergencyImportedItem(item) ? { ...(item.payload || {}), emergencyImport: { ...(item.payload?.emergencyImport || {}), folderName: nextName } } : item.payload, updatedAt: now }
        : item);
      const nextFolders = customFolders.map((folder) => folder.toLowerCase() === originalName.toLowerCase() ? nextName : folder);
      const nextOrder = savedFolderOrder.map((folder) => folder.toLowerCase() === originalName.toLowerCase() ? nextName : folder);
      const nextFavourites = favouriteFolderNames.map((folder) => folder.toLowerCase() === originalName.toLowerCase() ? nextName : folder);
      let next = upsertFolderMetaItem(renamedItems, nextFolders, nextOrder, nextFavourites);
      await saveItems(next, { autoSync: true, silentAutoSync: true });
      if (String(category || '').toLowerCase() === originalName.toLowerCase()) setCategory(nextName);
      closeFolderManager();
      showMessage('Folder renamed successfully.', 'success');
    } catch (error) {
      setFolderManager((current) => ({ ...current, busy: false, message: 'The folder could not be renamed. Please try again.' }));
    }
  }

  async function deleteCustomFolder() {
    if (folderManager.busy) return;
    if (!folderManager.confirmDelete) {
      setFolderManager((current) => ({ ...current, confirmDelete: true, message: '' }));
      return;
    }

    const originalName = normaliseFolderName(folderManager.originalName);
    setFolderManager((current) => ({ ...current, busy: true, message: '' }));
    try {
      const now = new Date().toISOString();
      let movedItemCount = 0;
      const reassignedItems = items.map((item) => {
        if (!isInternalMetaItem(item) && String(item.category || '').toLowerCase() === originalName.toLowerCase()) {
          movedItemCount += 1;
          return { ...item, category: 'Passwords', payload: isEmergencyImportedItem(item) ? { ...(item.payload || {}), emergencyImport: { ...(item.payload?.emergencyImport || {}), folderName: 'Passwords', detached: true } } : item.payload, updatedAt: now };
        }
        return item;
      });
      const nextFolders = customFolders.filter((folder) => folder.toLowerCase() !== originalName.toLowerCase());
      const nextOrder = savedFolderOrder.filter((folder) => folder.toLowerCase() !== originalName.toLowerCase());
      const nextFavourites = favouriteFolderNames.filter((folder) => folder.toLowerCase() !== originalName.toLowerCase());
      let next = upsertFolderMetaItem(reassignedItems, nextFolders, nextOrder, nextFavourites);
      await saveItems(next, { autoSync: true, silentAutoSync: true });
      if (String(category || '').toLowerCase() === originalName.toLowerCase()) setCategory('Passwords');
      closeFolderManager();
      showMessage(movedItemCount ? `Folder deleted. ${movedItemCount} item${movedItemCount === 1 ? '' : 's'} moved safely to Passwords.` : 'Folder deleted.', 'success');
    } catch (error) {
      setFolderManager((current) => ({ ...current, busy: false, message: 'The folder could not be deleted. Please try again.' }));
    }
  }


  function ensureEmergencyAccessEntitled() {
    if (featureIncluded('emergencyAccess')) return true;
    showEntitlementUpgrade('emergencyAccess', 'Emergency Access is not included in the current plan. Upgrade or ask Admin for an override to configure a trusted contact.');
    return false;
  }

  async function saveEmergencyAccessPlan(event, successMessage = 'Trusted Person Access details saved securely inside your vault.', section = 'trusted_person') {
    event?.preventDefault?.();
    if (!ensureEmergencyAccessEntitled()) return;
    const now = new Date().toISOString();
    const savedBeforeEdit = getEmergencyAccessPlan(items);
    const cleanPlan = {
      ...emergencyDraft,
      contactName: String(emergencyDraft.contactName || '').trim(),
      relationship: String(emergencyDraft.relationship || '').trim(),
      contactEmail: String(emergencyDraft.contactEmail || '').trim().toLowerCase(),
      contactPhone: String(emergencyDraft.contactPhone || '').trim(),
      instructions: String(emergencyDraft.instructions || '').trim(),
      trustedPersonUpdatedAt: section === 'trusted_person' ? now : String(emergencyDraft.trustedPersonUpdatedAt || savedBeforeEdit.trustedPersonUpdatedAt || ''),
      emergencyPackageEnabled: emergencyDraft.emergencyPackageEnabled !== false,
      emergencyPackageTitle: String(emergencyDraft.emergencyPackageTitle || 'Emergency Info package').trim(),
      emergencyPackageMessage: String(emergencyDraft.emergencyPackageMessage || '').trim(),
      emergencyPackageContacts: String(emergencyDraft.emergencyPackageContacts || '').trim(),
      emergencyPackageDocuments: String(emergencyDraft.emergencyPackageDocuments || '').trim(),
      emergencyPackageChecklist: String(emergencyDraft.emergencyPackageChecklist || '').trim(),
      emergencyPackageUpdatedAt: section === 'package' ? now : String(emergencyDraft.emergencyPackageUpdatedAt || savedBeforeEdit.emergencyPackageUpdatedAt || '')
    };
    if (section === 'package') {
      const trustedPersonWasSaved = Boolean(
        String(savedBeforeEdit.contactName || '').trim()
        && String(savedBeforeEdit.contactEmail || '').trim().includes('@')
        && (savedBeforeEdit.trustedPersonUpdatedAt || savedBeforeEdit.invitationId || savedBeforeEdit.updatedAt)
      );
      if (!trustedPersonWasSaved) return showMessage('Complete and save Step 1 — Trusted person details first.', 'warning');
    }
    if (!cleanPlan.contactName) return showMessage("Add the trusted person's name first.", 'warning');
    if (!cleanPlan.contactEmail && !cleanPlan.contactPhone) return showMessage('Add at least one contact detail for your trusted person.', 'warning');
    if (cleanPlan.contactEmail && !cleanPlan.contactEmail.includes('@')) return showMessage("The trusted person's email address does not look valid.", 'warning');
    try {
      setEmergencySaveState('saving');
      const next = upsertEmergencyAccessMetaItem(items, cleanPlan);
      await saveItems(next, { autoSync: true, silentAutoSync: true });
      const saved = getEmergencyAccessPlan(next);
      setEmergencyDraft(saved);
      if (saved.invitationId && saved.invitationUrl) {
        try { await saveEmergencyReleasePackageForPlan(saved, next, { refreshReason: section === 'package' ? 'manual_package_save' : 'trusted_person_details_save' }); }
        catch (packageError) { showMessage(packageError.message || 'Plan saved, but the emergency release package could not be refreshed.', 'warning'); return; }
      }
      const stageId = section === 'trusted_person' ? 'emergency-stage-1' : section === 'package' ? 'emergency-stage-2' : '';
      const nextStageId = section === 'trusted_person' ? 'emergency-stage-2' : section === 'package' ? 'emergency-stage-3' : '';
      if (stageId) {
        const stagePanel = document.getElementById(stageId);
        if (stagePanel?.open) stagePanel.open = false;
        window.requestAnimationFrame(() => {
          const nextStage = nextStageId ? document.getElementById(nextStageId) : null;
          nextStage?.scrollIntoView?.({ behavior: 'auto', block: 'nearest' });
        });
      }
      showMessage(successMessage, 'success');
    } catch (error) {
      showMessage('Emergency access plan could not be saved. Please try again.', 'error');
    } finally {
      setEmergencySaveState('idle');
    }
  }


  async function prepareEmergencyReleasedDocuments(planToSave, currentItems, inviteToken) {
    const inventory = await postJson('/.netlify/functions/emergency-access-document', {
      action: 'inventory',
      invitationId: planToSave.invitationId
    });
    if (!inventory.ok) throw new Error(inventory.message || 'Emergency Access file status could not be checked.');
    if (inventory.frozen) {
      const error = new Error('The Emergency Package has already been released and is now frozen as the release snapshot.');
      error.code = 'EMERGENCY_PACKAGE_FROZEN';
      throw error;
    }

    const existingBySource = new Map((Array.isArray(inventory.documents) ? inventory.documents : []).map((document) => [String(document.source_document_id || ''), document]));
    const fullAccess = String(planToSave?.accessScope || '') === 'Full vault access';
    const fileItems = fullAccess
      ? getVisibleVaultItems(currentItems).filter((item) => [DOCUMENTS_CATEGORY, PICTURES_CATEGORY].includes(item.category) && item?.payload?.file)
      : [];
    const prepared = [];
    for (const item of fileItems) {
      const file = item.payload.file;
      const sourceCategory = item.category === PICTURES_CATEGORY ? PICTURES_CATEGORY : DOCUMENTS_CATEGORY;
      const sourceFingerprint = await buildEmergencyDocumentSourceFingerprint(item);
      const existing = existingBySource.get(String(item.id || ''));
      const alreadyCurrent = existing?.metadata?.source_fingerprint === sourceFingerprint
        && existing?.metadata?.encryption_scope === 'emergency_import_code_v1'
        && String(existing?.metadata?.source_category || DOCUMENTS_CATEGORY) === sourceCategory
        && existing?.metadata?.upload_complete === true;
      if (!alreadyCurrent) {
        const dataUrl = await loadStoredDocumentDataUrl(item);
        const encrypted = await encryptEmergencyDocumentData(dataUrl, inviteToken);
        const chunks = [];
        for (let index = 0; index < encrypted.encryptedBlob.length; index += ENCRYPTED_FILE_CHUNK_CHARACTERS) {
          chunks.push(encrypted.encryptedBlob.slice(index, index + ENCRYPTED_FILE_CHUNK_CHARACTERS));
        }
        const init = await postJson('/.netlify/functions/emergency-access-document', {
          action: 'init_chunked',
          invitationId: planToSave.invitationId,
          sourceDocumentId: item.id,
          sourceCategory,
          sourceFingerprint,
          sourceUpdatedAt: item.updatedAt || '',
          fileName: file.name || `${item.title || (sourceCategory === PICTURES_CATEGORY ? 'picture' : 'document')}.${file.extension || (sourceCategory === PICTURES_CATEGORY ? 'jpg' : 'txt')}`,
          fileType: file.type || 'application/octet-stream',
          fileExtension: file.extension || getFileExtension(file.name || ''),
          fileSize: Number(file.size || 0),
          chunkCount: chunks.length,
          localSalt: encrypted.localSalt,
          localIv: encrypted.localIv,
          encryptionScope: encrypted.encryptionScope || 'emergency_import_code_v1'
        });
        if (!init.ok) {
          const error = new Error(init.message || `The ${sourceCategory === PICTURES_CATEGORY ? 'picture' : 'document'} ${file.name || item.title || ''} could not be prepared for Emergency Access.`);
          error.code = init.code || '';
          throw error;
        }
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
          const chunkResult = await postJson('/.netlify/functions/emergency-access-document', {
            action: 'upload_chunk',
            invitationId: planToSave.invitationId,
            sourceDocumentId: item.id,
            chunkIndex,
            chunkCount: chunks.length,
            chunkData: chunks[chunkIndex]
          });
          if (!chunkResult.ok) throw new Error(chunkResult.message || 'An Emergency Package file upload stopped before it completed.');
        }
        const finalized = await postJson('/.netlify/functions/emergency-access-document', {
          action: 'finalize_chunked',
          invitationId: planToSave.invitationId,
          sourceDocumentId: item.id
        });
        if (!finalized.ok) throw new Error(finalized.message || 'An Emergency Package file could not be finalised.');
      }
      prepared.push({
        sourceDocumentId: item.id,
        sourceCategory,
        title: item.title || file.name || (sourceCategory === PICTURES_CATEGORY ? 'Picture' : 'Document'),
        fileName: file.name || item.title || (sourceCategory === PICTURES_CATEGORY ? 'Picture' : 'Document'),
        fileType: file.type || 'application/octet-stream',
        fileExtension: file.extension || getFileExtension(file.name || ''),
        fileSize: Number(file.size || 0)
      });
    }
    const pruneResult = await postJson('/.netlify/functions/emergency-access-document', {
      action: 'prune',
      invitationId: planToSave.invitationId,
      keepSourceDocumentIds: prepared.map((documentMeta) => documentMeta.sourceDocumentId)
    });
    if (!pruneResult.ok) {
      const error = new Error(pruneResult.message || 'Old Emergency Access file copies could not be cleaned up.');
      error.code = pruneResult.code || '';
      throw error;
    }
    return prepared;
  }

  async function saveEmergencyReleasePackageForPlan(planToSave = emergencyDraft, currentItems = items, options = {}) {
    if (!ensureEmergencyAccessEntitled()) return { ok: false, code: 'PLAN_FEATURE_REQUIRED' };
    const inviteUrl = planToSave.invitationUrl || '';
    const inviteToken = tokenFromInviteUrl(inviteUrl);
    if (!planToSave.invitationId || !inviteToken) return { ok: false, skipped: true, message: 'Invite link is not ready yet.' };
    if (!bootstrap.tenantId || !bootstrap.userId) return { ok: false, skipped: true, message: 'Account details are missing.' };
    if (emergencyPackageFrozenInvitationRef.current === planToSave.invitationId) {
      setEmergencyPackageFreshness({ state: 'frozen', lastRefreshedAt: emergencyPackageFreshness.lastRefreshedAt || '', message: 'Released package snapshot is frozen.' });
      return { ok: false, skipped: true, code: 'EMERGENCY_PACKAGE_FROZEN' };
    }
    const sourceFingerprint = await buildEmergencyPackageSourceFingerprint(planToSave, currentItems);
    const importCode = await deriveEmergencyImportCode(inviteToken);
    const importCodeHash = await emergencyImportCodeHash(importCode);
    const releasedDocuments = await prepareEmergencyReleasedDocuments(planToSave, currentItems, inviteToken);
    const releasePackage = buildEmergencyReleasePackage(planToSave, currentItems, bootstrap, releasedDocuments);
    const envelope = await encryptEmergencyReleasePackage(releasePackage, inviteToken);
    const result = await postJson('/.netlify/functions/emergency-access-invite', {
      action: 'save_package',
      invitationId: planToSave.invitationId,
      importCodeHash,
      sourceFingerprint,
      refreshReason: options.refreshReason || 'manual_package_save',
      packageEnvelope: envelope,
      packageSummary: {
        releaseScope: releasePackage.releaseScope,
        fullVaultAccess: releasePackage.fullVaultAccess,
        itemCount: releasePackage.itemCount,
        documentCount: releasePackage.documentCount || 0,
        preparedAt: releasePackage.preparedAt,
        title: releasePackage.title
      }
    });
    if (!result.ok) {
      if (result.code === 'EMERGENCY_PACKAGE_FROZEN') {
        emergencyPackageFrozenInvitationRef.current = planToSave.invitationId;
        setEmergencyPackageFreshness({ state: 'frozen', lastRefreshedAt: result.packageSummary?.preparedAt || emergencyPackageFreshness.lastRefreshedAt || '', message: result.message || 'Released package snapshot is frozen.' });
        return result;
      }
      throw new Error(result.message || 'Emergency release package could not be saved.');
    }
    const refreshedAt = result.packageSavedAt || result.packageSummary?.preparedAt || releasePackage.preparedAt;
    setEmergencyPackageFreshness({
      state: 'current',
      lastRefreshedAt: refreshedAt,
      message: result.unchanged ? 'Prepared package is already current.' : 'Prepared package refreshed from the latest unlocked vault.'
    });
    if (Array.isArray(result.events)) setEmergencyFlowEvents(result.events);
    return result;
  }

  async function flushEmergencyPackageMaintenance() {
    if (emergencyPackageRefreshInFlightRef.current) return;
    const queued = emergencyPackageRefreshQueuedRef.current;
    emergencyPackageRefreshQueuedRef.current = null;
    if (!queued?.items) return;
    const plan = getEmergencyAccessPlan(queued.items);
    const requestStatus = String(plan?.requestStatus || '').toLowerCase();
    if (!plan?.invitationId || !plan?.invitationUrl || plan?.emergencyPackageEnabled === false) return;
    if (['release_ready', 'released'].includes(requestStatus) || emergencyPackageFrozenInvitationRef.current === plan.invitationId) {
      emergencyPackageFrozenInvitationRef.current = plan.invitationId;
      setEmergencyPackageFreshness((current) => ({ ...current, state: 'frozen', message: 'Released package snapshot is frozen and will not change.' }));
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setEmergencyPackageFreshness((current) => ({ ...current, state: 'pending', message: 'Latest vault changes will refresh the prepared package when this device is online and unlocked.' }));
      return;
    }
    if (!customerSession.authenticated || !masterPassword) {
      setEmergencyPackageFreshness((current) => ({ ...current, state: 'pending', message: 'Unlock and verify this device to refresh the prepared package.' }));
      return;
    }
    emergencyPackageRefreshInFlightRef.current = true;
    setEmergencyPackageFreshness((current) => ({ ...current, state: 'refreshing', message: 'Refreshing the prepared package from the latest unlocked vault...' }));
    try {
      await saveEmergencyReleasePackageForPlan(plan, queued.items, { refreshReason: queued.reason || 'automatic_vault_refresh' });
    } catch (error) {
      if (error?.code === 'EMERGENCY_PACKAGE_FROZEN') {
        emergencyPackageFrozenInvitationRef.current = plan.invitationId;
        setEmergencyPackageFreshness((current) => ({ ...current, state: 'frozen', message: 'Released package snapshot is frozen and will not change.' }));
      } else {
        setEmergencyPackageFreshness((current) => ({ ...current, state: 'pending', message: 'The vault is safe, but the prepared Emergency Package still needs to refresh. Password-Encrypt will retry while the vault is online and unlocked.' }));
      }
    } finally {
      emergencyPackageRefreshInFlightRef.current = false;
      if (emergencyPackageRefreshQueuedRef.current?.items) {
        window.clearTimeout(emergencyPackageRefreshTimerRef.current);
        emergencyPackageRefreshTimerRef.current = window.setTimeout(() => flushEmergencyPackageMaintenance(), 450);
      }
    }
  }

  function scheduleEmergencyPackageMaintenance(nextItems, reason = 'automatic_vault_refresh') {
    const plan = getEmergencyAccessPlan(nextItems);
    if (!plan?.invitationId || !plan?.invitationUrl || plan?.emergencyPackageEnabled === false) return;
    emergencyPackageRefreshQueuedRef.current = { items: nextItems, reason };
    window.clearTimeout(emergencyPackageRefreshTimerRef.current);
    emergencyPackageRefreshTimerRef.current = window.setTimeout(() => flushEmergencyPackageMaintenance(), 700);
  }


  async function sendEmergencyAccessInvite() {
    if (!ensureEmergencyAccessEntitled()) return { ok: false, code: 'PLAN_FEATURE_REQUIRED' };
    const cleanPlan = {
      ...emergencyDraft,
      contactName: String(emergencyDraft.contactName || '').trim(),
      relationship: String(emergencyDraft.relationship || '').trim(),
      contactEmail: String(emergencyDraft.contactEmail || '').trim().toLowerCase(),
      contactPhone: String(emergencyDraft.contactPhone || '').trim(),
      instructions: String(emergencyDraft.instructions || '').trim(),
      emergencyPackageEnabled: emergencyDraft.emergencyPackageEnabled !== false,
      emergencyPackageTitle: String(emergencyDraft.emergencyPackageTitle || 'Emergency Info package').trim(),
      emergencyPackageMessage: String(emergencyDraft.emergencyPackageMessage || '').trim(),
      emergencyPackageContacts: String(emergencyDraft.emergencyPackageContacts || '').trim(),
      emergencyPackageDocuments: String(emergencyDraft.emergencyPackageDocuments || '').trim(),
      emergencyPackageChecklist: String(emergencyDraft.emergencyPackageChecklist || '').trim(),
      trustedPersonUpdatedAt: String(emergencyDraft.trustedPersonUpdatedAt || ''),
      emergencyPackageUpdatedAt: String(emergencyDraft.emergencyPackageUpdatedAt || '')
    };
    const savedPlanForInvite = getEmergencyAccessPlan(items);
    const trustedPersonStepComplete = Boolean(
      String(savedPlanForInvite.contactName || '').trim()
      && String(savedPlanForInvite.contactEmail || '').trim().includes('@')
      && (savedPlanForInvite.trustedPersonUpdatedAt || savedPlanForInvite.invitationId || savedPlanForInvite.updatedAt)
    );
    const packageStepComplete = Boolean(
      savedPlanForInvite.emergencyPackageEnabled !== false
      && String(savedPlanForInvite.emergencyPackageTitle || '').trim()
      && String(savedPlanForInvite.accessScope || '').trim()
      && (savedPlanForInvite.emergencyPackageUpdatedAt || savedPlanForInvite.invitationId)
    );
    if (!trustedPersonStepComplete || !packageStepComplete) return showMessage('Complete and save Steps 1 and 2 before sending the invitation.', 'warning');
    if (!cleanPlan.contactName) return showMessage("Add the trusted person's name first.", 'warning');
    if (!cleanPlan.contactEmail || !cleanPlan.contactEmail.includes('@')) return showMessage("Add a valid email address for the trusted person before sending an invitation.", 'warning');
    if (!bootstrap.tenantId || !bootstrap.userId) {
      const accountCheck = await ensureAccountIdentity({ silent: true });
      if (!accountCheck.ok) return showMessage('Save your account details before sending an emergency invitation.', 'warning');
    }
    setEmergencyInviteState({ status: 'sending', message: 'Sending invitation...' });
    try {
      const account = { ...bootstrap };
      const result = await postJson('/.netlify/functions/emergency-access-invite', {
        action: 'send',
        ownerName: account.displayName || account.accountName || 'Password-Encrypt user',
        ownerEmail: account.email || '',
        ownerPhone: account.phoneE164 || buildPhoneE164(account.phoneCountryCode, account.phoneNumber) || '',
        contactName: cleanPlan.contactName,
        relationship: cleanPlan.relationship,
        contactEmail: cleanPlan.contactEmail,
        contactPhone: cleanPlan.contactPhone,
        waitingPeriod: cleanPlan.waitingPeriod,
        accessScope: cleanPlan.accessScope
      });
      if (!result.ok) throw new Error(result.message || 'The invitation could not be sent.');
      const savedPlan = {
        ...cleanPlan,
        invitationStatus: result.status || (result.emailSent ? 'sent' : 'pending'),
        invitationId: result.invitationId || cleanPlan.invitationId || '',
        invitationSentAt: result.sentAt || cleanPlan.invitationSentAt || new Date().toISOString(),
        invitationAcceptedAt: result.acceptedAt || cleanPlan.invitationAcceptedAt || '',
        invitationCancelledAt: '',
        invitationMessage: result.message || (result.emailSent ? 'Invitation sent.' : 'Invitation prepared. Email sending is not configured yet.'),
        invitationUrl: result.inviteUrl || result.acceptUrl || cleanPlan.invitationUrl || ''
      };
      const next = upsertEmergencyAccessMetaItem(items, savedPlan);
      await saveItems(next, { autoSync: true, silentAutoSync: true });
      const nextPlan = getEmergencyAccessPlan(next);
      try { await saveEmergencyReleasePackageForPlan(nextPlan, next, { refreshReason: 'invitation_created' }); }
      catch (packageError) {
        const packageNote = result.emailSent
          ? `Invitation email sent. ${packageError.message || 'The emergency release package could not be prepared yet.'}`
          : `${result.message || 'Invite link prepared.'} ${packageError.message || 'The emergency release package could not be prepared yet.'}`;
        setEmergencyDraft(nextPlan);
        setEmergencyInviteState({ status: 'warning', message: packageNote });
        showMessage(packageNote, 'warning');
        return;
      }
      setEmergencyDraft(nextPlan);
      setEmergencyFlowEvents(Array.isArray(result.events) ? result.events : emergencyFlowEvents);
      setEmergencyInviteState({ status: result.emailSent ? 'sent' : 'ready', message: result.message || nextPlan.invitationMessage });
      showMessage(result.message || 'Emergency access invitation and release package saved.', result.emailSent ? 'success' : 'warning');
    } catch (error) {
      const note = error.message || 'Emergency invitation could not be sent. Please try again.';
      setEmergencyInviteState({ status: 'error', message: note });
      showMessage(note, 'error');
    }
  }

  async function checkEmergencyInvitationStatus(options = {}) {
    const silent = Boolean(options?.silent);
    if (!ensureEmergencyAccessEntitled()) return { ok: false, code: 'PLAN_FEATURE_REQUIRED' };
    if (!emergencyDraft.invitationId) return showMessage('Send an invitation first.', 'warning');
    if (!silent) setEmergencyInviteState({ status: 'checking', message: 'Checking current stage...' });
    try {
      const result = await postJson('/.netlify/functions/emergency-access-invite', { action: 'status', invitationId: emergencyDraft.invitationId, contactEmail: emergencyDraft.contactEmail });
      if (!result.ok) throw new Error(result.message || 'Invitation status could not be checked.');
      const latestRequestStatus = String(result.request?.status || emergencyDraft.requestStatus || 'not_requested').toLowerCase();
      const statusHasActiveRequest = ['requested', 'waiting', 'owner_notified'].includes(latestRequestStatus) && !result.request?.cancelled_at && !result.request?.released_at;
      const latestInvitationStatus = statusHasActiveRequest && !['declined', 'cancelled'].includes(String(result.status || '').toLowerCase())
        ? 'accepted'
        : (result.status || emergencyDraft.invitationStatus);
      const checkedAt = new Date().toISOString();
      const savedPlan = {
        ...emergencyDraft,
        invitationId: result.invitationId || result.id || result.request?.invitation_id || emergencyDraft.invitationId,
        invitationStatus: latestInvitationStatus,
        invitationSentAt: result.sent_at || emergencyDraft.invitationSentAt,
        invitationAcceptedAt: result.accepted_at || emergencyDraft.invitationAcceptedAt,
        invitationCancelledAt: result.cancelled_at || emergencyDraft.invitationCancelledAt,
        invitationMessage: result.message || emergencyDraft.invitationMessage,
        invitationUrl: (latestInvitationStatus === 'accepted' ? (result.requestUrl || result.inviteUrl) : result.inviteUrl) || emergencyDraft.invitationUrl || '',
        requestStatus: latestRequestStatus,
        requestId: result.request?.id || emergencyDraft.requestId || '',
        requestRequestedAt: result.request?.requested_at || emergencyDraft.requestRequestedAt || '',
        requestWaitingEndsAt: result.request?.waiting_ends_at || emergencyDraft.requestWaitingEndsAt || '',
        requestMessage: result.request?.message || emergencyDraft.requestMessage || '',
        requestLastCheckedAt: checkedAt
      };
      const statusFields = [
        'invitationId', 'invitationStatus', 'invitationSentAt', 'invitationAcceptedAt', 'invitationCancelledAt',
        'invitationUrl', 'requestStatus', 'requestId', 'requestRequestedAt', 'requestWaitingEndsAt', 'requestMessage'
      ];
      const statusChanged = statusFields.some((key) => String(savedPlan[key] || '') !== String(emergencyDraft[key] || ''));
      if (statusChanged) {
        const next = upsertEmergencyAccessMetaItem(items, savedPlan);
        await saveItems(next, { autoSync: true, silentAutoSync: true });
        setEmergencyDraft(getEmergencyAccessPlan(next));
      }
      setEmergencyFlowEvents(Array.isArray(result.events) ? result.events : []);
      if (result.packageSummary?.preparedAt) {
        setEmergencyPackageFreshness({
          state: result.releaseReady ? 'frozen' : 'current',
          lastRefreshedAt: result.packageSummary.preparedAt,
          message: result.releaseReady ? 'Released package snapshot is frozen and will not change.' : 'Prepared package is current.'
        });
      }
      if (result.releaseReady) emergencyPackageFrozenInvitationRef.current = savedPlan.invitationId;
      if (!silent) {
        setEmergencyInviteState({ status: 'checked', message: result.request?.message || result.message || 'Current stage checked.' });
        showMessage(result.request?.message || result.message || 'Current stage checked.', result.request ? 'success' : 'info');
      }
      return { ...result, statusChanged, checkedAt };
    } catch (error) {
      const note = error.message || 'Invitation status could not be checked.';
      if (!silent) {
        setEmergencyInviteState({ status: 'error', message: note });
        showMessage(note, 'error');
      }
      return { ok: false, message: note };
    }
  }


  async function cancelEmergencyInvitation() {
    if (!ensureEmergencyAccessEntitled()) return { ok: false, code: 'PLAN_FEATURE_REQUIRED' };
    const savedPlan = {
      ...emergencyDraft,
      invitationStatus: 'cancelled',
      invitationCancelledAt: new Date().toISOString(),
      invitationMessage: 'Invitation cancelled.',
      invitationUrl: ''
    };
    try {
      if (savedPlan.invitationId) {
        await postJson('/.netlify/functions/emergency-access-invite', { action: 'cancel', invitationId: savedPlan.invitationId });
      }
      const next = upsertEmergencyAccessMetaItem(items, savedPlan);
      await saveItems(next, { autoSync: true, silentAutoSync: true });
      setEmergencyDraft(getEmergencyAccessPlan(next));
      setEmergencyInviteState({ status: 'cancelled', message: 'Invitation cancelled.' });
      showMessage('Emergency access invitation cancelled.', 'success');
    } catch (error) {
      showMessage('Invitation could not be cancelled. Please try again.', 'error');
    }
  }


  async function resendEmergencyAccessInvite() {
    if (!ensureEmergencyAccessEntitled()) return { ok: false, code: 'PLAN_FEATURE_REQUIRED' };
    if (!emergencyDraft.invitationId) return showMessage('Send an invitation first.', 'warning');
    setEmergencyInviteState({ status: 'resending', message: 'Resending invitation...' });
    try {
      const result = await postJson('/.netlify/functions/emergency-access-invite', {
        action: 'resend',
        invitationId: emergencyDraft.invitationId,
        tenantId: bootstrap.tenantId,
        userId: bootstrap.userId
      });
      if (!result.ok) throw new Error(result.message || 'Invitation could not be resent.');
      const savedPlan = {
        ...emergencyDraft,
        invitationStatus: result.status || emergencyDraft.invitationStatus || 'sent',
        invitationSentAt: result.sentAt || emergencyDraft.invitationSentAt || new Date().toISOString(),
        invitationMessage: result.message || 'Invitation resent.',
        invitationUrl: result.inviteUrl || emergencyDraft.invitationUrl || ''
      };
      const next = upsertEmergencyAccessMetaItem(items, savedPlan);
      await saveItems(next, { autoSync: true, silentAutoSync: true });
      setEmergencyDraft(getEmergencyAccessPlan(next));
      if (Array.isArray(result.events)) setEmergencyFlowEvents(result.events);
      setEmergencyInviteState({ status: 'resent', message: savedPlan.invitationMessage });
      showMessage(savedPlan.invitationMessage, result.emailSent ? 'success' : 'warning');
    } catch (error) {
      const note = error.message || 'Invitation could not be resent.';
      setEmergencyInviteState({ status: 'error', message: note });
      showMessage(note, 'error');
    }
  }

  async function resetEmergencyAccessInvite() {
    if (!ensureEmergencyAccessEntitled()) return { ok: false, code: 'PLAN_FEATURE_REQUIRED' };
    if (!hasEmergencyAccessPlan(emergencyDraft) && !emergencyDraft.invitationId) return showMessage('Trusted Person Access is already at zero.', 'info');
    if (!window.confirm('Reset Trusted Person Access to zero? This removes the trusted person, invitation/request links, emergency requests, package details and all flow event history.')) return;
    setEmergencyInviteState({ status: 'resetting', message: 'Resetting Trusted Person Access to zero...' });
    try {
      const result = await postJson('/.netlify/functions/emergency-access-invite', { action: 'reset_zero' });
      if (!result.ok) throw new Error(result.message || 'Trusted Person Access could not be reset.');
      const next = items.filter((item) => !isEmergencyAccessMetaItem(item));
      await saveItems(next, { autoSync: true, silentAutoSync: true });
      setEmergencyDraft(emptyEmergencyAccessPlan());
      setEmergencyFlowEvents([]);
      setEmergencyInviteState({ status: 'reset', message: result.message || 'Trusted Person Access reset to zero.' });
      showMessage('Trusted Person Access reset to zero. All trusted person flow details and history have been removed.', 'success');
    } catch (error) {
      const note = error.message || 'Trusted Person Access could not be reset.';
      setEmergencyInviteState({ status: 'error', message: note });
      showMessage(note, 'error');
    }
  }

  async function runEmergencyFlowAction(action) {
    const chosen = String(action || '');
    if (!chosen) return;
    if (chosen === 'send_invitation') return sendEmergencyAccessInvite();
    if (chosen === 'check_status') return checkEmergencyInvitationStatus();
    if (chosen === 'resend_invitation') return resendEmergencyAccessInvite();
    if (chosen === 'copy_invitation') return copyEmergencyInviteLink();
    if (chosen === 'cancel_invitation') {
      if (window.confirm('Cancel this trusted person invitation?')) return cancelEmergencyInvitation();
      return;
    }
    if (chosen === 'resend_request_link') return resendEmergencyRequestLink();
    if (chosen === 'copy_request_link') return copyEmergencyRequestLink();
    if (chosen === 'cancel_request') {
      if (window.confirm('Cancel the active emergency access request before release?')) return cancelEmergencyAccessRequest();
      return;
    }
    if (chosen === 'reset_zero') return resetEmergencyAccessInvite();
  }

  async function copyEmergencyInviteLink() {
    const link = emergencyDraft.invitationUrl;
    if (!link) return showMessage('Check status or resend the invitation to refresh the invite link.', 'warning');
    await copyText('Emergency invite link', link);
  }

  async function copyEmergencyRequestLink() {
    const link = emergencyDraft.invitationUrl;
    if (!link) return showMessage('Check status or resend the request link to refresh it.', 'warning');
    await copyText('Emergency request access link', link);
  }

  async function resendEmergencyRequestLink() {
    if (!ensureEmergencyAccessEntitled()) return { ok: false, code: 'PLAN_FEATURE_REQUIRED' };
    if (!emergencyDraft.invitationId) return showMessage('Send an invitation first.', 'warning');
    if (emergencyDraft.invitationStatus !== 'accepted') return showMessage('The trusted person must accept the invitation before you can resend the Request Access link.', 'warning');
    setEmergencyInviteState({ status: 'resending-request-link', message: 'Resending Request Access link...' });
    try {
      const result = await postJson('/.netlify/functions/emergency-access-invite', {
        action: 'resend_request_link',
        invitationId: emergencyDraft.invitationId,
        tenantId: bootstrap.tenantId,
        userId: bootstrap.userId
      });
      if (!result.ok) throw new Error(result.message || 'Request Access link could not be resent.');
      if (Array.isArray(result.events)) setEmergencyFlowEvents(result.events);
      const savedPlan = {
        ...emergencyDraft,
        invitationStatus: result.status || emergencyDraft.invitationStatus || 'accepted',
        invitationMessage: result.message || 'Request Access link resent.',
        invitationUrl: result.requestUrl || result.inviteUrl || emergencyDraft.invitationUrl || '',
        requestLinkResentAt: new Date().toISOString()
      };
      const next = upsertEmergencyAccessMetaItem(items, savedPlan);
      await saveItems(next, { autoSync: true, silentAutoSync: true });
      setEmergencyDraft(getEmergencyAccessPlan(next));
      setEmergencyInviteState({ status: 'request-link-resent', message: savedPlan.invitationMessage });
      showMessage(savedPlan.invitationMessage, result.emailSent ? 'success' : 'warning');
    } catch (error) {
      const note = error.message || 'Request Access link could not be resent.';
      setEmergencyInviteState({ status: 'error', message: note });
      showMessage(note, 'error');
    }
  }

  async function cancelEmergencyAccessRequest() {
    if (!ensureEmergencyAccessEntitled()) return { ok: false, code: 'PLAN_FEATURE_REQUIRED' };
    if (!emergencyDraft.requestId) return showMessage('There is no emergency request to cancel.', 'warning');
    setEmergencyInviteState({ status: 'cancelling-request', message: 'Cancelling emergency request...' });
    try {
      const result = await postJson('/.netlify/functions/emergency-access-request', {
        action: 'cancel_by_owner',
        requestId: emergencyDraft.requestId,
        tenantId: bootstrap.tenantId,
        userId: bootstrap.userId
      });
      if (!result.ok) throw new Error(result.message || 'The request could not be cancelled.');
      const savedPlan = {
        ...emergencyDraft,
        requestStatus: 'cancelled',
        requestMessage: result.message || 'Emergency access request cancelled.',
        requestLastCheckedAt: new Date().toISOString()
      };
      const next = upsertEmergencyAccessMetaItem(items, savedPlan);
      await saveItems(next, { autoSync: true, silentAutoSync: true });
      setEmergencyDraft(getEmergencyAccessPlan(next));
      setEmergencyInviteState({ status: 'request-cancelled', message: savedPlan.requestMessage });
      showMessage('Emergency access request cancelled.', 'success');
    } catch (error) {
      const note = error.message || 'Emergency access request could not be cancelled.';
      setEmergencyInviteState({ status: 'error', message: note });
      showMessage(note, 'error');
    }
  }


  async function loadEmergencyInviteStatus() {
    const params = new URLSearchParams(window.location.search || '');
    const token = params.get('token') || '';
    if (!token) return;
    try {
      const result = await postJson('/.netlify/functions/emergency-access-request', { action: 'status', token });
      if (!result.ok) {
        if (result.code === 'EMERGENCY_PACKAGE_EXPIRED') {
          setInviteAcceptance({ status: 'accepted', message: '' });
          setEmergencyReleasePackage(null);
          setEmergencyRequestState({ status: 'expired', message: result.message || 'This Emergency Package link has expired.', releaseReady: false, waitingEndsAt: '', releaseExpiresAt: '', packageSummary: null, importCode: '' });
        }
        return;
      }
      if (result.invitationStatus === 'accepted') {
        setInviteAcceptance({ status: 'accepted', message: result.invitationMessage || 'Invitation accepted. Your secure Emergency Access link was sent by email for future use.' });
      } else if (result.invitationStatus === 'declined') {
        setInviteAcceptance({ status: 'declined', message: result.invitationMessage || 'Invitation declined.' });
      } else if (result.invitationStatus === 'cancelled') {
        setInviteAcceptance({ status: 'error', message: result.invitationMessage || 'This invitation has been cancelled by the account owner.' });
      }
      if (result.requestId) {
        const ready = result.status === 'release_ready' || result.releaseReady;
        let releasedPackage = null;
        if (ready && result.packageEnvelope) {
          try { releasedPackage = await decryptEmergencyReleasePackage(result.packageEnvelope, token); }
          catch (packageError) { releasedPackage = { error: packageError.message || 'Emergency package could not be opened.' }; }
        }
        const importCode = ready && result.packageEnvelope?.keyMode === 'emergency-import-code-v1' ? await deriveEmergencyImportCode(token) : '';
        setEmergencyReleasePackage(releasedPackage);
        setEmergencyRequestState({
          status: ready ? 'release-ready' : 'requested',
          message: ready ? '' : (result.message || 'Emergency access request is active. The owner can cancel before the waiting period ends.'),
          releaseReady: ready,
          waitingEndsAt: result.waitingEndsAt || '',
          packageSummary: result.packageSummary || null,
          releaseExpiresAt: result.releaseExpiresAt || '',
          importCode
        });
      }
    } catch (error) {
      // Silent status refresh: the page still works if the trusted person taps the buttons manually.
    }
  }

  function currentEmergencyInviteToken() {
    const params = new URLSearchParams(window.location.search || '');
    return params.get('token') || '';
  }

  async function reconstructReleasedEmergencyDocument(result, { token = '', importCode = '', importMode = false } = {}) {
    const record = { ...(result?.document || {}) };
    if (!record?.encrypted_blob) throw new Error('The released file could not be opened.');
    if (String(record?.metadata?.storage_mode || '') === 'chunked_emergency_file_v1') {
      const chunkCount = Number(record?.metadata?.chunk_count || 0);
      if (!chunkCount) throw new Error('This released file is incomplete.');
      const chunks = [];
      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        const chunkResult = await postJson('/.netlify/functions/emergency-access-document', importMode ? {
          action: 'open_import_chunk',
          importCode,
          sourceDocumentId: record.source_document_id || '',
          chunkIndex
        } : {
          action: 'open_chunk',
          token,
          sourceDocumentId: record.source_document_id || '',
          chunkIndex
        });
        if (!chunkResult.ok) throw new Error(chunkResult.message || 'Released encrypted file data could not be loaded.');
        chunks.push(String(chunkResult.chunkData || ''));
      }
      record.encrypted_blob = chunks.join('');
    }
    return record;
  }

  async function loadReleasedEmergencyDocument(documentMeta, token = currentEmergencyInviteToken()) {
    if (!token) throw new Error('This Emergency Access link is missing its secure token.');
    const result = await postJson('/.netlify/functions/emergency-access-document', {
      action: 'open',
      token,
      sourceDocumentId: documentMeta?.sourceDocumentId || ''
    });
    if (!result.ok || !result.document) throw new Error(result.message || 'The released file could not be opened.');
    const record = await reconstructReleasedEmergencyDocument(result, { token });
    const encryptionScope = String(record?.metadata?.encryption_scope || 'trusted_person_invite_token');
    const documentCredential = encryptionScope === 'emergency_import_code_v1' ? await deriveEmergencyImportCode(token) : token;
    const dataUrl = await decryptDocumentData(record, documentCredential);
    return { dataUrl, record };
  }

  async function loadReleasedEmergencyDocumentForImport(documentMeta, importCode) {
    const cleanCode = formatEmergencyImportCode(importCode);
    if (normaliseEmergencyImportCode(cleanCode).length !== EMERGENCY_IMPORT_CODE_LENGTH) throw new Error('The Emergency Package import code is incomplete.');
    const result = await postJson('/.netlify/functions/emergency-access-document', {
      action: 'open_import',
      importCode: cleanCode,
      sourceDocumentId: documentMeta?.sourceDocumentId || ''
    });
    if (!result.ok || !result.document) throw new Error(result.message || 'The released file could not be opened for import.');
    const record = await reconstructReleasedEmergencyDocument(result, { importCode: cleanCode, importMode: true });
    const dataUrl = await decryptDocumentData(record, cleanCode);
    return { dataUrl, record };
  }

  async function downloadReleasedEmergencyDocument(documentMeta) {
    setEmergencyDocumentBusyId(documentMeta?.sourceDocumentId || 'document');
    try {
      const { dataUrl } = await loadReleasedEmergencyDocument(documentMeta);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = safeDownloadFileName(documentMeta?.fileName || documentMeta?.title || 'Emergency-Document');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      setEmergencyRequestState((current) => ({ ...current, message: error.message || 'The released document could not be downloaded.' }));
    } finally {
      setEmergencyDocumentBusyId('');
    }
  }

  async function downloadEmergencyPackageZip(packageData, releaseExpiresAt = '') {
    const releasedDocuments = Array.isArray(packageData?.releasedDocuments) ? packageData.releasedDocuments : [];
    const token = currentEmergencyInviteToken();
    setEmergencyPackageDownloadBusy(true);
    try {
      const entries = [
        { name: 'Password-Encrypt-Emergency-Package.txt', data: emergencyPackagePlainText(packageData, releaseExpiresAt) },
        { name: 'Password-Encrypt-Emergency-Package.docx', data: emergencyDocxBytes(packageData, releaseExpiresAt) }
      ];
      for (let index = 0; index < releasedDocuments.length; index += 1) {
        const documentMeta = releasedDocuments[index];
        const { dataUrl } = await loadReleasedEmergencyDocument(documentMeta, token);
        const { bytes } = dataUrlToBytes(dataUrl);
        const sourceCategory = String(documentMeta?.sourceCategory || DOCUMENTS_CATEGORY);
        const fallbackName = sourceCategory === PICTURES_CATEGORY ? `Picture-${index + 1}` : `Document-${index + 1}`;
        const fileName = safeDownloadFileName(documentMeta?.fileName || documentMeta?.title || fallbackName);
        entries.push({ name: `${sourceCategory === PICTURES_CATEGORY ? 'Pictures' : 'Documents'}/${String(index + 1).padStart(2, '0')}-${fileName}`, data: bytes });
      }
      const zipBytes = makeStoreZip(entries);
      const blob = new Blob([zipBytes], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Password-Encrypt-Emergency-Package.zip';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setEmergencyRequestState((current) => ({ ...current, message: error.message || 'The complete Emergency Package could not be downloaded.' }));
    } finally {
      setEmergencyPackageDownloadBusy(false);
    }
  }

  function openEmergencyImportCodeModal() {
    setEmergencyImportState({ visible: true, status: 'code-entry', message: '', codeInput: '', importCode: '', packageData: null, releaseExpiresAt: '', fingerprint: '', duplicateFolder: '', busy: false });
  }

  function closeEmergencyImportModal() {
    setEmergencyImportState({ visible: false, status: 'code-entry', message: '', codeInput: '', importCode: '', packageData: null, releaseExpiresAt: '', fingerprint: '', duplicateFolder: '', busy: false });
  }

  function updateEmergencyImportCodeInput(value) {
    const compact = normaliseEmergencyImportCode(value);
    setEmergencyImportState((current) => ({ ...current, codeInput: formatEmergencyImportCode(compact), message: current.status === 'error' ? '' : current.message, status: current.status === 'error' ? 'code-entry' : current.status }));
  }

  async function checkEmergencyPackageImportCode() {
    const importCode = formatEmergencyImportCode(emergencyImportState.codeInput);
    if (normaliseEmergencyImportCode(importCode).length !== EMERGENCY_IMPORT_CODE_LENGTH) {
      setEmergencyImportState((current) => ({ ...current, status: 'error', message: 'Enter the complete Emergency Package import code.', busy: false }));
      return;
    }
    if (!customerSession.authenticated || customerSession.cloudAccess === false) {
      showMessage('Verify this device before connecting an Emergency Package to your vault.', 'warning');
      openDeviceVerification();
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setEmergencyImportState((current) => ({ ...current, status: 'error', message: 'Connect to the internet before checking an Emergency Package import code.', busy: false }));
      return;
    }
    setEmergencyImportState((current) => ({ ...current, status: 'loading', busy: true, message: 'Checking the released Emergency Package...' }));
    try {
      const result = await postJson('/.netlify/functions/emergency-access-request', { action: 'redeem_import_code', importCode });
      if (!result.ok) throw new Error(result.message || 'The Emergency Package import code could not be checked.');
      if (!result.packageEnvelope) throw new Error('The released Emergency Package is not available for import.');
      const packageData = await decryptEmergencyReleasePackage(result.packageEnvelope, importCode, 'import-code');
      const fingerprint = await sha256Hex(JSON.stringify(result.packageEnvelope));
      const existingPackage = receivedEmergencyPackagesFromItems(items).find((entry) => entry?.fingerprint === fingerprint);
      setEmergencyImportState({
        visible: true,
        status: existingPackage?.folderName ? 'duplicate' : 'ready',
        message: existingPackage?.folderName ? 'This Emergency Package is already stored in your vault.' : 'Emergency Package found. Check the details below, then add it to your vault.',
        codeInput: importCode,
        importCode,
        packageData,
        releaseExpiresAt: result.releaseExpiresAt || '',
        fingerprint,
        duplicateFolder: existingPackage?.folderName || '',
        busy: false
      });
    } catch (error) {
      setEmergencyImportState((current) => ({ ...current, status: 'error', busy: false, message: error.message || 'The Emergency Package import code could not be checked.' }));
    }
  }

  function openImportedEmergencyFolder(folderName) {
    if (!folderName) return;
    closeEmergencyImportModal();
    setQuery('');
    openVaultSection(folderName);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  }

  async function importEmergencyPackageIntoVault() {
    const packageData = emergencyImportState.packageData;
    const importCode = emergencyImportState.importCode;
    const fingerprint = emergencyImportState.fingerprint;
    if (!packageData || !importCode || !fingerprint) return;
    if (!customerSession.authenticated || customerSession.cloudAccess === false) {
      showMessage('Verify this device before importing the Emergency Package into your vault.', 'warning');
      openDeviceVerification();
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      showMessage('Connect to the internet before importing the Emergency Package and its documents.', 'warning');
      return;
    }

    const sourceItems = (Array.isArray(packageData.items) ? packageData.items : []).filter((item) => ![DOCUMENTS_CATEGORY, PICTURES_CATEGORY].includes(String(item?.category || '')));
    const releasedDocuments = Array.isArray(packageData.releasedDocuments) ? packageData.releasedDocuments : [];
    const releasedPictures = releasedDocuments.filter((entry) => String(entry?.sourceCategory || '') === PICTURES_CATEGORY);
    const releasedDocumentFiles = releasedDocuments.filter((entry) => String(entry?.sourceCategory || DOCUMENTS_CATEGORY) !== PICTURES_CATEGORY);
    if (releasedDocumentFiles.length && !featureIncluded('documents')) {
      showEntitlementUpgrade('documents', 'This Emergency Package includes documents. Your current plan must include encrypted document storage to import the complete package into your vault.');
      return;
    }
    if (releasedPictures.length && !featureIncluded('pictures')) {
      showEntitlementUpgrade('pictures', 'This Emergency Package includes pictures. Your current plan must include encrypted picture storage to import the complete package into your vault.');
      return;
    }

    const visibleCount = getVisibleVaultItems(items).length;
    const addedVisibleItems = 1 + sourceItems.length + releasedDocuments.length;
    const itemLimit = Number(entitlements?.limits?.itemLimit || 0);
    if (itemLimit > 0 && visibleCount + addedVisibleItems > itemLimit) {
      showEntitlementUpgrade('items', `This Emergency Package needs ${addedVisibleItems} new vault items, which would exceed your current plan limit.`);
      return;
    }
    const documentLimit = Number(entitlements?.limits?.documentLimit || 0);
    const currentDocumentUsage = Number(entitlements?.usage?.documents || 0);
    if (documentLimit > 0 && currentDocumentUsage + releasedDocumentFiles.length > documentLimit) {
      showEntitlementUpgrade('documents', `This Emergency Package contains ${releasedDocumentFiles.length} document${releasedDocumentFiles.length === 1 ? '' : 's'}, which would exceed your current encrypted document limit.`);
      return;
    }
    const photoLimit = Number(entitlements?.limits?.photoLimit || 0);
    const currentPictureUsage = Number(entitlements?.usage?.pictures || 0);
    if (photoLimit > 0 && currentPictureUsage + releasedPictures.length > photoLimit) {
      showEntitlementUpgrade('pictures', `This Emergency Package contains ${releasedPictures.length} picture${releasedPictures.length === 1 ? '' : 's'}, which would exceed your current encrypted picture limit.`);
      return;
    }

    const currentFolders = [...BUILT_IN_CATEGORIES, ...getCustomFolders(items)];
    const folderName = emergencyImportFolderName(packageData.ownerName, currentFolders, packageData.preparedAt);
    const importedAt = new Date().toISOString();
    const commonImport = {
      fingerprint,
      ownerName: packageData.ownerName || 'Account owner',
      preparedAt: packageData.preparedAt || '',
      importedAt,
      folderName,
      readOnlyArchive: true
    };
    const importedItems = [];
    const uploadedDocumentEntries = [];
    setEmergencyImportState((current) => ({ ...current, status: 'importing', busy: true, message: releasedDocuments.length ? 'Importing the package and securely copying its files...' : 'Importing the package into your encrypted vault...' }));

    try {
      importedItems.push({
        id: crypto.randomUUID(),
        title: `Emergency Package — ${packageData.ownerName || 'Account owner'}`,
        category: folderName,
        favourite: false,
        payload: {
          url: '', username: '', password: '', file: null,
          notes: emergencyPackageOverviewNotes(packageData, emergencyImportState.releaseExpiresAt),
          emergencyImport: { ...commonImport, sourceCategory: 'Notes', packageOverview: true }
        },
        updatedAt: importedAt
      });

      for (const sourceItem of sourceItems) {
        const sourcePayload = { ...(sourceItem?.payload || {}) };
        delete sourcePayload.file;
        delete sourcePayload.systemAction;
        delete sourcePayload.receivedPackages;
        importedItems.push({
          id: crypto.randomUUID(),
          title: sourceItem?.title || 'Imported emergency item',
          category: folderName,
          favourite: false,
          payload: {
            ...sourcePayload,
            notes: sourcePayload.notes || emergencyImportedNotes(sourceItem),
            file: null,
            emergencyImport: { ...commonImport, sourceCategory: String(sourceItem?.category || 'Other'), sourceItemId: sourceItem?.id || '' }
          },
          updatedAt: sourceItem?.updatedAt || importedAt
        });
      }

      for (const documentMeta of releasedDocuments) {
        const sourceCategory = String(documentMeta?.sourceCategory || DOCUMENTS_CATEGORY) === PICTURES_CATEGORY ? PICTURES_CATEGORY : DOCUMENTS_CATEGORY;
        const isPicture = sourceCategory === PICTURES_CATEGORY;
        const { dataUrl } = await loadReleasedEmergencyDocumentForImport(documentMeta, importCode);
        const itemId = crypto.randomUUID();
        const storedFile = await uploadEncryptedDocumentBlob({
          name: documentMeta?.fileName || documentMeta?.title || (isPicture ? 'Emergency picture' : 'Emergency document'),
          type: documentMeta?.fileType || 'application/octet-stream',
          size: Number(documentMeta?.fileSize || 0),
          extension: documentMeta?.fileExtension || getFileExtension(documentMeta?.fileName || ''),
          dataUrl
        }, itemId, isPicture ? 'picture' : 'document');
        uploadedDocumentEntries.push({ documentId: storedFile.externalDocumentId || itemId, tenantId: bootstrap.tenantId, userId: bootstrap.userId });
        importedItems.push({
          id: itemId,
          title: documentMeta?.title || String(documentMeta?.fileName || (isPicture ? 'Emergency picture' : 'Emergency document')).replace(/\.[^/.]+$/, ''),
          category: folderName,
          favourite: false,
          payload: {
            url: '', username: '', password: '',
            notes: `Imported ${isPicture ? 'picture' : 'document'} from ${packageData.ownerName || 'the account owner'}'s released Emergency Package.`,
            file: storedFile,
            emergencyImport: { ...commonImport, sourceCategory, sourceItemId: documentMeta?.sourceDocumentId || '' }
          },
          updatedAt: importedAt
        });
      }

      let next = [...importedItems, ...items];
      const customFolders = getCustomFolders(next);
      const nextCustomFolders = folderExists(folderName, customFolders) ? customFolders : [...customFolders, folderName];
      const nextOrder = [...getFolderOrder(next).filter((name) => name !== folderName), folderName];
      next = upsertFolderMetaItem(next, nextCustomFolders, nextOrder, getFavouriteFolders(next));
      const syncResult = await saveItems(next, { autoSync: true, silentAutoSync: true, emergencyRefreshReason: 'received_emergency_package_import' });
      setEmergencyImportState((current) => ({ ...current, visible: false, status: 'complete', busy: false, duplicateFolder: folderName, message: 'Emergency Package imported.' }));
      setQuery('');
      openVaultSection(folderName);
      showMessage(`Emergency Package imported into “${folderName}”.${syncResult?.ok && !syncResult?.offline ? '' : ' The local encrypted copy is saved, but secure backup still needs attention.'}`, syncResult?.ok && !syncResult?.offline ? 'success' : 'warning');
    } catch (error) {
      for (const entry of uploadedDocumentEntries) await removeStoredDocumentBlob(entry, { silent: true }).catch(() => null);
      setEmergencyImportState((current) => ({ ...current, status: 'error', busy: false, message: error.message || 'The Emergency Package could not be imported. No vault items were added.' }));
    }
  }

  async function confirmTrustedPersonReminder() {
    const params = new URLSearchParams(window.location.search || '');
    const token = params.get('token') || '';
    if (!token) {
      setTrustedPersonReminderConfirmation({ status: 'error', message: 'This Trusted Person confirmation link is missing its secure token.', ownerName: '', contactName: '', confirmedAt: '' });
      return;
    }
    setTrustedPersonReminderConfirmation((current) => ({ ...current, status: 'working', message: 'Confirming your Trusted Person role...' }));
    try {
      const result = await postJson('/.netlify/functions/trusted-person-reminder-confirm', { token });
      if (!result.ok) throw new Error(result.message || 'Your Trusted Person confirmation could not be completed.');
      setTrustedPersonReminderConfirmation({
        status: 'confirmed',
        message: result.message || 'Thank you. Your confirmation has been recorded.',
        ownerName: result.ownerName || '',
        contactName: result.contactName || '',
        confirmedAt: result.confirmedAt || ''
      });
    } catch (error) {
      setTrustedPersonReminderConfirmation({ status: 'error', message: error.message || 'Your Trusted Person confirmation could not be completed.', ownerName: '', contactName: '', confirmedAt: '' });
    }
  }

  async function respondToEmergencyInvitation(responseStatus) {
    const params = new URLSearchParams(window.location.search || '');
    const token = params.get('token') || '';
    if (!token) {
      setInviteAcceptance({ status: 'error', message: 'This invitation link is missing its secure token.' });
      return;
    }
    setInviteAcceptance({ status: 'working', message: responseStatus === 'accepted' ? 'Accepting invitation...' : 'Declining invitation...' });
    try {
      const result = await postJson('/.netlify/functions/emergency-access-response', { token, response: responseStatus });
      if (!result.ok) throw new Error(result.message || 'The invitation could not be updated.');
      setInviteAcceptance({ status: responseStatus, message: result.message || 'Thank you. The invitation has been updated.' });
    } catch (error) {
      setInviteAcceptance({ status: 'error', message: error.message || 'The invitation could not be updated. Please ask the account owner to resend it.' });
    }
  }

  async function requestEmergencyAccessFromInvite() {
    const params = new URLSearchParams(window.location.search || '');
    const token = params.get('token') || '';
    if (!token) {
      setEmergencyRequestState({ status: 'error', message: 'This invitation link is missing its secure token.' });
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setEmergencyRequestState({ status: 'working', message: 'Sending emergency access request...' });
    try {
      const result = await postJson('/.netlify/functions/emergency-access-request', { token }, { signal: controller.signal });
      if (!result.ok) throw new Error(result.message || 'The emergency access request could not be started.');
      const ready = result.releaseReady || result.status === 'release_ready';
      let releasedPackage = null;
      if (ready && result.packageEnvelope) {
        try { releasedPackage = await decryptEmergencyReleasePackage(result.packageEnvelope, token); }
        catch (packageError) { releasedPackage = { error: packageError.message || 'Emergency package could not be opened.' }; }
      }
      const importCode = ready && result.packageEnvelope?.keyMode === 'emergency-import-code-v1' ? await deriveEmergencyImportCode(token) : '';
      setEmergencyReleasePackage(releasedPackage);
      setEmergencyRequestState({
        status: ready ? 'release-ready' : 'requested',
        message: ready ? '' : (result.message || 'Emergency access request recorded. No vault contents have been released.'),
        releaseReady: ready,
        waitingEndsAt: result.waitingEndsAt || '',
        packageSummary: result.packageSummary || null,
        releaseExpiresAt: result.releaseExpiresAt || '',
        importCode
      });
    } catch (error) {
      const note = error.name === 'AbortError'
        ? 'The request is taking longer than expected. Please tap Request emergency access again, or ask the account owner to check status.'
        : (error.message || 'Emergency access request could not be sent.');
      setEmergencyRequestState({ status: 'error', message: note });
    } finally {
      window.clearTimeout(timeout);
    }
  }


  function startTouchFolderReorder(folderName, event) {
    if (!folderName || folderName === 'All') return;
    event?.preventDefault?.();
    window.clearTimeout(touchReorderRef.current.timer);
    touchReorderRef.current = {
      timer: window.setTimeout(() => {
        touchReorderRef.current.active = true;
        setTouchReorderFolder(folderName);
        setTouchDropTargetFolder(folderName);
      }, 520),
      source: folderName,
      active: false
    };
  }

  function moveTouchFolderReorder(event) {
    if (!touchReorderRef.current.active) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest?.('[data-folder-name]');
    const targetName = target?.getAttribute('data-folder-name') || '';
    if (targetName && targetName !== 'All') setTouchDropTargetFolder(targetName);
  }

  async function endTouchFolderReorder() {
    window.clearTimeout(touchReorderRef.current.timer);
    const source = touchReorderRef.current.source;
    const target = touchDropTargetFolder;
    const wasActive = touchReorderRef.current.active;
    touchReorderRef.current = { timer: null, source: '', active: false };
    setTouchReorderFolder('');
    setTouchDropTargetFolder('');
    if (wasActive && source && target && source !== target) await reorderFolder(source, target);
  }


  async function handleDocumentFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isAllowedDocumentFile(file)) {
      showMessage('Supported files: TXT, MD, CSV, Excel, Word and PDF.', 'warning');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      showMessage(`This document is ${formatFileSize(file.size)}. The secure document store currently supports files up to ${formatFileSize(MAX_DOCUMENT_BYTES)}.`, 'warning');
      event.target.value = '';
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const extension = getFileExtension(file.name);
      setForm((current) => ({
        ...current,
        title: current.title || file.name.replace(/\.[^/.]+$/, ''),
        category: DOCUMENTS_CATEGORY,
        file: {
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          extension,
          dataUrl,
          storageMode: 'pending_external_encrypted_blob',
          storedAt: new Date().toISOString()
        }
      }));
      showMessage('Document ready. Larger files may take a little longer to encrypt, upload and download.', 'success');
    } catch (error) {
      showMessage('Document could not be read. Please try again.', 'error');
    } finally {
      event.target.value = '';
    }
  }

  async function handlePictureFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!isAllowedPictureFile(file)) {
      showMessage('Supported pictures: JPG, JPEG, PNG, WEBP, HEIC and HEIF.', 'warning');
      event.target.value = '';
      return;
    }
    if (file.size > MAX_PICTURE_BYTES) {
      showMessage(`This picture is ${formatFileSize(file.size)}. Pictures must be no larger than ${formatFileSize(MAX_PICTURE_BYTES)} each.`, 'warning');
      event.target.value = '';
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const extension = getFileExtension(file.name);
      setForm((current) => ({
        ...current,
        title: current.title || file.name.replace(/\.[^/.]+$/, ''),
        category: PICTURES_CATEGORY,
        file: {
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size,
          extension,
          dataUrl,
          blobKind: 'picture',
          storageMode: 'pending_external_encrypted_blob',
          storedAt: new Date().toISOString()
        }
      }));
      showMessage('Picture ready to encrypt and store.', 'success');
    } catch (error) {
      showMessage('Picture could not be read. Please try again.', 'error');
    } finally {
      event.target.value = '';
    }
  }

  function closeItemPopup() {
    if (editingItemId) cancelEdit();
    else {
      setForm(emptyForm(form.category));
      setShowFormSecret(false);
      setItemCredentialFieldsArmed({ username: false, password: false });
      setIsItemPopupOpen(false);
    }
  }

  function openViewItem(item) {
    setViewItemId(item.id);
    setShowSecrets((current) => ({ ...current, [item.id]: false }));
  }

  function closeViewItem() {
    setViewItemId('');
    setPicturePreview({ itemId: '', dataUrl: '', busy: false });
  }

  function editViewedItem(item) {
    closeViewItem();
    startEditItem(item);
  }

  function normaliseChecklistNotes(notes) {
    return String(notes || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => /^\[(x|X| )\]\s*/.test(line) ? line.replace(/^\[X\]/, '[x]') : `[ ] ${line}`)
      .join('\n');
  }

  function parseChecklistNotes(notes) {
    return String(notes || '')
      .split(/\r?\n/)
      .map((line, index) => {
        const trimmed = line.trim();
        const match = trimmed.match(/^\[(x|X| )\]\s*(.*)$/);
        return { index, done: match ? match[1].toLowerCase() === 'x' : false, text: match ? match[2] : trimmed };
      })
      .filter((item) => item.text.trim())
      .sort((a, b) => Number(a.done) - Number(b.done));
  }

  async function toggleChecklistLine(item, originalIndex) {
    const lines = String(item.payload?.notes || '').split(/\r?\n/);
    const current = lines[originalIndex] || '';
    const match = current.trim().match(/^\[(x|X| )\]\s*(.*)$/);
    const text = match ? match[2] : current.trim();
    const isDone = match ? match[1].toLowerCase() === 'x' : false;
    lines[originalIndex] = `${isDone ? '[ ]' : '[x]'} ${text}`;
    const sorted = lines
      .map((line) => {
        const trimmed = line.trim();
        const m = trimmed.match(/^\[(x|X| )\]\s*(.*)$/);
        return { done: m ? m[1].toLowerCase() === 'x' : false, text: m ? m[2] : trimmed };
      })
      .filter((row) => row.text)
      .sort((a, b) => Number(a.done) - Number(b.done))
      .map((row) => `${row.done ? '[x]' : '[ ]'} ${row.text}`)
      .join('\n');
    const next = items.map((vaultItem) => vaultItem.id === item.id ? { ...vaultItem, payload: { ...vaultItem.payload, notes: sorted }, updatedAt: new Date().toISOString() } : vaultItem);
    await saveItems(next, { autoSync: true, silentAutoSync: true });
    showMessage('Checklist updated.');
  }

  if (isTrustedPersonReminderRoute) {
    const reminderToken = new URLSearchParams(window.location.search || '').get('token') || '';
    const reminderConfirmed = trustedPersonReminderConfirmation.status === 'confirmed';
    const reminderBusy = trustedPersonReminderConfirmation.status === 'working';
    return (
      <main className="emergency-invite-page trusted-person-reminder-page">
        <section className="emergency-invite-shell">
          <div className="public-brand emergency-invite-brand"><img className="public-brand-image" src="/images/password-encrypt-brand.png" alt="" /><span>Password-Encrypt</span></div>
          <article className="emergency-invite-card trusted-person-reminder-card">
            <p className="eyebrow">Trusted Person reminder</p>
            <h1>{reminderConfirmed ? 'Thank you for confirming' : 'Are you still happy to be the trusted person?'}</h1>
            {reminderConfirmed ? (
              <>
                <div className="emergency-invite-status accepted">{trustedPersonReminderConfirmation.message}</div>
                {trustedPersonReminderConfirmation.ownerName && <p>You remain the nominated trusted person for <strong>{trustedPersonReminderConfirmation.ownerName}</strong>.</p>}
                <p className="emergency-invite-note">This confirmation did not request Emergency Access and did not reveal any vault information.</p>
                {trustedPersonReminderConfirmation.confirmedAt && <p className="trusted-reminder-confirmed-time">Confirmed {formatAppDate(trustedPersonReminderConfirmation.confirmedAt, true)}.</p>}
              </>
            ) : (
              <>
                <p>This routine three-month check gives you peace of mind that your Trusted Person role is still current.</p>
                <div className="trusted-reminder-safety-note"><ShieldCheck size={19} /><span>Confirming here does <strong>not</strong> start Emergency Access and does not give you access to any vault information.</span></div>
                <div className="emergency-invite-actions">
                  <button type="button" className="primary-button" onClick={confirmTrustedPersonReminder} disabled={!reminderToken || reminderBusy}>
                    {reminderBusy ? <RefreshCw size={17} className="spin-icon" /> : <UserRoundCheck size={18} />}
                    {reminderBusy ? 'Confirming...' : 'Yes, I’m still the trusted person'}
                  </button>
                </div>
                {trustedPersonReminderConfirmation.status === 'error' && <div className="emergency-invite-status error">{trustedPersonReminderConfirmation.message}</div>}
                <p className="emergency-invite-note">Keep your original <strong>Password-Encrypt Emergency Access — Keep this link safe</strong> email. This quarterly reminder does not replace your Emergency Access link.</p>
              </>
            )}
          </article>
          <footer className="landing-footer emergency-invite-footer"><span>© 2026 Password-Encrypt</span><button type="button" onClick={openVaultApp}>Open My Vault</button></footer>
        </section>
      </main>
    );
  }

  if (isEmergencyInviteRoute) {
    const emergencyStep = new URLSearchParams(window.location.search || '').get('step') || 'invite';
    const isRequestStep = emergencyStep === 'request';
    const isOpenStep = emergencyStep === 'open';
    const acceptedInvitePage = emergencyStep === 'invite' && inviteAcceptance.status === 'accepted';
    const pageTitle = acceptedInvitePage
      ? 'Invitation accepted'
      : isOpenStep
        ? 'Open emergency access'
        : isRequestStep
          ? 'Request emergency access'
          : 'Trusted person nomination';
    const pageIntro = acceptedInvitePage
      ? 'You have accepted the invitation. No vault information has been released. A separate secure Request Emergency Access link has been emailed to you for future use.'
      : isOpenStep
        ? ''
        : isRequestStep
          ? 'Use this secure page only if you need to request emergency access. The account owner will be notified and the waiting period will start. No vault contents are released at this step.'
          : 'You have been nominated as a trusted person. This does not give you access to any passwords today. If you accept, a separate secure Request Emergency Access link will be emailed to you for future use. You do not need a Password-Encrypt account or app; this secure link works in your browser.';
    return (
      <main className="public-landing-page emergency-invite-page">
        <section className="emergency-invite-shell">
          <div className="public-brand emergency-invite-brand"><img className="public-brand-image" src="/images/password-encrypt-brand.png" alt="" /><span>Password-Encrypt</span></div>
          <article className="emergency-invite-card">
            <div className="preview-lock-icon"><UsersRound size={26} /></div>
            <p className="eyebrow">Emergency Access</p>
            <h1>{pageTitle}</h1>
            {pageIntro && <p>{pageIntro}</p>}
            {emergencyStep === 'invite' && inviteAcceptance.message && <div className={`emergency-invite-status ${inviteAcceptance.status}`}>{inviteAcceptance.message}</div>}
            {emergencyRequestState.message && <div className={`emergency-invite-status ${emergencyRequestState.status}`}>{emergencyRequestState.message}</div>}
            {emergencyStep === 'invite' && !['accepted', 'declined'].includes(inviteAcceptance.status) && (
              <div className="emergency-invite-actions">
                <button type="button" className="primary-button" disabled={inviteAcceptance.status === 'working' || inviteAcceptance.status === 'accepted'} onClick={() => respondToEmergencyInvitation('accepted')}><ShieldCheck size={18} /> Accept nomination</button>
                <button type="button" className="secondary-button" disabled={inviteAcceptance.status === 'working' || inviteAcceptance.status === 'declined'} onClick={() => respondToEmergencyInvitation('declined')}><X size={18} /> Decline</button>
              </div>
            )}
            {inviteAcceptance.status === 'accepted' && (isRequestStep || isOpenStep) && (
              <div className="emergency-request-card">
                <strong>{emergencyRequestState.status === 'release-ready' ? 'Emergency package ready' : isOpenStep ? 'Waiting period not finished yet' : 'Request access when needed'}</strong>
                <p>{emergencyRequestState.status === 'release-ready'
                  ? `This is the prepared release package that ${emergencyReleasePackage?.ownerName || 'the account owner'} prepared for you. Download it below.`
                  : isOpenStep
                    ? 'This is the open-access page, but the emergency package is not ready yet. Please check the waiting period, or look for the fresh email when access is ready.'
                    : 'This starts the waiting period and notifies the account owner. If the request is not cancelled before the waiting period ends, the selected emergency package will become available here. It still does not reveal any vault contents today.'}</p>
                {emergencyRequestState.status === 'release-ready' && (
                  <>
                    <div className="emergency-package-access-window">
                      <ShieldCheck size={18} />
                      <div><strong>This secure link is available for 30 days</strong><span>{emergencyRequestState.releaseExpiresAt ? `Available until ${formatAppDate(emergencyRequestState.releaseExpiresAt, true)}.` : 'The 30-day access period starts when the package becomes available.'} Keep this link private.</span></div>
                    </div>
                    <div className="emergency-invite-qa-card emergency-final-qa">
                      <details>
                        <summary>How long will this link work?</summary>
                        <p>This secure Emergency Package link remains available for 30 days from release. After that, it expires and the package can no longer be opened from this link.</p>
                      </details>
                      <details>
                        <summary>Should I save a copy?</summary>
                        <p>If you need to retain the information, download a copy and store it somewhere safe and private. Downloaded files contain sensitive information in readable form.</p>
                      </details>
                      <details>
                        <summary>Can I share this link or downloaded file?</summary>
                        <p>No. Treat the link and any downloaded copy as highly sensitive and do not forward them to anyone else.</p>
                      </details>
                      <details>
                        <summary>Who can I contact if I need help?</summary>
                        <p>Email Password-Encrypt support at info@zippyweb.uk. Support will never ask for the account holder's master password or unrelated vault contents.</p>
                      </details>
                    </div>
                  </>
                )}
                {emergencyRequestState.status === 'release-ready' && (
                  <div className="emergency-release-ready-card">
                    <ShieldCheck size={18} />
                    <div>
                      <strong>Emergency package ready</strong>
                      <span>The selected emergency package is available to download in full as a ZIP file, or you may download individual items.</span>
                    </div>
                  </div>
                )}
                {emergencyRequestState.status === 'release-ready' && emergencyReleasePackage?.error && (
                  <div className="emergency-invite-status error">{emergencyReleasePackage.error}</div>
                )}
                {emergencyRequestState.status === 'release-ready' && emergencyReleasePackage && !emergencyReleasePackage.error && (
                  <>
                    <div className="emergency-package-download-card emergency-package-download-card-top">
                      <div><strong>Download the emergency package</strong><span>Download the complete package as one ZIP file, or use the folders below to open and download individual items.</span></div>
                      <div className="emergency-package-download-actions">
                        <button type="button" className="primary-button" onClick={() => downloadEmergencyPackageZip(emergencyReleasePackage, emergencyRequestState.releaseExpiresAt)} disabled={emergencyPackageDownloadBusy}><Download size={16} /> {emergencyPackageDownloadBusy ? 'Preparing ZIP...' : 'Download full ZIP'}</button>
                        <button type="button" className="secondary-button" onClick={() => downloadEmergencyText(emergencyReleasePackage, emergencyRequestState.releaseExpiresAt)}><Download size={16} /> Download TXT</button>
                        <button type="button" className="secondary-button" onClick={() => downloadEmergencyDocx(emergencyReleasePackage, emergencyRequestState.releaseExpiresAt)}><FileText size={16} /> Download DOCX</button>
                      </div>
                    </div>
                    <div className="emergency-vault-import-card emergency-import-code-release-card">
                      <div>
                        <strong>Use Password-Encrypt?</strong>
                        {emergencyRequestState.importCode ? (
                          <>
                            <span>Open your own Password-Encrypt vault, then go to <b>Settings → Protection and recovery → Emergency Access — Receive an Emergency Package</b> and enter this code.</span>
                            <div className="emergency-import-code-display">
                              <code>{emergencyRequestState.importCode}</code>
                              <button type="button" className="icon-button" onClick={() => copyText('Import code', emergencyRequestState.importCode)} aria-label="Copy Emergency Package import code" title="Copy import code"><Copy size={17} /></button>
                            </div>
                            <small>The code works only for the Password-Encrypt account using the email address nominated for this Emergency Access arrangement, and only while this released package remains available.</small>
                          </>
                        ) : (
                          <span>This package was prepared before secure Import Codes were enabled. You can still use the ZIP and individual downloads above.</span>
                        )}
                      </div>
                    </div>
                    <div className="emergency-zip-instructions">
                      <strong>How to open the full ZIP download</strong>
                      <p>After downloading, open your device's Files or File Explorer app and find <b>Password-Encrypt-Emergency-Package.zip</b>. On Windows, right-click it and choose <b>Extract All</b>. On Android or iPhone/iPad, tap the ZIP file and choose <b>Extract</b> or <b>Uncompress</b>. Open the extracted folder to view the package files and any released documents or pictures.</p>
                    </div>
                    <div className="emergency-package-viewer">
                      <div className="emergency-package-viewer-head">
                        <strong>{emergencyReleasePackage.title || 'Emergency package'}</strong>
                        <span>{emergencyReleasePackage.releaseScope || 'Emergency Info folder only'} · {emergencyReleasePackage.itemCount || 0} item(s)</span>
                      </div>
                      <div className="emergency-release-folders">
                        {buildEmergencyReleaseFolders(emergencyReleasePackage.items, emergencyReleasePackage.releasedDocuments).map((folder) => {
                          const folderCount = folder.documents.length + folder.items.length;
                          return (
                            <details className="emergency-release-folder" key={folder.name}>
                              <summary>
                                <span className="emergency-release-folder-title"><ChevronRight size={18} className="emergency-release-folder-chevron" />{folder.name}</span>
                                <span className="emergency-release-folder-count">{folderCount}</span>
                              </summary>
                              <div className="emergency-release-folder-body">
                                {[DOCUMENTS_CATEGORY, PICTURES_CATEGORY].includes(folder.name) && !folder.documents.length && <p className="emergency-release-folder-empty">No {folder.name === PICTURES_CATEGORY ? 'pictures' : 'documents'} were included in this emergency package.</p>}
                                {folder.documents.map((documentMeta) => (
                                  <article className="emergency-released-document" key={documentMeta.sourceDocumentId}>
                                    {String(documentMeta?.sourceCategory || DOCUMENTS_CATEGORY) === PICTURES_CATEGORY ? <ImageIcon size={20} /> : <FileText size={20} />}
                                    <div><strong>{documentMeta.fileName || documentMeta.title || (String(documentMeta?.sourceCategory || '') === PICTURES_CATEGORY ? 'Picture' : 'Document')}</strong><small>{documentMeta.fileSize ? formatFileSize(documentMeta.fileSize) : (String(documentMeta?.sourceCategory || '') === PICTURES_CATEGORY ? 'Stored picture' : 'Stored document')}{documentMeta.fileExtension ? ` · ${String(documentMeta.fileExtension).toUpperCase()}` : ''}</small></div>
                                    <button type="button" className="secondary-button" onClick={() => downloadReleasedEmergencyDocument(documentMeta)} disabled={emergencyDocumentBusyId === documentMeta.sourceDocumentId}><Download size={15} /> {emergencyDocumentBusyId === documentMeta.sourceDocumentId ? 'Preparing...' : 'Download'}</button>
                                  </article>
                                ))}
                                {![DOCUMENTS_CATEGORY, PICTURES_CATEGORY].includes(folder.name) && folder.items.map((item) => (
                                  <article className="emergency-released-item" key={item.id}>
                                    <div><strong>{item.title}</strong><span>{item.category}</span></div>
                                    {item.payload?.url && <p><b>URL:</b> {item.payload.url}</p>}
                                    {item.payload?.username && <p><b>Username:</b> {item.payload.username}</p>}
                                    {item.payload?.password && <p><b>Password:</b> {item.payload.password}</p>}
                                    {item.payload?.notes && <pre>{item.payload.notes}</pre>}
                                    {item.category === 'Cards' && (
                                      <div className="emergency-card-fields">
                                        {item.payload?.cardNickname && <p><b>Nickname:</b> {item.payload.cardNickname}</p>}
                                        {item.payload?.cardName && <p><b>Name on card:</b> {item.payload.cardName}</p>}
                                        {item.payload?.cardNumber && <p><b>Number:</b> {item.payload.cardNumber}</p>}
                                        {item.payload?.cardExpiry && <p><b>Expiry:</b> {item.payload.cardExpiry}</p>}
                                        {item.payload?.cardCcv && <p><b>CCV:</b> {item.payload.cardCcv}</p>}
                                      </div>
                                    )}
                                  </article>
                                ))}
                                {![DOCUMENTS_CATEGORY, PICTURES_CATEGORY].includes(folder.name) && !folder.items.length && <p className="emergency-release-folder-empty">No items were included in this folder.</p>}
                              </div>
                            </details>
                          );
                        })}
                      </div>
                      {(emergencyReleasePackage.message || emergencyReleasePackage.importantContacts || emergencyReleasePackage.documentsAndLocations || emergencyReleasePackage.checklist || emergencyReleasePackage.ownerInstructions) && (
                        <details className="emergency-release-folder emergency-package-notes-folder">
                          <summary>
                            <span className="emergency-release-folder-title"><ChevronRight size={18} className="emergency-release-folder-chevron" />Package notes &amp; instructions</span>
                          </summary>
                          <div className="emergency-release-folder-body emergency-package-notes-body">
                            {emergencyReleasePackage.message && <div><strong>Emergency message</strong><pre>{emergencyReleasePackage.message}</pre></div>}
                            {emergencyReleasePackage.importantContacts && <div><strong>Important contacts</strong><pre>{emergencyReleasePackage.importantContacts}</pre></div>}
                            {emergencyReleasePackage.documentsAndLocations && <div><strong>Documents and locations</strong><pre>{emergencyReleasePackage.documentsAndLocations}</pre></div>}
                            {emergencyReleasePackage.checklist && <div><strong>Checklist</strong><pre>{emergencyReleasePackage.checklist}</pre></div>}
                            {emergencyReleasePackage.ownerInstructions && <div><strong>Owner instructions</strong><pre>{emergencyReleasePackage.ownerInstructions}</pre></div>}
                          </div>
                        </details>
                      )}
                      <small className="emergency-release-owner-note">{emergencyReleasePackage.notes}</small>
                    </div>
                  </>
                )}
                {isRequestStep && <button type="button" className={`secondary-button emergency-request-button ${['requested', 'release-ready'].includes(emergencyRequestState.status) ? 'success' : ''}`} disabled={emergencyRequestState.status === 'working' || emergencyRequestState.status === 'requested' || emergencyRequestState.status === 'release-ready'} onClick={requestEmergencyAccessFromInvite}>
                  {emergencyRequestState.status === 'working' ? <RefreshCw size={17} className="spin-icon" /> : ['requested', 'release-ready'].includes(emergencyRequestState.status) ? <ShieldCheck size={17} /> : <AlertTriangle size={17} />}
                  {emergencyRequestState.status === 'working' ? 'Requesting...' : emergencyRequestState.status === 'release-ready' ? 'Emergency package ready' : emergencyRequestState.status === 'requested' ? 'Request sent' : emergencyRequestState.status === 'error' ? 'Try request again' : 'Request emergency access'}
                </button>}
              </div>
            )}
            {!(isOpenStep && emergencyRequestState.status === 'release-ready') && <div className="emergency-invite-qa-card">
              <details>
                <summary>What happens after I request access?</summary>
                <p>The account owner is notified and the waiting period starts. Nothing is released while the owner can still cancel. If the owner does not cancel before the waiting period ends, the selected emergency package will become available from the secure Open Vault link.</p>
              </details>
              <details>
                <summary>How will I know when the waiting period has ended?</summary>
                <p>You should receive a fresh email with an Open Vault button when the waiting period has ended and the request has not been cancelled. If it does not arrive, check Spam or Junk first. You can also return to this secure page to check the latest status.</p>
              </details>
              <details>
                <summary>Do I need to install Password-Encrypt?</summary>
                <p>No. This secure page works in your browser.</p>
              </details>
            </div>}
            {emergencyStep === 'invite' && (
              <div className="emergency-invite-about-card">
                <ShieldCheck size={20} />
                <div>
                  <strong>About Password-Encrypt</strong>
                  <p>Password-Encrypt is a private encrypted vault for passwords, documents, important pictures and other personal information. Trusted Person Access lets an account owner prepare protected information for someone they trust without giving that person immediate access to the vault.</p>
                  <a href="/">Learn more about Password-Encrypt</a>
                </div>
              </div>
            )}
          </article>
          <footer className="landing-footer emergency-invite-footer"><span>© 2026 Password-Encrypt</span><button type="button" onClick={openVaultApp}>Open My Vault</button></footer>
        </section>
      </main>
    );
  }

  if (isPublicLandingRoute) {
    return (
      <main className="public-landing-page">
        <header className="public-landing-topbar">
          <div className="public-brand"><img className="public-brand-image" src="/images/password-encrypt-brand.png" alt="" /><span>Password-Encrypt</span></div>
          <button type="button" className="secondary-button public-open-button" onClick={openVaultApp}><Unlock size={17} /> Open My Vault</button>
        </header>

        {!isOnline && <NetworkStatusNotice context="public" hasLocalVault={hasLocalVault} />}

        <section className="landing-hero-shell" aria-label="Password-Encrypt introduction">
          <div className="landing-hero-copy">
            <div className="landing-pill"><Sparkles size={16} /> Encrypted password vault for everyday life</div>
            <h1>One secure place for the passwords and private details you rely on.</h1>
            <p className="landing-intro">Save passwords, secure notes, cards, checklists, encrypted documents and important pictures in a vault designed to stay simple across your phone, laptop and desktop.</p>
            <div className="landing-cta-row">
              <button type="button" className="primary-button landing-primary-cta" onClick={() => openCreateAccountPopup()}><UserRoundCheck size={18} /> Start free trial</button>
              <button type="button" className="secondary-button landing-secondary-cta" onClick={openVaultApp}><Unlock size={18} /> Open My Vault</button>
            </div>
            <div className="landing-trust-strip" aria-label="Security highlights">
              <span><ShieldCheck size={16} /> Encrypted on your device</span>
              <span><Lock size={16} /> Master password stays private</span>
              <span><Database size={16} /> Local encrypted vault access</span>
            </div>
          </div>

          <div className="landing-vault-preview" aria-label="Vault preview">
            <div className="preview-window-bar">
              <span></span><span></span><span></span>
              <strong>Secure vault</strong>
            </div>
            <div className="preview-lock-card">
              <div className="preview-lock-icon"><Lock size={26} /></div>
              <p>Encrypted vault</p>
              <h2>Passwords, cards, documents, pictures and private notes</h2>
              <div className="preview-search-row"><Search size={16} /> Search your vault</div>
            </div>
            <div className="preview-card-grid">
              <article><KeyRound size={18} /><strong>Passwords</strong><span>Logins and access details</span></article>
              <article><CreditCard size={18} /><strong>Cards</strong><span>Keep card details organised</span></article>
              <article><FileText size={18} /><strong>Documents</strong><span>Encrypted files and records</span></article>
              <article><ImageIcon size={18} /><strong>Pictures</strong><span>Photo IDs, passports and important images</span></article>
              <article><RefreshCw size={18} /><strong>Sync</strong><span>Protected across verified devices</span></article>
            </div>
          </div>
        </section>

        <section className="landing-section landing-feature-section" aria-label="Features">
          <div className="landing-section-heading">
            <p className="eyebrow">Everything important, neatly organised</p>
            <h2>A private vault that stays easy to use.</h2>
            <p>Keep the details you need every day organised, searchable and protected without turning your vault into a complicated filing system.</p>
          </div>
          <div className="landing-feature-grid">
            <article><ShieldCheck size={24} /><h3>Encrypted on your device</h3><p>Your readable vault contents and master password are not sent to the server.</p></article>
            <article><KeyRound size={24} /><h3>More than passwords</h3><p>Organise logins, cards, secure notes, checklists, documents and important pictures inside one encrypted vault.</p></article>
            <article><Search size={24} /><h3>Find things quickly</h3><p>Search folders, favourites and saved records without scrolling through everything.</p></article>
            <article><Database size={24} /><h3>Local encrypted access</h3><p>Your encrypted local vault remains available on the device where it was created.</p></article>
          </div>
        </section>

        <section className="landing-trusted-person-spotlight" aria-label="Trusted Person Access">
          <div className="trusted-person-visual" aria-hidden="true">
            <div className="trusted-person-icon"><UsersRound size={34} /></div>
            <div className="trusted-person-connection"><span></span><span></span><span></span></div>
            <div className="trusted-person-shield"><ShieldCheck size={28} /></div>
          </div>
          <div className="trusted-person-copy">
            <p className="eyebrow">Next of Kin / Trusted Person Access</p>
            <h2>Make sure someone you trust can help if you are incapacitated or no longer able to access your vault.</h2>
            <p>Emergency Access is designed for next of kin or another trusted person you nominate. You prepare the information they may need, a request starts your chosen waiting period, you are notified, and you can cancel before any prepared emergency package is released.</p>
            <div className="trusted-person-points">
              <span><UserRoundCheck size={17} /> You choose your next of kin or trusted person</span>
              <span><CalendarClock size={17} /> A waiting period protects you</span>
              <span><ShieldCheck size={17} /> Only the prepared emergency package is released</span>
            </div>
          </div>
        </section>

        <section className="landing-section landing-how-section" aria-label="How setup works">
          <div className="landing-section-heading compact">
            <p className="eyebrow">Simple setup</p>
            <h2>From free trial to secure vault in four steps.</h2>
          </div>
          <div className="landing-step-grid">
            <article><span>1</span><strong>Choose a plan</strong><p>Select the vault size and trial that works for you.</p></article>
            <article><span>2</span><strong>Verify your email</strong><p>Confirm the email address linked to your account.</p></article>
            <article><span>3</span><strong>Create your master password</strong><p>Choose the private password that unlocks your encrypted vault.</p></article>
            <article><span>4</span><strong>Start saving securely</strong><p>Add passwords, notes, cards, checklists, encrypted documents and important pictures.</p></article>
          </div>
        </section>

        <section className="landing-section landing-plan-section landing-pricing-section" aria-label="Subscription plans">
          <div className="landing-section-heading landing-pricing-heading">
            <p className="eyebrow">Choose your plan</p>
            <h2>Start with the vault size that suits you.</h2>
            <p>Review the included features and limits below. Your free trial starts after email verification.</p>
          </div>
          <div className="landing-plan-tier-grid">
            {publicPlans.map((plan, planIndex) => {
              const isMostPopular = publicPlans.length >= 3 && planIndex === Math.floor(publicPlans.length / 2);
              const flags = { ...DEFAULT_ENTITLEMENTS.features, ...(plan.featureFlags || {}), multiUser: false, sharing: false };
              const enforcedFeatures = [
                plan.itemLimit > 0 ? `${plan.itemLimit} vault items` : 'Encrypted password vault',
                flags.documents !== false ? (plan.documentLimit > 0 ? `${plan.documentLimit} encrypted document${plan.documentLimit === 1 ? '' : 's'}` : 'Encrypted documents included') : '',
                flags.pictures !== false ? (plan.photoLimit > 0 ? `${plan.photoLimit} encrypted picture${plan.photoLimit === 1 ? '' : 's'}` : 'Encrypted pictures included') : '',
                plan.storageLimitMb > 0 ? `${plan.storageLimitMb} MB total account storage` : '',
                flags.cloudBackupSync !== false ? 'Secure cloud backup and syncing' : '',
                flags.emergencyAccess !== false ? 'Next of Kin / Emergency Access' : '',
                flags.secureDeviceUnlock !== false ? 'Secure device unlock' : ''
              ].filter(Boolean);
              const marketingFeatures = (plan.features || []).filter((feature) => {
                const text = String(feature || '');
                if (!text) return false;
                if (flags.documents === false && /document|file|storage/i.test(text)) return false;
                if (flags.pictures === false && /picture|photo|image/i.test(text)) return false;
                if (flags.cloudBackupSync === false && /backup|sync|cloud/i.test(text)) return false;
                if (flags.emergencyAccess === false && /emergency/i.test(text)) return false;
                if (flags.secureDeviceUnlock === false && /secure device|biometric|passkey/i.test(text)) return false;
                if (/household|family sharing|team user|multi.?user|sharing controls/i.test(text)) return false;
                if (/document\s*limit|encrypted\s+documents?|picture\s*limit|photo\s*limit|encrypted\s+pictures?|storage\s*limit|encrypted\s+document\s+storage|total\s+account\s+storage|account\s+storage|vault\s*item\s*limit|password\s*limit/i.test(text)) return false;
                return true;
              });
              const featureList = [...new Set([...enforcedFeatures, ...marketingFeatures])].slice(0, 8);
              return (
                <article key={plan.code} className={`landing-plan-tier landing-plan-reveal ${isMostPopular ? 'featured' : ''}`}>
                  {isMostPopular && <span className="landing-plan-badge">Most popular</span>}
                  <div className="landing-plan-tier-heading">
                    <h3>{plan.displayName}</h3>
                    <p>{plan.description}</p>
                  </div>
                  <div className="landing-plan-price"><strong>{publicPlanPriceLabel(plan)}</strong><span>{plan.trialDays ? `${plan.trialDays}-day free trial` : 'Start securely today'}</span></div>
                  <ul>{featureList.map((feature) => <li key={feature}><ShieldCheck size={16} /> {feature}</li>)}</ul>
                  <button type="button" className="primary-button landing-plan-cta" onClick={() => openCreateAccountPopup(plan.code)}><Sparkles size={17} /> {plan.trialDays ? `Start ${plan.trialDays}-day trial` : 'Choose this plan'}</button>
                </article>
              );
            })}
            {!publicPlans.length && <div className="landing-plans-unavailable"><AlertTriangle size={20} /><span><strong>Plans are temporarily unavailable.</strong><small>Please try again shortly or contact support.</small></span></div>}
          </div>
          <div className="landing-trial-no-card"><CreditCard size={18} /><span><strong>NO CREDIT CARD DETAILS are taken during your free trial.</strong><small>You only enter payment details if you later choose to purchase a subscription.</small></span></div>
        </section>

        <section className="landing-section landing-faq-section" aria-label="Frequently asked questions">
          <div className="landing-section-heading compact">
            <p className="eyebrow">Questions answered</p>
            <h2>Frequently asked questions.</h2>
            <p>Clear answers to the questions people usually ask before trusting Password-Encrypt with their private information.</p>
          </div>
          <div className="landing-faq-accordion">
            <details>
              <summary><span>When does my free trial start?</span><ChevronRight size={19} /></summary>
              <p>Your trial starts only after you verify your email and complete account setup.</p>
            </details>
            <details>
              <summary><span>Will I be charged when I create an account?</span><ChevronRight size={19} /></summary>
              <p>No. No card details are taken for the trial. A paid subscription begins only if you deliberately choose a plan and complete Stripe Checkout from inside your vault.</p>
            </details>
            <details>
              <summary><span>Can Password-Encrypt recover my master password?</span><ChevronRight size={19} /></summary>
              <p>No. Password-Encrypt does not store a server-side copy of your master password and cannot recover or reset it. Secure device unlock, if enabled, keeps a separately protected local wrapped copy on that device.</p>
            </details>
            <details>
              <summary><span>How is my vault protected before it reaches the cloud?</span><ChevronRight size={19} /></summary>
              <p>Your readable vault records are encrypted on your device before cloud backup or syncing. Password-Encrypt stores the encrypted vault copy, not the readable contents.</p>
            </details>
            <details>
              <summary><span>What does verified-device protection mean?</span><ChevronRight size={19} /></summary>
              <p>Cloud backup, syncing and protected account actions require a validated customer session on the device. You can review devices and end account sessions from My Account.</p>
            </details>
            <details>
              <summary><span>What is Next of Kin / Emergency Access for?</span><ChevronRight size={19} /></summary>
              <p>It is designed for incapacity, serious illness or circumstances where you can no longer access the vault yourself. You nominate the trusted person, choose the waiting period and can cancel a request before the prepared emergency package is released.</p>
            </details>
            <details>
              <summary><span>Can I use the vault on more than one device?</span><ChevronRight size={19} /></summary>
              <p>Yes. Verify each device and use secure syncing to keep your latest protected vault available.</p>
            </details>
            <details>
              <summary><span>Can I use my vault if the cloud service is temporarily unavailable?</span><ChevronRight size={19} /></summary>
              <p>Your encrypted local vault remains available on a device where it has already been set up. New cloud backups and cross-device syncing wait until the connection is available again.</p>
            </details>
            <details>
              <summary><span>Can Password-Encrypt support staff see my saved passwords or documents?</span><ChevronRight size={19} /></summary>
              <p>Support diagnostics are metadata-only. Support should never ask you to send your master password, saved passwords, OTP codes, recovery codes or decrypted vault contents.</p>
            </details>
            <details>
              <summary><span>Can I store encrypted documents too?</span><ChevronRight size={19} /></summary>
              <p>Yes, where included in your plan. Documents and pictures have separate plan allowances, and their encrypted storage also counts toward the plan's total account storage allowance. Each uploaded document or picture can be up to 10 MB.</p>
            </details>
            <details>
              <summary><span>What happens if a backup cannot complete?</span><ChevronRight size={19} /></summary>
              <p>Your change remains on that device and the app gives you a clear warning and guided steps to finish the backup safely.</p>
            </details>
          </div>
        </section>

        <section className="landing-final-cta" aria-label="Start free trial">
          <div>
            <p className="eyebrow">Start securely</p>
            <h2>Your private vault is ready when you are.</h2>
            <p>Choose a plan, verify your account and create the master password that only you know.</p>
          </div>
          <button type="button" className="primary-button landing-primary-cta" onClick={() => openCreateAccountPopup()}><Sparkles size={18} /> Start free trial</button>
        </section>

        <footer className="landing-footer">
          <div className="landing-footer-copy">
            <span>© 2026 Password-Encrypt</span>
            <small>A trusted place for your private details that matter.</small>
          </div>
          <nav className="landing-footer-links" aria-label="Landing page links">
            <a href="/terms">Terms</a>
            <a href="/privacy">Privacy</a>
            <a href="/billing-terms">Billing & refunds</a>
            <a href="mailto:info@zippyweb.uk">Support</a>
            <button type="button" onClick={openVaultApp}>Open My Vault</button>
          </nav>
        </footer>

        {showLandingBackToTop && (
          <button
            type="button"
            className="landing-back-to-top"
            onClick={scrollLandingToTop}
            aria-label="Back to top"
            title="Back to top"
          >
            <ArrowUp size={22} />
          </button>
        )}

        {isOpenVaultChoicePopupOpen && (
          <div className="item-popup-layer open-vault-choice-popup-layer" role="presentation">
            <button type="button" className="item-popup-backdrop" onClick={() => setIsOpenVaultChoicePopupOpen(false)} aria-label="Close Open My Vault choice" />
            <section className="item-popup-card open-vault-choice-popup-card" role="dialog" aria-modal="true" aria-labelledby="open-vault-choice-title">
              <header className="item-popup-header">
                <div>
                  <p className="eyebrow">Vault access</p>
                  <h2 id="open-vault-choice-title"><Unlock size={21} /> Open My Vault</h2>
                </div>
                <button type="button" className="icon-button" onClick={() => setIsOpenVaultChoicePopupOpen(false)} aria-label="Close"><X size={18} /></button>
              </header>
              <div className="item-popup-body open-vault-choice-popup-body">
                <p className="open-vault-choice-intro">Do you already have a Password-Encrypt account?</p>
                <div className="open-vault-choice-options">
                  <button type="button" className="open-vault-choice-option existing" onClick={continueExistingCustomerToVault}>
                    <span className="open-vault-choice-icon"><Unlock size={22} /></span>
                    <span><strong>Yes — I’m an existing customer</strong><small>Continue to your existing vault. You may be asked to verify this device.</small></span>
                    <ChevronRight size={20} />
                  </button>
                  <button type="button" className="open-vault-choice-option new" onClick={startNewCustomerFromVaultChoice}>
                    <span className="open-vault-choice-icon"><UserRoundCheck size={22} /></span>
                    <span><strong>No — I’m new to Password-Encrypt</strong><small>Start your free trial and create a new Password-Encrypt account.</small></span>
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>
              <footer className="item-popup-footer">
                <button type="button" className="secondary-button" onClick={() => setIsOpenVaultChoicePopupOpen(false)}>Cancel</button>
              </footer>
            </section>
          </div>
        )}

        {isCreateAccountPopupOpen && (
          <div className="item-popup-layer create-account-popup-layer" role="dialog" aria-modal="true" aria-label="Create Password-Encrypt account">
            <div className="item-popup-backdrop" onClick={closeCreateAccountPopup} />
            <section className="item-popup-card create-account-popup-card">
              <header className="item-popup-header create-account-popup-header">
                <div className="create-account-header-content">
                  <div className="create-account-header-title">
                    <p className="eyebrow">Step 1 of 3 · Account setup</p>
                    <h2><UserRoundCheck size={20} /> Create your Password-Encrypt account</h2>
                  </div>
                  <div className="onboarding-progress onboarding-progress-four" aria-label="Account setup progress">
                    {[1, 2, 3, 4].map((step) => <span key={step} className={landingOnboardingStep === step ? 'active' : landingOnboardingStep > step ? 'complete' : ''}>{step}</span>)}
                  </div>
                </div>
                <button type="button" className="icon-button" onClick={closeCreateAccountPopup} aria-label="Close create account popup"><X size={18} /></button>
              </header>
              <div ref={createAccountPopupBodyRef} className="item-popup-body create-account-popup-body">
                <div className="onboarding-three-part-roadmap" aria-label="Password-Encrypt onboarding has three steps">
                  <span className="current"><b>1</b><span><strong>Set up account</strong><small>Details, plan and email verification.</small></span></span>
                  <ChevronRight size={18} />
                  <span><b>2</b><span><strong>Set up vault</strong><small>Create your private master password.</small></span></span>
                  <ChevronRight size={18} />
                  <span><b>3</b><span><strong>Install app</strong><small>Add Password-Encrypt to this device for everyday access.</small></span></span>
                </div>

                {landingOnboardingStep === 1 && (
                  <div className="create-account-step">
                    <h3>Your account details</h3>
                    <p>Enter the details you want linked to your Password-Encrypt account. You will create your private master password after verification.</p>
                    <label>Display name<input autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-protonpass-ignore="true" data-form-type="other" value={landingAccountDraft.displayName} onChange={(e) => updateLandingDraft({ displayName: e.target.value })} placeholder="e.g. Alex" /></label>
                    <label>Email address<input type="email" autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-protonpass-ignore="true" data-form-type="other" value={landingAccountDraft.email} onChange={(e) => updateLandingDraft({ email: e.target.value })} placeholder="you@example.com" /></label>
                    <label>Mobile number</label>
                    <div className="phone-combo-field">
                      <CountryPicker countryCode={landingAccountDraft.phoneCountryCode || '+254'} countryIso={landingAccountDraft.phoneCountryIso || 'ke'} onChange={(country) => updateLandingDraft({ phoneCountryCode: country.code, phoneCountryIso: country.iso })} />
                      <input inputMode="tel" autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-protonpass-ignore="true" data-form-type="other" value={landingAccountDraft.phoneNumber || ''} onChange={(e) => updateLandingDraft({ phoneNumber: e.target.value })} placeholder="712345678" />
                    </div>
                    <label>Vault name<input autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-protonpass-ignore="true" data-form-type="other" value={landingAccountDraft.accountName} onChange={(e) => updateLandingDraft({ accountName: e.target.value })} placeholder="e.g. My Private Vault" /></label>
                    <div className="legal-consent-row">
                      <input id="signup-legal-consent" type="checkbox" checked={Boolean(landingAccountDraft.legalAccepted)} onChange={(event) => updateLandingDraft({ legalAccepted: event.target.checked })} aria-labelledby="signup-legal-consent-text" />
                      <span id="signup-legal-consent-text">I have read and agree to your <button type="button" className="legal-inline-link" onClick={() => openSignupLegalDocument('terms')}>Terms of Service</button> and <button type="button" className="legal-inline-link" onClick={() => openSignupLegalDocument('privacy')}>Privacy Policy</button>.</span>
                    </div>
                  </div>
                )}

                {landingOnboardingStep === 2 && (
                  <div className="create-account-step">
                    <h3>Confirm your plan</h3>
                    <p>Your free trial starts after successful account verification. Email is the normal verification method, with SMS available only as a backup when needed. You can manage your subscription from inside the vault before the trial ends.</p>
                    <div className="plan-choice-grid">
                      {publicPlans.map((plan) => <button type="button" key={plan.code} className={landingAccountDraft.planCode === plan.code ? 'active' : ''} onClick={() => updateLandingDraft({ planCode: plan.code })}><strong>{plan.displayName}</strong><span>{plan.description}</span><small>{publicPlanPriceLabel(plan)}</small></button>)}
                      {!publicPlans.length && <div className="no-public-plans"><AlertTriangle size={18} /><span><strong>Plans are temporarily unavailable.</strong><small>Please try again shortly or contact support.</small></span></div>}
                    </div>
                    <div className="saas-inline-note"><ShieldCheck size={16} /><span>Your selected trial starts only after successful contact verification. Creating the trial does not start a paid subscription.</span></div>
                    <div className="saas-inline-note trial-no-card-inline"><CreditCard size={16} /><span><strong>NO CREDIT CARD DETAILS are taken during your free trial.</strong> Payment details are requested only if you later choose a paid subscription.</span></div>
                    <p className="landing-commercial-note">Prices are shown in GBP. Any tax that the seller is required and configured to collect must be shown in the Stripe payment flow before payment.</p>
                  </div>
                )}

                {landingOnboardingStep === 3 && (
                  <div className="create-account-step onboarding-verification-step">
                    <h3>Verify your account</h3>
                    <p>{landingSignup.existingAccount ? 'An existing account was found. Verification will open that account on this device without starting a second trial.' : 'Request the email code when you are ready. If two email codes do not arrive within 10 minutes, SMS backup verification will become available. Your account remains pending until verification succeeds.'}</p>
                    <div className="account-summary-card onboarding-account-summary">
                      <span><strong>Account</strong>{landingAccountDraft.accountName || 'My Private Vault'}</span>
                      <span><strong>Email</strong>{landingAccountDraft.email || 'not set'}</span>
                      <span><strong>Phone</strong>{landingAccountDraft.phoneE164 || buildPhoneE164(landingAccountDraft.phoneCountryCode, landingAccountDraft.phoneNumber) || 'not set'}</span>
                      <span><strong>Plan</strong>{landingSignup.planName || planDisplayName(landingAccountDraft.planCode)}</span>
                    </div>
                    {landingSignup.message && <div className={`onboarding-status-message ${landingSignup.status}`}>{landingSignup.message}</div>}
                    <div className={`landing-otp-card ${landingOtp.status}`}>
                      <div className="landing-otp-heading">
                        {landingOtp.channel === 'sms' ? <Phone size={19} /> : <Mail size={19} />}
                        <span>
                          <strong>{landingOtp.channel === 'sms' ? 'SMS backup verification' : 'Email verification code'}</strong>
                          <small>{landingOtp.channel === 'sms' ? 'Use this only if the email codes have not arrived.' : 'The code expires after 10 minutes.'}</small>
                        </span>
                      </div>

                      {(landingOtp.status === 'idle' || (landingOtp.status === 'error' && !landingOtp.challengeId)) && (
                        <button type="button" className="primary-button" onClick={sendLandingOnboardingOtp} disabled={landingOtp.status === 'sending'}>
                          {landingOtp.channel === 'sms' ? <Phone size={17} /> : <Mail size={17} />}
                          {landingOtp.channel === 'sms' ? 'Send SMS code' : 'Send email code'}
                        </button>
                      )}

                      {landingOtp.status !== 'idle' && <p className={`landing-otp-message ${landingOtp.status}`}>{landingOtp.message}</p>}
                      {landingOtp.testCode && <div className="test-code-box"><span>Local test code</span><code>{landingOtp.testCode}</code></div>}

                      {['sent', 'verifying', 'error'].includes(landingOtp.status) && landingOtp.challengeId && (
                        <>
                          <div className="landing-otp-entry">
                            <input inputMode="numeric" maxLength="6" value={landingOtp.input} onChange={(event) => setLandingOtp((current) => ({ ...current, input: event.target.value.replace(/\D/g, '').slice(0, 6) }))} placeholder="Enter 6-digit code" />
                            <button type="button" className="primary-button" onClick={verifyLandingOnboardingOtp} disabled={landingOtp.status === 'verifying'}><ShieldCheck size={17} /> {landingOtp.status === 'verifying' ? 'Verifying...' : landingOtp.channel === 'sms' ? 'Verify mobile & continue' : 'Verify account'}</button>
                          </div>
                          <button type="button" className="secondary-button onboarding-resend-code" onClick={sendLandingOnboardingOtp} disabled={landingOtp.status === 'verifying' || landingOtp.status === 'sending'}>
                            <RefreshCw size={16} /> {landingOtp.channel === 'sms' ? 'Resend SMS code' : 'Resend email code'}
                          </button>
                        </>
                      )}

                      {landingOtp.smsFallbackEligible && landingOtp.channel === 'email' && (
                        <div className="onboarding-sms-fallback">
                          <Phone size={19} />
                          <span>
                            <strong>Still not receiving the email?</strong>
                            <small>You have tried email twice within 10 minutes. You can now verify your mobile number by SMS instead.</small>
                          </span>
                          <button type="button" className="secondary-button" onClick={() => chooseLandingOtpChannel('sms')}>Use SMS backup</button>
                        </div>
                      )}

                      {landingOtp.channel === 'sms' && (
                        <div className="onboarding-sms-backup-note">
                          <span>SMS verifies the mobile number saved during signup. It does not mark the email address as verified.</span>
                          <button type="button" className="link-button" onClick={() => chooseLandingOtpChannel('email')}>Back to email verification</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {landingOnboardingStep === 4 && (
                  <div className="create-account-step onboarding-complete-step">
                    <div className="onboarding-complete-icon"><ShieldCheck size={30} /></div>
                    <h3>{landingSignup.existingAccount ? 'Account verified on this device' : 'Step 1 complete — your account is ready'}</h3>
                    <p>{landingSignup.message || 'Account verification completed successfully.'}</p>
                    <div className="account-summary-card onboarding-final-summary">
                      <span><strong>Account</strong>{bootstrap.accountName || landingAccountDraft.accountName}</span>
                      <span><strong>Plan</strong>{landingSignup.planName || planDisplayName(bootstrap.planCode)}</span>
                      <span><strong>Status</strong>{planStatusDisplayName(bootstrap.planStatus, bootstrap.accountStatus)}</span>
                      <span><strong>Trial ends</strong>{isFounderPlan(bootstrap) ? 'No expiry' : formatAccountDate(landingSignup.trialEndsAt || bootstrap.trialEndsAt, true)}</span>
                    </div>
                    {!landingSignup.existingAccount && Number(landingSignup.trialDays || 0) > 0 && <div className="trial-ready-card"><CalendarClock size={20} /><span><strong>{landingSignup.trialDays}-day trial active</strong><small>Ends {formatAccountDate(landingSignup.trialEndsAt, true)}.</small></span></div>}
                    <div className="saas-inline-note onboarding-next-step-note"><ShieldCheck size={16} /><span>{landingSignup.existingAccount ? 'This is an existing account. Next, open its existing encrypted vault using the master password you already use.' : 'Step 2 of 3 is next: create your encrypted vault and choose the master password only you know.'}</span></div>
                  </div>
                )}
              </div>
              <footer className="item-popup-footer create-account-popup-footer">
                {landingOnboardingStep <= 2 && <button type="button" className="secondary-button" onClick={landingOnboardingStep === 1 ? closeCreateAccountPopup : () => setLandingOnboardingStep(1)}>{landingOnboardingStep === 1 ? 'Cancel' : 'Back'}</button>}
                {landingOnboardingStep === 1 && <button type="button" className="primary-button" onClick={() => { const draft = cleanLandingDraft(); const error = validateLandingDraft(draft); if (error && !error.includes('plan')) return showMessage(error, 'warning'); updateLandingDraft(draft); setLandingOnboardingStep(2); }}>Continue</button>}
                {landingOnboardingStep === 2 && <button type="button" className="primary-button" onClick={prepareLandingOnboarding} disabled={landingSignup.status === 'preparing' || !publicPlans.length || !landingAccountDraft.legalAccepted}>{landingSignup.status === 'preparing' ? <RefreshCw size={17} className="spin-icon" /> : <ShieldCheck size={17} />} {landingSignup.status === 'preparing' ? 'Preparing...' : 'Continue to verification'}</button>}
                {landingOnboardingStep === 3 && <button type="button" className="secondary-button" onClick={closeCreateAccountPopup}>Finish later</button>}
                {landingOnboardingStep === 4 && <button type="button" className="primary-button" onClick={finishLandingOnboarding}><Unlock size={18} /> {landingSignup.existingAccount ? 'Open existing vault' : 'Continue to Step 2 — Create vault'}</button>}
              </footer>
            </section>
          </div>
        )}

        {signupLegalModal.visible && isCreateAccountPopupOpen && (
          <div className="item-popup-layer signup-legal-popup-layer" role="dialog" aria-modal="true" aria-labelledby="signup-legal-popup-title">
            <button type="button" className="item-popup-backdrop" onClick={closeSignupLegalDocument} aria-label="Close legal document" />
            <section className="item-popup-card signup-legal-popup-card">
              <header className="item-popup-header">
                <div>
                  <p className="eyebrow">Legal</p>
                  <h2 id="signup-legal-popup-title"><FileText size={20} /> {signupLegalModal.page === 'privacy' ? 'Privacy Policy' : signupLegalModal.page === 'billing' ? 'Billing & Refund Terms' : 'Terms of Service'}</h2>
                </div>
                <button type="button" className="icon-button" onClick={closeSignupLegalDocument} aria-label="Close legal document"><X size={18} /></button>
              </header>
              <div className="item-popup-body signup-legal-popup-body" onClickCapture={handleSignupLegalDocumentClick}>
                <LegalPage page={signupLegalModal.page} embedded />
              </div>
              <footer className="item-popup-footer signup-legal-popup-footer">
                <button type="button" className="primary-button" onClick={closeSignupLegalDocument}>Back to signup</button>
              </footer>
            </section>
          </div>
        )}


      <PlanEntitlementModal state={entitlementModal} entitlements={entitlements} onClose={() => setEntitlementModal({ visible: false, feature: '', title: '', message: '' })} onOpenSubscription={openSubscriptionFromEntitlement} />
      <DeviceVerificationModal state={deviceVerificationModal} email={bootstrap.email} phone={bootstrap.phoneE164 || buildPhoneE164(bootstrap.phoneCountryCode, bootstrap.phoneNumber)} channel={otpChannel} otp={otpTest} onClose={() => setDeviceVerificationModal({ visible: false, purpose: '' })} onChannelChange={chooseOtpChannel} onSend={() => requestSelectedOtp({ popupFlow: true })} onChange={(value) => setOtpTest((current) => ({ ...current, input: value.replace(/\D/g, '').slice(0, 6) }))} onVerify={verifyTestOtp} />
      <SyncSafetyModal state={syncSafetyModal} onClose={closeSyncSafetyModal} onRetry={retryPendingBackup} onVerify={openDeviceVerification} onOpenSafety={() => { closeSyncSafetyModal(); openVaultSafetySettings(); }} onKeepDevice={keepThisDeviceCopy} onUseCloud={useSecureBackupCopy} onConfirmDanger={confirmDangerAction} onCheck={handleVaultStatusCheck} />
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      </main>
    );
  }

  if (locked && newCustomerOnboardingEntry) {
    const onboardingPhone = buildPhoneE164(onboardingVaultDraft.phoneCountryCode, onboardingVaultDraft.phoneNumber) || bootstrap.phoneE164 || buildPhoneE164(bootstrap.phoneCountryCode, bootstrap.phoneNumber);
    return (
      <main className="vault-onboarding-screen">
        <section className="vault-onboarding-card">
          <header className="vault-onboarding-header">
            <div>
              <p className="eyebrow">Step 2 of 3 · Vault setup</p>
              <h1><ShieldCheck size={28} /> Create your secure vault</h1>
              <p>Your Password-Encrypt account has been set up. Now create the encrypted vault on this device and choose the master password only you know.</p>
            </div>
          </header>

          <div className="three-step-onboarding-guide" aria-label="Onboarding progress">
            <div className="complete"><span><Check size={18} /></span><div><strong>1. Account setup</strong><small>Account details and email verification complete.</small></div></div>
            <div className="current"><span>2</span><div><strong>2. Vault setup</strong><small>Confirm your details and create your master password.</small></div></div>
            <div><span>3</span><div><strong>3. Install app</strong><small>Recommended for quick everyday access.</small></div></div>
          </div>

          <form className="vault-onboarding-form" onSubmit={createVaultFromOnboarding} autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-protonpass-ignore="true" data-form-type="other">
            <div className="vault-onboarding-section">
              <div className="vault-onboarding-section-heading"><UserRoundCheck size={21} /><div><strong>Confirm your account details</strong><small>Use the same email and mobile number you entered during account setup.</small></div></div>
              <label>Email address<input type="email" autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-protonpass-ignore="true" data-form-type="other" value={onboardingVaultDraft.email || ''} onChange={(event) => setOnboardingVaultDraft((current) => ({ ...current, email: event.target.value }))} placeholder="you@example.com" /></label>
              <label>Mobile number</label>
              <div className="phone-combo-field">
                <CountryPicker countryCode={onboardingVaultDraft.phoneCountryCode || '+254'} countryIso={onboardingVaultDraft.phoneCountryIso || 'ke'} onChange={(country) => setOnboardingVaultDraft((current) => ({ ...current, phoneCountryCode: country.code, phoneCountryIso: country.iso }))} />
                <input inputMode="tel" autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-protonpass-ignore="true" data-form-type="other" value={onboardingVaultDraft.phoneNumber || ''} onChange={(event) => setOnboardingVaultDraft((current) => ({ ...current, phoneNumber: event.target.value }))} placeholder="712345678" />
              </div>
              {onboardingPhone && <small className="vault-onboarding-contact-preview">Account mobile: {maskPhone(onboardingPhone)}</small>}
            </div>

            <div className="vault-onboarding-section">
              <div className="vault-onboarding-section-heading"><KeyRound size={21} /><div><strong>Create your master password</strong><small>This password encrypts your vault. Password-Encrypt cannot recover or reset it.</small></div></div>
              <label>Master password<input id="onboarding-master-password" className="onboarding-secret-mask" type={onboardingSecretInputType} inputMode="text" autoComplete="off" aria-autocomplete="none" spellCheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-protonpass-ignore="true" data-form-type="other" readOnly={!onboardingSecretFieldsArmed.master} onPointerDown={() => setOnboardingSecretFieldsArmed((current) => ({ ...current, master: true }))} onFocus={() => setOnboardingSecretFieldsArmed((current) => ({ ...current, master: true }))} value={masterPassword} onChange={(event) => setMasterPassword(event.target.value)} placeholder="Create your master password" /></label>
              <label>Confirm master password<input className="onboarding-secret-mask" type={onboardingSecretInputType} inputMode="text" autoComplete="off" aria-autocomplete="none" spellCheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-protonpass-ignore="true" data-form-type="other" readOnly={!onboardingSecretFieldsArmed.confirm} onPointerDown={() => setOnboardingSecretFieldsArmed((current) => ({ ...current, confirm: true }))} onFocus={() => setOnboardingSecretFieldsArmed((current) => ({ ...current, confirm: true }))} value={confirmMasterPassword} onChange={(event) => setConfirmMasterPassword(event.target.value)} placeholder="Type the same password again" /></label>
              <div className="master-password-boundary-note compact"><Lock size={18} /><span><strong>Keep this password somewhere safe</strong><small>It is the primary secret that decrypts your vault and cannot be recovered by support.</small></span></div>
            </div>

            {onboardingSecurityWarning && <div className="vault-onboarding-session-note warning onboarding-account-mismatch-warning"><AlertTriangle size={18} /> <span><strong>Account safety check</strong><small>{onboardingSecurityWarning}</small></span></div>}
            {hasLocalVault && <div className="vault-onboarding-session-note warning"><AlertTriangle size={18} /> This device already contains a local encrypted vault. Password-Encrypt will not overwrite it during new-account onboarding. Use a clean browser/device for this new vault, or return to the landing page.</div>}
            {!hasLocalVault && !customerSession.checked && <div className="vault-onboarding-session-note"><RefreshCw size={17} className="spin-icon" /> Checking your verified account session...</div>}
            {customerSession.checked && !customerSession.authenticated && <div className="vault-onboarding-session-note warning"><AlertTriangle size={18} /> Your account verification session has expired. Return to the landing page and verify the account again before creating a vault.</div>}
            {message && <p className="message">{message}</p>}

            <div className="vault-onboarding-actions">
              <button type="button" className="secondary-button" onClick={() => window.location.assign('/')}><ArrowLeft size={17} /> Back to landing page</button>
              <button type="submit" className="primary-button" disabled={hasLocalVault || !customerSession.checked || !customerSession.authenticated}><ShieldCheck size={18} /> Create Secure Vault</button>
            </div>
          </form>
          <p className="version">{VERSION}</p>
        </section>
        <VerificationOverlay state={verifyOverlay} onClose={hideVerifyOverlay} onFocusMasterPassword={() => document.getElementById('onboarding-master-password')?.focus()} />
        <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      </main>
    );
  }

  if ((showInstallOnboarding || onboardingInstallEntry) && hasLocalVault) {
    const installedNow = installStatus === 'installed' || isPasswordEncryptInstalled();
    return (
      <main className="vault-onboarding-screen install-onboarding-screen">
        <section className="vault-onboarding-card install-onboarding-card">
          <header className="vault-onboarding-header">
            <div>
              <p className="eyebrow">Step 3 of 3 · Install app</p>
              <h1><MonitorSmartphone size={28} /> Install Password-Encrypt</h1>
              <p>Your encrypted vault is ready. Installing Password-Encrypt is recommended for quicker everyday access and a cleaner app-style experience.</p>
            </div>
          </header>

          <div className="three-step-onboarding-guide" aria-label="Onboarding progress">
            <div className="complete"><span><Check size={18} /></span><div><strong>1. Account setup</strong><small>Account details and verification complete.</small></div></div>
            <div className="complete"><span><Check size={18} /></span><div><strong>2. Vault setup</strong><small>Your encrypted vault has been created.</small></div></div>
            <div className="current"><span>3</span><div><strong>3. Install app</strong><small>{installedNow ? 'Password-Encrypt is installed.' : 'Recommended for everyday use.'}</small></div></div>
          </div>

          <div className="install-onboarding-content">
            <section className="vault-onboarding-section install-benefits-section">
              <div className="vault-onboarding-section-heading"><ShieldCheck size={21} /><div><strong>Why install Password-Encrypt?</strong><small>Your vault remains encrypted; installing simply gives you a faster way to open Password-Encrypt on this device.</small></div></div>
              <ul className="install-benefits-list">
                <li><Check size={17} /> Open Password-Encrypt directly from your home screen, Start menu or app launcher.</li>
                <li><Check size={17} /> Use a cleaner app-style window without normal browser tabs and controls.</li>
                <li><Check size={17} /> Keep convenient access to the local encrypted vault, including supported offline use.</li>
              </ul>
            </section>

            <div className={`vault-onboarding-session-note install-status-note ${installedNow ? 'success' : ''}`} role="status">
              {installedNow ? <Check size={18} /> : installStatus === 'prompting' ? <RefreshCw size={18} className="spin-icon" /> : <MonitorSmartphone size={18} />}
              <span>{installMessage || passwordEncryptInstallInstructions()}</span>
            </div>

            <div className="vault-onboarding-actions install-onboarding-actions">
              <button type="button" className="secondary-button" onClick={finishInstallOnboarding}>{installedNow ? 'Open my vault' : 'Continue in browser'}</button>
              {!installedNow && <button type="button" className="primary-button" onClick={installPasswordEncryptApp} disabled={installStatus === 'prompting'}><Download size={18} /> {installPromptReady ? 'Install Password-Encrypt' : 'Install app'}</button>}
            </div>
          </div>
          <p className="version">{VERSION}</p>
        </section>
        <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      </main>
    );
  }

  if (locked) {
    return (
      <main className="lock-screen">
        <section className="lock-card" id="vault-access-card">
          <div className="brand-mark"><img className="brand-mark-image" src="/images/password-encrypt-brand.png" alt="Password-Encrypt secure vault" /></div>
          <p className="eyebrow">Secure private vault</p>
          <h1>Password-Encrypt</h1>
          {!isOnline && <NetworkStatusNotice context="vault" hasLocalVault={hasLocalVault} />}
          {hasLocalVault ? (
            <>
              <p className="intro">Unlock your private vault with your master password.</p>
              <div className="unlock-form" role="form" onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); unlockVault(event); } }} autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-protonpass-ignore="true" data-form-type="other">
                <div className="unlock-password-and-biometric-row">
                  <div className={`unlock-password-field ${hasLocalVault && !createMode && biometricUnlock && biometricStatus.supported && featureIncluded('secureDeviceUnlock') ? 'has-secure-device-key' : ''}`}>
                    <input ref={masterPasswordInputRef} id="master-password-input" name="vault-local-decryption-key" type={showUnlockPassword ? 'text' : 'password'} aria-label="Master vault password" autoComplete="off" spellCheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-protonpass-ignore="true" data-form-type="other" readOnly={!masterPasswordFieldArmed} onPointerDown={armMasterPasswordField} onFocus={armMasterPasswordField} value={masterPassword} onChange={(e) => setMasterPassword(e.target.value)} placeholder="Enter Password" />
                    <button type="button" className="unlock-password-toggle" onClick={() => setShowUnlockPassword((current) => !current)} aria-label={showUnlockPassword ? 'Hide master password' : 'Show master password'} title={showUnlockPassword ? 'Hide password' : 'Show password'}>{showUnlockPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                    {hasLocalVault && !createMode && biometricUnlock && biometricStatus.supported && featureIncluded('secureDeviceUnlock') && (
                      <button type="button" className="unlock-biometric-icon-button enabled" onPointerDown={(event) => { event.stopPropagation(); masterPasswordInputRef.current?.blur?.(); }} onClick={handleBiometricIconAction} aria-label="Open device unlock" title="Open device unlock">
                        <KeyRound size={23} strokeWidth={1.25} />
                      </button>
                    )}
                  </div>
                </div>
                <button type="button" onClick={unlockVault}><Unlock size={18} /> Unlock Local Vault</button>
              </div>
              {passwordCheckNotice && <div className="password-check-login-notice" role="status"><AlertTriangle size={18} /><span><strong>Password check required</strong><small>{passwordCheckNotice}</small></span></div>}
            </>
          ) : existingCustomerEntry ? (
            <>
              <p className="intro">Open your existing Password-Encrypt vault on this device. Verify your account, then enter the master password for your existing vault.</p>
              <div className="create-vault-entry-actions existing-vault-entry-actions">
                <button type="button" className="primary-button" onClick={() => { setCreateMode(false); setIsCreateVaultPopupOpen(true); }}><RefreshCw size={17} /> Open Existing Vault</button>
              </div>
            </>
          ) : (
            <>
              <p className="intro">This vault access screen is for existing Password-Encrypt customers. New customers create an account first, then use the separate vault setup screen.</p>
              <div className="create-vault-entry-actions existing-vault-entry-actions">
                <button type="button" className="primary-button" onClick={() => { setCreateMode(false); setIsCreateVaultPopupOpen(true); }}><RefreshCw size={17} /> Open Existing Vault</button>
                <button type="button" className="secondary-button" onClick={() => window.location.assign('/')}><ArrowLeft size={17} /> New customer — start on landing page</button>
              </div>
            </>
          )}
          <div className="lock-account-access-actions">
            {hasLocalVault && <button type="button" className="clear-local-vault-link" onClick={resetLocalVaultOnDevice}>Clear local vault on this device</button>}
            <button type="button" className="account-recovery-link" onClick={openAccountRecovery}><UserRoundCheck size={17} /> Recover account access</button>
          </div>
          {message && <p className="message">{message}</p>}
          <div className="security-note"><ShieldCheck size={18} /> Your master password is the primary secret that decrypts your vault; Secure device unlock can locally unwrap it on a device you set up.</div>
          <p className="version">{VERSION}</p>
        </section>

        {isCreateVaultPopupOpen && !hasLocalVault && (
          <div className="item-popup-layer create-vault-popup-layer" role="presentation">
            <div className="item-popup-backdrop" onClick={() => setIsCreateVaultPopupOpen(false)} />
            <section className="item-popup-card create-account-popup-card create-vault-popup-card" role="dialog" aria-modal="true" aria-labelledby="create-vault-title">
              <header className="item-popup-header">
                <div>
                  <p className="eyebrow">{createMode ? 'Secure setup' : 'Existing customer'}</p>
                  <h2 id="create-vault-title"><ShieldCheck size={21} /> {createMode ? 'Create your vault' : 'Open your existing vault'}</h2>
                </div>
                <button type="button" className="icon-button" onClick={() => setIsCreateVaultPopupOpen(false)} aria-label="Close create vault popup"><X size={18} /></button>
              </header>

              <div className="item-popup-body create-account-popup-body create-vault-popup-body" role="form" autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-protonpass-ignore="true" data-form-type="other">
                <div className="create-account-step">
                  <h3>Account details</h3>
                  <p>{createMode ? 'Your email and mobile number help verify this device. Your master password is still the primary vault encryption secret. Secure device unlock, if you enable it later, works only from a device you have deliberately set up.' : 'Verify the contact details already linked to your Password-Encrypt account. This does not create a new vault or a new account.'}</p>
                  <label>Mobile number</label>
                  <div className="phone-combo-field">
                    <CountryPicker countryCode={bootstrap.phoneCountryCode || '+254'} countryIso={bootstrap.phoneCountryIso || 'ke'} onChange={(country) => setBootstrap({ ...bootstrap, phoneCountryCode: country.code, phoneCountryIso: country.iso, phoneE164: buildPhoneE164(country.code, bootstrap.phoneNumber) })} />
                    <input inputMode="tel" value={bootstrap.phoneNumber || ''} onChange={(e) => setBootstrap({ ...bootstrap, phoneNumber: e.target.value, phoneE164: buildPhoneE164(bootstrap.phoneCountryCode, e.target.value) })} placeholder="712345678" />
                  </div>
                  <label>Email<input type="email" value={bootstrap.email || ''} onChange={(e) => setBootstrap({ ...bootstrap, email: e.target.value })} placeholder="you@example.com" /></label>
                  <label>Vault name<input value={bootstrap.accountName || bootstrap.tenantName || ''} onChange={(e) => setBootstrap({ ...bootstrap, accountName: e.target.value, tenantName: e.target.value })} placeholder="My Private Vault" /></label>
                </div>

                <div className="create-account-step">
                  <h3>Verify your account</h3>
                  <p>Use email verification, then enter the one-time code before opening an existing vault on this device.</p>
                  <div className={`otp-test-panel ${otpTest.status}`}>
                    <div className="otp-test-title"><ShieldCheck size={16} /><strong>One-time code</strong></div>
                    {otpTest.message && <div className={`otp-status-line ${otpTest.verified ? 'verified' : ''}`}>{otpTest.message}</div>}
                    {otpTest.code && <div className="test-code-box"><span>Recovery code</span><code>{otpTest.code}</code></div>}
                    <div className="otp-flow-row create-vault-otp-row">
                      <button type="button" className="secondary-button otp-send-button" onClick={() => { chooseOtpChannel('email'); requestEmailOtp(); }} disabled={otpTest.status === 'requesting'}>{otpTest.status === 'requesting' ? 'Sending...' : 'Send email OTP'}</button>
                      <input inputMode="numeric" value={otpTest.input} onChange={(e) => setOtpTest({ ...otpTest, input: e.target.value })} placeholder="Enter 6-digit OTP" />
                      <button type="button" className="secondary-button otp-verify-button" onClick={verifyTestOtp} disabled={otpTest.status === 'verifying'}>Verify OTP</button>
                    </div>
                    {otpTest.verified && <div className="otp-next-step"><ShieldCheck size={16} /><span>{createMode ? 'Account verified. Now set your master password.' : 'Account verified. Enter the existing master password for this vault.'}</span><button type="button" className="mini-inline-button" onClick={focusMasterPassword}>{createMode ? 'Master password' : 'Existing password'}</button></div>}
                  </div>
                </div>

                <div className="create-account-step">
                  <h3>{createMode ? 'Master password' : 'Existing master password'}</h3>
                  <p>{createMode ? 'Choose a strong master password you can remember. No server-side copy is stored by Password-Encrypt, so support cannot recover or reset it if forgotten.' : 'Enter the master password for your existing vault. Password-Encrypt cannot recover or reset it.'}</p>
                  <label>Master vault password<input id="master-password-input" name="vault-setup-local-decryption-key" type="password" autoComplete="off" spellCheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-protonpass-ignore="true" data-form-type="other" value={masterPassword} onChange={(e) => setMasterPassword(e.target.value)} placeholder="Enter your master password" /></label>
                  {createMode && (
                    <>
                      <label>Confirm master vault password<input name="vault-setup-local-decryption-key-confirmation" type="password" autoComplete="off" spellCheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-protonpass-ignore="true" data-form-type="other" value={confirmMasterPassword} onChange={(e) => setConfirmMasterPassword(e.target.value)} placeholder="Type the same password again" /></label>
                      <p className="create-warning">New vault creation only continues when both password entries match.</p>
                    </>
                  )}
                  <p className="master-password-manager-warning setup-warning"><AlertTriangle size={16} /><span><strong>Do not save this master password</strong> in your browser or another password manager. Memorise it and keep any offline recovery record somewhere physically secure.</span></p>
                </div>
              </div>

              <footer className="item-popup-footer create-account-popup-footer">
                <button type="button" className="secondary-button" onClick={() => setIsCreateVaultPopupOpen(false)}>Cancel</button>
                <button type="submit" className="primary-button" onClick={(event) => unlockVault(event)}><Unlock size={18} /> {createMode ? 'Create Secure Vault' : 'Open Secure Vault'}</button>
              </footer>
            </section>
          </div>
        )}
        <AccountRecoveryModal state={accountRecoveryModal} setState={setAccountRecoveryModal} onClose={() => setAccountRecoveryModal({ visible: false, step: 'contact', channel: 'email', contact: '', challengeId: '', code: '', testOtpCode: '', message: '', busy: false })} onRequest={requestAccountRecoveryCode} onVerify={verifyAccountRecoveryCode} />
        <VerificationOverlay state={verifyOverlay} onClose={hideVerifyOverlay} onFocusMasterPassword={focusMasterPassword} />
        <PlanEntitlementModal state={entitlementModal} entitlements={entitlements} onClose={() => setEntitlementModal({ visible: false, feature: '', title: '', message: '' })} onOpenSubscription={openSubscriptionFromEntitlement} />
      <DeviceVerificationModal state={deviceVerificationModal} email={bootstrap.email} phone={bootstrap.phoneE164 || buildPhoneE164(bootstrap.phoneCountryCode, bootstrap.phoneNumber)} channel={otpChannel} otp={otpTest} onClose={() => setDeviceVerificationModal({ visible: false, purpose: '' })} onChannelChange={chooseOtpChannel} onSend={() => requestSelectedOtp({ popupFlow: true })} onChange={(value) => setOtpTest((current) => ({ ...current, input: value.replace(/\D/g, '').slice(0, 6) }))} onVerify={verifyTestOtp} />
        <SyncSafetyModal state={syncSafetyModal} onClose={closeSyncSafetyModal} onRetry={retryPendingBackup} onVerify={openDeviceVerification} onOpenSafety={() => { closeSyncSafetyModal(); openVaultSafetySettings(); }} onKeepDevice={keepThisDeviceCopy} onUseCloud={useSecureBackupCopy} onConfirmDanger={confirmDangerAction} onCheck={handleVaultStatusCheck} />
        <ExitAppConfirmationModal visible={exitAppConfirmationOpen} onStay={() => setExitAppConfirmationOpen(false)} onExit={confirmExitApp} />
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      </main>
    );
  }

  const inviteStatusText = String(emergencyDraft.invitationStatus || 'not_invited').replace(/_/g, ' ');
  const requestStatusText = String(emergencyDraft.requestStatus || 'not_requested').replace(/_/g, ' ');
  const normalisedRequestStatus = String(emergencyDraft.requestStatus || '').toLowerCase();
  const hasActiveEmergencyRequest = ['requested', 'waiting', 'owner_notified'].includes(normalisedRequestStatus);
  const isEmergencyReleaseReady = normalisedRequestStatus === 'release_ready';
  const invitationStatusTitle = emergencyDraft.invitationStatus === 'accepted'
    ? 'Invitation accepted'
    : emergencyDraft.invitationStatus === 'declined'
      ? 'Invitation declined'
      : emergencyDraft.invitationStatus === 'cancelled'
        ? 'Invitation cancelled'
        : ['invitation_sent', 'sent', 'pending'].includes(emergencyDraft.invitationStatus)
          ? 'Invitation sent'
          : 'Not invited yet';
  const invitationStatusCopy = emergencyDraft.invitationStatus === 'accepted'
    ? 'Your trusted person has accepted the invitation. They should receive a secure Request Access link by email and can use that browser link if emergency access is ever needed.'
    : emergencyDraft.invitationStatus === 'declined'
      ? 'Your trusted person declined the invitation. You can update the details or send a new invitation.'
      : emergencyDraft.invitationStatus === 'cancelled'
        ? 'This invitation has been cancelled. You can send a new invitation when ready.'
        : ['invitation_sent', 'sent', 'pending'].includes(emergencyDraft.invitationStatus)
          ? 'Invitation sent. Your trusted person can accept the invitation, but no vault access is granted yet.'
          : 'Save the plan, then send an invitation when you are ready.';
  const requestStatusTitle = isEmergencyReleaseReady
    ? 'Waiting period ended'
    : hasActiveEmergencyRequest
      ? 'Emergency access requested'
    : normalisedRequestStatus === 'cancelled'
      ? 'Emergency request cancelled'
      : normalisedRequestStatus && normalisedRequestStatus !== 'not_requested'
        ? `Emergency request ${requestStatusText}`
        : '';
  const requestStatusCopy = isEmergencyReleaseReady
    ? 'The waiting period has ended. The selected emergency package is now release-ready. If you prepared Full vault access, the trusted person can open those prepared vault records from their secure emergency link.'
    : hasActiveEmergencyRequest
      ? 'Your trusted person has requested emergency access. The waiting period has started. If you do not cancel before it ends, your selected emergency package will become available. No passwords have been released before the waiting period ends.'
    : normalisedRequestStatus === 'cancelled'
      ? 'The emergency access request has been cancelled. No vault contents were released.'
      : emergencyDraft.requestMessage || '';

  const emergencySavedPlan = getEmergencyAccessPlan(items);
  const receivedEmergencyPackages = receivedEmergencyPackagesFromItems(items);
  const emergencyTrustedPersonComplete = Boolean(
    String(emergencySavedPlan.contactName || '').trim()
    && String(emergencySavedPlan.contactEmail || '').trim().includes('@')
    && (emergencySavedPlan.trustedPersonUpdatedAt || emergencySavedPlan.invitationId || emergencySavedPlan.updatedAt)
  );
  const emergencyPackageComplete = Boolean(
    emergencySavedPlan.emergencyPackageEnabled !== false
    && String(emergencySavedPlan.emergencyPackageTitle || '').trim()
    && String(emergencySavedPlan.accessScope || '').trim()
    && (emergencySavedPlan.emergencyPackageUpdatedAt || emergencySavedPlan.invitationId)
  );
  const emergencyInvitationWasSent = Boolean(emergencyDraft.invitationId || emergencyDraft.invitationSentAt);
  const emergencyInvitationAccepted = emergencyDraft.invitationStatus === 'accepted' || hasActiveEmergencyRequest || isEmergencyReleaseReady;
  const emergencyRequestWasMade = hasActiveEmergencyRequest || isEmergencyReleaseReady;
  const emergencyInvitationNeedsAttention = ['declined', 'cancelled'].includes(String(emergencyDraft.invitationStatus || '').toLowerCase());
  const emergencyCurrentStage = isEmergencyReleaseReady
    ? { number: 6, step: 'Stage 6', title: 'Emergency package ready', copy: 'The waiting period completed without cancellation. Your trusted person can open only the emergency package you prepared.' }
    : hasActiveEmergencyRequest
      ? { number: 6, step: 'Stage 6', title: 'Waiting period active', copy: `An Emergency Access request is active. No vault contents have been released. You can cancel before ${emergencyDraft.requestWaitingEndsAt ? formatAppDate(emergencyDraft.requestWaitingEndsAt, true) : 'the waiting period ends'}.` }
      : emergencyInvitationAccepted
        ? { number: 5, step: 'Stage 5', title: 'Waiting for an Emergency Access request', copy: 'Your trusted person has accepted and has their secure Emergency Access link. Nothing else happens unless they use that link in a genuine emergency.' }
        : emergencyInvitationWasSent
          ? { number: 4, step: 'Stage 4', title: emergencyInvitationNeedsAttention ? 'Invitation needs attention' : 'Waiting for your trusted person', copy: emergencyInvitationNeedsAttention ? 'The invitation was declined or cancelled. Review the details and invitation options before continuing.' : 'The invitation has been sent. Your trusted person now needs to accept it. No vault access has been granted.' }
          : emergencyPackageComplete
            ? { number: 3, step: 'Stage 3', title: 'Send the invitation', copy: 'Your trusted person and emergency package are prepared. You can now send the invitation.' }
            : emergencyTrustedPersonComplete
              ? { number: 2, step: 'Stage 2', title: 'Prepare the emergency package', copy: 'Trusted person details are saved. Now prepare exactly what should be released if the Emergency Access waiting period completes.' }
              : { number: 1, step: 'Stage 1', title: 'Add your trusted person', copy: 'Start by adding and saving the next of kin or trusted person you want to nominate for a serious emergency.' };

  const emergencySetupCompleteCount = [emergencyTrustedPersonComplete, emergencyPackageComplete, emergencyInvitationWasSent, emergencyInvitationAccepted].filter(Boolean).length;
  const emergencySetupStageNumber = !emergencyTrustedPersonComplete ? 1 : !emergencyPackageComplete ? 2 : !emergencyInvitationWasSent ? 3 : 4;
  const emergencySetupProgress = emergencySetupStageNumber === 1
    ? { title: 'Add your trusted person', copy: 'Add and save the next of kin or trusted person you want to nominate.' }
    : emergencySetupStageNumber === 2
      ? { title: 'Prepare the emergency package', copy: 'Trusted person details are saved. Now prepare what should be available if Emergency Access is ever needed.' }
      : emergencySetupStageNumber === 3
        ? { title: 'Send the invitation', copy: 'Your trusted person and emergency package are ready. Send the invitation when you are happy with both.' }
        : emergencyInvitationAccepted
          ? { title: 'Setup complete', copy: 'Your trusted person has accepted. Stages 1–4 are complete. Emergency stages only begin if they later request access.' }
          : emergencyInvitationNeedsAttention
            ? { title: 'Invitation needs attention', copy: 'Review the invitation status and actions in Stage 4 before setup can be completed.' }
            : { title: 'Waiting for your trusted person', copy: 'The invitation has been sent. Setup completes when your trusted person accepts it.' };

  function goToEmergencySetupStage(stageNumber) {
    window.requestAnimationFrame(() => {
      const target = document.getElementById(`emergency-stage-${stageNumber}`);
      if (!target) return;
      if (target instanceof HTMLDetailsElement) target.open = true;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  const emergencyInvitationStageOptions = [
    { value: 'check_status', label: 'Check acceptance status' },
    ['sent', 'pending', 'invitation_sent'].includes(String(emergencyDraft.invitationStatus || '').toLowerCase()) && { value: 'resend_invitation', label: 'Resend invitation email' },
    emergencyDraft.invitationUrl && ['sent', 'pending', 'invitation_sent'].includes(String(emergencyDraft.invitationStatus || '').toLowerCase()) && { value: 'copy_invitation', label: 'Copy invitation link' },
    ['sent', 'pending', 'invitation_sent'].includes(String(emergencyDraft.invitationStatus || '').toLowerCase()) && { value: 'cancel_invitation', label: 'Cancel invitation' }
  ].filter(Boolean);

  const emergencyAcceptedStageOptions = [
    { value: 'resend_request_link', label: 'Resend access link' },
    emergencyDraft.invitationUrl && { value: 'copy_request_link', label: 'Copy access link' }
  ].filter(Boolean);

  const emergencyWaitingStageOptions = [
    { value: 'check_status', label: 'Check waiting-period status' },
    hasActiveEmergencyRequest && { value: 'cancel_request', label: 'Cancel Emergency Access request' }
  ].filter(Boolean);

  const emergencyManagementOptions = [
    (hasEmergencyAccessPlan(emergencyDraft) || emergencyDraft.invitationId) && { value: 'reset_zero', label: 'Reset to zero' }
  ].filter(Boolean);

  const cloudBackupIncluded = featureIncluded('cloudBackupSync');
  const vaultSessionCheckFailed = Boolean(cloudBackupIncluded && isOnline && customerSession.checked && customerSession.accessCode === 'SESSION_CHECK_FAILED');
  const vaultSessionChecking = Boolean(cloudBackupIncluded && isOnline && !customerSession.checked);
  const vaultVerificationRequired = Boolean(cloudBackupIncluded && isOnline && customerSession.checked && !customerSession.authenticated && !vaultSessionCheckFailed);
  const vaultCloudAccessPaused = Boolean(cloudBackupIncluded && isOnline && customerSession.checked && customerSession.authenticated && customerSession.cloudAccess === false);
  const vaultSafetyLabel = !isOnline
    ? 'Offline'
    : !cloudBackupIncluded
      ? 'Local only'
      : vaultSessionChecking
        ? 'Checking...'
        : vaultSessionCheckFailed
          ? 'Check needed'
          : vaultVerificationRequired
            ? 'Verify device'
            : vaultCloudAccessPaused
              ? 'Cloud paused'
              : syncing || syncSafety.state === 'backing-up'
                ? 'Saving...'
                : syncSafety.conflict
                  ? 'Review vault'
                  : syncSafety.pending
                    ? 'Backup pending'
                    : syncSafety.state === 'unknown'
                      ? 'Not checked'
                      : 'Up to date';
  const vaultSafetyClass = !isOnline
    ? 'offline'
    : !cloudBackupIncluded
      ? 'plan-local-only'
      : vaultSessionChecking
        ? 'syncing'
        : vaultSessionCheckFailed
          ? 'check-failed'
          : vaultVerificationRequired
            ? 'verification'
            : vaultCloudAccessPaused
              ? 'pending'
              : syncing || syncSafety.state === 'backing-up'
                ? 'syncing'
                : syncSafety.conflict
                  ? 'conflict'
                  : syncSafety.pending
                    ? 'pending'
                    : syncSafety.state === 'unknown'
                      ? 'unknown'
                      : 'safe';
  const vaultSafetyIcon = !isOnline
    ? <Cloud size={22} />
    : !cloudBackupIncluded
      ? <Database size={22} />
      : vaultSessionChecking || syncing || syncSafety.state === 'backing-up'
        ? <RefreshCw size={22} className="sync-button-spinner" />
        : vaultSessionCheckFailed || vaultVerificationRequired || vaultCloudAccessPaused || syncSafety.conflict || syncSafety.pending
          ? <AlertTriangle size={22} />
          : syncSafety.state === 'unknown'
            ? <Cloud size={22} />
            : <ShieldCheck size={22} />;

  const vaultStatusDetails = vaultSafetyClass === 'safe'
    ? null
    : !isOnline
      ? {
          mode: hasLocalVault ? 'offline-saved' : 'offline',
          title: 'You are offline',
          message: hasLocalVault
            ? 'Your encrypted vault saved on this device remains available. Secure backup and syncing will resume automatically when the internet connection returns.'
            : 'Reconnect to verify this device or restore an existing secure vault copy.'
        }
      : !cloudBackupIncluded
        ? {
            mode: 'status-info',
            title: 'This vault is stored locally',
            message: 'Your vault remains encrypted on this device. Cloud backup and access from another verified device are not included in the current plan.'
          }
        : vaultSessionChecking
          ? {
              mode: 'status-info',
              title: 'Checking this device',
              message: 'Password-Encrypt is checking whether this device still has an active verified session.'
            }
          : vaultSessionCheckFailed
            ? {
                mode: 'status-check',
                title: 'Device status needs checking',
                message: 'Password-Encrypt could not confirm the current device session. Try the check again. If verification is genuinely required, Vault Status will tell you.',
                action: 'session-check'
              }
            : vaultVerificationRequired
              ? {
                  mode: 'verification-required',
                  title: 'Verify this device',
                  message: customerSession.message || 'Verify this device before secure backup and syncing can continue.'
                }
              : vaultCloudAccessPaused
                ? {
                    mode: 'status-info',
                    title: 'Cloud backup is paused',
                    message: customerSession.message || 'This device is verified, but cloud backup and syncing are currently paused for the account.'
                  }
                : syncing || syncSafety.state === 'backing-up'
                  ? {
                      mode: 'status-info',
                      title: 'Vault backup is in progress',
                      message: 'Password-Encrypt is securely protecting the latest changes from this device. Keep the app open until the status updates.'
                    }
                  : syncSafety.conflict
                    ? {
                        mode: 'conflict-reminder',
                        title: 'Different vault changes need review',
                        message: 'Two different vault copies were found. Compare them now and choose the copy that should become current.'
                      }
                    : syncSafety.pending
                      ? {
                          mode: syncSafety.sessionRequired ? 'verification-required' : 'backup-failed',
                          title: syncSafety.sessionRequired ? 'Verify this device to finish backup' : 'Your latest changes still need backup',
                          message: syncSafety.message || (syncSafety.sessionRequired ? 'Verify this device to finish backing up your latest changes.' : 'Your latest changes are safe on this device but are not yet available elsewhere.')
                        }
                      : {
                          mode: 'status-check',
                          title: 'Check vault safety now',
                          message: 'Password-Encrypt has not confirmed the latest protected vault copy yet. Run the check now.',
                          action: 'vault-check'
                        };

  async function openVaultStatusDetails() {
    if (vaultSafetyClass === 'safe') {
      openVaultSafetySettings();
      return;
    }
    if (vaultVerificationRequired) {
      openDeviceVerification();
      return;
    }
    if (syncSafety.conflict) {
      if (syncSafetyModal.details?.latest?.snapshot) {
        setSyncSafetyModal((current) => ({
          ...current,
          visible: true,
          mode: 'conflict',
          title: 'Choose the current vault copy',
          message: 'Two different vault copies were found. The newer recorded copy is marked Recommended. Tap the copy you want to keep.'
        }));
        return;
      }
      await refreshVaultAndBackup();
      return;
    }
    setSyncSafetyModal({
      visible: true,
      mode: vaultStatusDetails.mode,
      title: vaultStatusDetails.title,
      message: vaultStatusDetails.message,
      details: { itemCount: syncSafety.itemCount, action: vaultStatusDetails.action || '' }
    });
  }

  function suggestStrongItemPassword() {
    const suggestion = generateStrongPassword(18);
    setItemCredentialFieldsArmed((current) => ({ ...current, password: true }));
    setForm((current) => ({ ...current, password: suggestion }));
    setShowFormSecret(true);
    showMessage('Strong password suggested inside the app.', 'success');
  }

  return (
    <main className="app-shell">
      <header className="topbar app-home-topbar">
        <div className="topbar-title-block">
          <p className="eyebrow">Secure private vault</p>
          <h1 className="vault-home-title">{bootstrap.accountName || bootstrap.tenantName || 'Private Vault'}</h1>
        </div>
        <button type="button" className="mobile-top-menu-button" onClick={() => setMobileHeaderMenuOpen((open) => !open)} aria-label="Open vault menu" aria-expanded={mobileHeaderMenuOpen ? 'true' : 'false'}><MoreHorizontal size={22} /></button>
        <div className="topbar-actions">
          <div className={`topbar-sync-button ${vaultSafetyClass}`} role="group" aria-label={`Vault Safety: ${vaultSafetyLabel}`}>
            <button type="button" className="topbar-sync-main" onClick={openVaultStatusDetails} aria-label={`Open Vault Status. Current status: ${vaultSafetyLabel}.`}>
              <span className="topbar-sync-icon" aria-hidden="true">{vaultSafetyIcon}</span>
              <span className="topbar-sync-copy"><small>Vault status</small><strong>{vaultSafetyLabel}</strong></span>
            </button>
            <button type="button" className={`topbar-sync-detail ${vaultStatusDetails ? 'has-details' : 'complete'}`} onClick={openVaultStatusDetails} aria-label={vaultStatusDetails ? `Fix ${vaultSafetyLabel} status` : 'Open Vault Safety'} title={vaultStatusDetails ? 'Open Vault Status fix' : 'Open Vault Safety'}>
              {vaultStatusDetails ? <FileText size={18} /> : <Check size={19} />}
            </button>
          </div>
          <button type="button" className="mobile-vault-refresh-button" onClick={refreshVaultAndBackup} disabled={syncing} aria-label="Refresh vault and back up changes" title="Refresh vault and back up changes"><RefreshCw size={20} className={syncing ? 'sync-button-spinner' : ''} /></button>
          <button type="button" className={activePage === 'settings' && activeSettingsSection === 'faq' ? 'topbar-help-button active' : 'topbar-help-button'} onClick={openFaqSettings} aria-label="Open frequently asked questions" title="Help and FAQs"><CircleHelp size={20} /></button>
          <button type="button" className={activePage === 'home' ? 'nav-pill vault-nav-pill active' : 'nav-pill vault-nav-pill'} onClick={() => setActivePage('home')}><KeyRound size={17} /> Vault</button>
          <button type="button" className={activePage === 'settings' ? 'nav-pill settings-nav-pill active' : 'nav-pill settings-nav-pill'} onClick={openSettingsHome}><Settings size={17} /> Settings</button>
          <button className="lock-button desktop-lock-button" onClick={() => lockVault()}><Lock size={18} /> Lock</button>
        </div>
        {mobileHeaderMenuOpen && <>
          <button type="button" className="mobile-header-menu-backdrop" onClick={() => setMobileHeaderMenuOpen(false)} aria-label="Close vault menu" />
          <nav className="mobile-header-menu" aria-label="Vault menu">
            <button type="button" className={activePage === 'home' ? 'active' : ''} onClick={() => { setMobileHeaderMenuOpen(false); setActivePage('home'); }}><KeyRound size={19} /><span>Vault home</span></button>
            <button type="button" className={activePage === 'settings' && activeSettingsSection === 'faq' ? 'active' : ''} onClick={() => { setMobileHeaderMenuOpen(false); openFaqSettings(); }}><CircleHelp size={19} /><span>Help & FAQs</span></button>
            <button type="button" className={activePage === 'settings' && activeSettingsSection !== 'faq' ? 'active' : ''} onClick={() => { setMobileHeaderMenuOpen(false); openSettingsHome(); }}><Settings size={19} /><span>Settings</span></button>
            <button type="button" className="lock-menu-item" onClick={() => { setMobileHeaderMenuOpen(false); lockVault(); }}><Lock size={19} /><span>Lock vault</span></button>
          </nav>
        </>}
      </header>


      {!isOnline && activePage !== 'home' && <NetworkStatusNotice context="vault" hasLocalVault />}



      {activePage === 'home' ? (
        <>
          <section className="home-search-panel">
            <div className="search-box hero-search"><Search size={19} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your vault" /></div>
            <div className="chip-row vault-folder-row" id="vault-list-section">
              {folderChips.map((folder) => {
                const isDragging = draggedFolderName === folder.name || touchReorderFolder === folder.name;
                const isDropTarget = touchDropTargetFolder === folder.name && (touchReorderFolder || draggedFolderName) && (touchReorderFolder || draggedFolderName) !== folder.name;
                return (
                  <button
                    key={`desktop-${folder.name}`}
                    type="button"
                    data-folder-name={folder.name}
                    draggable={!folder.fixed}
                    className={`${folder.name === category ? 'chip desktop-folder-chip active' : 'chip desktop-folder-chip'}${folder.fixed ? ' fixed-folder-chip' : ''}${isDragging ? ' folder-dragging' : ''}${isDropTarget ? ' folder-drop-target' : ''}`}
                    onClick={() => !touchReorderFolder && !draggedFolderName && openVaultSection(folder.name)}
                    onDragStart={(event) => { if (folder.fixed || window.matchMedia?.('(max-width: 860px)').matches) { event.preventDefault(); return; } setDraggedFolderName(folder.name); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', folder.name); }}
                    onDragEnter={() => { if (draggedFolderName && !folder.fixed) setTouchDropTargetFolder(folder.name); }}
                    onDragOver={(event) => { if (draggedFolderName && !folder.fixed) event.preventDefault(); }}
                    onDrop={async (event) => { event.preventDefault(); const source = draggedFolderName || event.dataTransfer.getData('text/plain'); setDraggedFolderName(''); setTouchDropTargetFolder(''); await reorderFolder(source, folder.name); }}
                    onDragEnd={() => { setDraggedFolderName(''); setTouchDropTargetFolder(''); }}
                  >
                    {folder.name}
                    {folder.custom && <span className="custom-folder-dot" title="Custom folder" aria-hidden="true" />}
                    <span className="chip-count">{folder.count}</span>
                  </button>
                );
              })}
              {mobileFolderChips.map((folder) => {
                const isDragging = touchReorderFolder === folder.name;
                const isDropTarget = touchDropTargetFolder === folder.name && touchReorderFolder && touchReorderFolder !== folder.name;
                return (
                  <button
                    key={`mobile-${folder.name}`}
                    type="button"
                    data-folder-name={folder.name}
                    className={`${folder.name === category ? 'chip mobile-folder-chip active' : 'chip mobile-folder-chip'}${folder.fixed ? ' fixed-folder-chip' : ''}${isDragging ? ' folder-dragging' : ''}${isDropTarget ? ' folder-drop-target' : ''}`}
                    onClick={() => !touchReorderFolder && openVaultSection(folder.name)}
                    onTouchStart={(event) => startTouchFolderReorder(folder.name, event)}
                    onTouchMove={moveTouchFolderReorder}
                    onTouchEnd={endTouchFolderReorder}
                    onTouchCancel={endTouchFolderReorder}
                  >
                    <span className="folder-chip-label">{folder.name}</span>
                    {folder.custom && <span className="custom-folder-dot" title="Custom folder" aria-hidden="true" />}
                    <span className="chip-count">{folder.count}</span>
                  </button>
                );
              })}
            </div>
            <div className="home-quick-summary">
              <span><strong>{visibleItems.length}</strong> Item{visibleItems.length === 1 ? '' : 's'}</span>
              <button type="button" className={`summary-action favourite-summary-pill ${category === FAVOURITES_VIEW ? 'active' : ''}`} onClick={() => { setQuery(''); openVaultSection(FAVOURITES_VIEW); }} aria-label="Show all favourite items"><Star size={14} fill="currentColor" /><strong>{visibleItems.filter((item) => item.favourite).length}</strong> {visibleItems.filter((item) => item.favourite).length === 1 ? 'Favourite' : 'Favourites'}</button>
              <div className="folder-action-group">
                <button type="button" className="summary-action add-folder-chip" onClick={() => setIsFolderPopupOpen(true)}><Plus size={14} /> New folder</button>
                <button type="button" className="premium-more-folder-button" onClick={() => setIsFolderListPopupOpen(true)} aria-label="Manage folders"><MoreHorizontal size={21} /></button>
              </div>
            </div>
          </section>

          <button type="button" className="floating-add-button" onClick={openAddItem} aria-label="Add item" title="Add item"><Plus size={28} /></button>


          {isFolderListPopupOpen && (
            <div className="item-popup-layer folder-list-popup-layer" role="dialog" aria-modal="true" aria-label="Manage folders">
              <button type="button" className="item-popup-backdrop" onClick={() => setIsFolderListPopupOpen(false)} aria-label="Close folder management" />
              <div className="item-popup-card folder-list-popup-card">
                <div className="item-popup-header">
                  <h2>Manage folders</h2>
                  <button type="button" className="icon-button" onClick={() => setIsFolderListPopupOpen(false)} aria-label="Close"><X size={18} /></button>
                </div>
                <div className="item-popup-body folder-list-popup-body">
                  <p className="folder-list-popup-note"><Home size={16} /> Highlight folders for the home page. Use the pencil to rename or delete a custom folder.</p>
                  <div className="vault-result-list folder-list-popup-list">
                    {folderChips.map((folder) => {
                      const isDragging = touchReorderFolder === folder.name;
                      const isDropTarget = touchDropTargetFolder === folder.name && touchReorderFolder && touchReorderFolder !== folder.name;
                      const isHomeFolder = folder.name === 'All' || folder.folderFavourite;
                      return (
                        <div
                          key={folder.name}
                          data-folder-name={folder.name}
                          className={`${folder.name === category ? 'vault-result-row folder-picker-row active' : 'vault-result-row folder-picker-row'}${isDragging ? ' folder-dragging' : ''}${isDropTarget ? ' folder-drop-target' : ''}`}
                          onTouchStart={(event) => startTouchFolderReorder(folder.name, event)}
                          onTouchMove={moveTouchFolderReorder}
                          onTouchEnd={endTouchFolderReorder}
                          onTouchCancel={endTouchFolderReorder}
                        >
                          <button type="button" className="folder-picker-main" onClick={() => !touchReorderFolder && openVaultSection(folder.name)}>
                            <span className="vault-result-name folder-picker-name">{folder.name}</span>
                          </button>
                          <div className="folder-picker-actions">
                            {folder.custom
                              ? <button type="button" className="folder-manage-button" onClick={(event) => { event.stopPropagation(); openFolderManager(folder); }} aria-label={`Rename or delete ${folder.name}`} title="Rename or delete folder"><Pencil size={17} /></button>
                              : <span className="folder-manage-placeholder" aria-hidden="true" />}
                            <span className="folder-picker-count" aria-label={`${folder.count} item${folder.count === 1 ? '' : 's'}`}>{folder.count}</span>
                            <button
                              type="button"
                              className={isHomeFolder ? 'folder-home-button active' : 'folder-home-button'}
                              onClick={(event) => { event.stopPropagation(); if (folder.name !== 'All') toggleFolderFavourite(folder.name); }}
                              disabled={folder.name === 'All'}
                              aria-label={folder.name === 'All' ? 'All passwords always stays in home folders' : isHomeFolder ? `Remove ${folder.name} from home folders` : `Highlight ${folder.name} as a home folder`}
                            >
                              <Home size={18} fill={isHomeFolder ? 'currentColor' : 'none'} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {folderManager.visible && (
            <div className="item-popup-layer folder-manager-popup-layer" role="dialog" aria-modal="true" aria-labelledby="folder-manager-title">
              <button type="button" className="item-popup-backdrop" onClick={folderManager.busy ? undefined : closeFolderManager} aria-label="Close folder management" />
              <form className="item-popup-card folder-manager-popup-card" onSubmit={renameCustomFolder}>
                <div className="item-popup-header">
                  <h2 id="folder-manager-title"><Pencil size={20} /> Edit folder</h2>
                  <button type="button" className="icon-button" onClick={closeFolderManager} disabled={folderManager.busy} aria-label="Close"><X size={18} /></button>
                </div>
                <div className="item-popup-body folder-manager-popup-body">
                  <label>Folder name<input value={folderManager.name} onChange={(event) => setFolderManager((current) => ({ ...current, name: event.target.value, confirmDelete: false, message: '' }))} placeholder="Folder name" /></label>
                  <div className="folder-manager-summary"><FileText size={18} /><span><strong>{folderManager.itemCount} item{folderManager.itemCount === 1 ? '' : 's'} in this folder</strong><small>Renaming keeps every item in the folder.</small></span></div>
                  {folderManager.confirmDelete && <div className="folder-delete-warning"><AlertTriangle size={20} /><span><strong>Delete this custom folder?</strong><small>No passwords will be deleted. Its items will move safely to the Passwords folder.</small></span></div>}
                  {folderManager.message && <div className="account-modal-message">{folderManager.message}</div>}
                </div>
                <div className="item-popup-footer folder-manager-popup-footer">
                  <button type="button" className={folderManager.confirmDelete ? 'secondary-button danger-soft' : 'secondary-button'} onClick={deleteCustomFolder} disabled={folderManager.busy}><Trash2 size={16} /> {folderManager.confirmDelete ? 'Confirm delete folder' : 'Delete folder'}</button>
                  <button type="submit" className="primary-button" disabled={folderManager.busy}>{folderManager.busy ? 'Saving...' : 'Save folder name'}</button>
                </div>
              </form>
            </div>
          )}

          {isItemPopupOpen && (
            <div className="item-popup-layer" role="dialog" aria-modal="true" aria-label={editingItemId ? 'Edit item' : 'Add item'}>
              <button type="button" className="item-popup-backdrop" onClick={closeItemPopup} aria-label="Close add item popup" />
              <form className={editingItemId ? "item-form item-popup-card edit-mode" : "item-form item-popup-card"} onSubmit={saveItem} autoComplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true">
                <div className="item-popup-header">
                  <h2>{editingItemId ? <Pencil size={20} /> : <Plus size={20} />} {editingItemId ? 'Edit item' : 'Add item'}</h2>
                  <button type="button" className="icon-button" onClick={closeItemPopup} aria-label="Close"><X size={18} /></button>
                </div>
                <div className="item-popup-body">
                  <p className="form-helper">{editingItemId ? 'Update the saved details, then save your changes.' : 'Save a new secure item in your vault.'}</p>
                  {editingItemId && <div className="edit-banner"><Pencil size={16} /><span>Editing existing item. Save updates or cancel without changing the vault.</span></div>}
                <label>Folder<CustomSelect value={form.category} ariaLabel="Choose a vault folder" options={selectableFolders.map((cat) => ({ value: cat, label: cat }))} onChange={(nextCategory) => setForm({ ...form, category: nextCategory, username: ['Notes', 'Checklists', DOCUMENTS_CATEGORY, PICTURES_CATEGORY, CARDS_CATEGORY].includes(nextCategory) ? '' : form.username, password: ['Notes', 'Checklists', DOCUMENTS_CATEGORY, PICTURES_CATEGORY, CARDS_CATEGORY].includes(nextCategory) ? '' : form.password })} /></label>
                {form.category === CARDS_CATEGORY ? (
                  <div className="card-entry-grid">
                    <label>Name on card<input value={form.cardName} onChange={(e) => setForm({ ...form, cardName: e.target.value })} placeholder="e.g. B Hallam" /></label>
                    <label>Card nickname<input value={form.cardNickname} onChange={(e) => setForm({ ...form, cardNickname: e.target.value, title: e.target.value })} placeholder="e.g. Personal Visa, Business card" /></label>
                    <label>16 digit card number<input inputMode="numeric" autoComplete="cc-number" value={formatCardNumber(form.cardNumber)} onChange={(e) => setForm({ ...form, cardNumber: onlyDigits(e.target.value).slice(0, 16) })} placeholder="0000 0000 0000 0000" maxLength="19" /></label>
                    <div className="card-entry-two">
                      <label>Expiry<input inputMode="numeric" autoComplete="cc-exp" value={form.cardExpiry} onChange={(e) => setForm({ ...form, cardExpiry: e.target.value })} placeholder="MM/YY" /></label>
                      <label>CCV<input inputMode="numeric" autoComplete="cc-csc" value={form.cardCcv} onChange={(e) => setForm({ ...form, cardCcv: onlyDigits(e.target.value).slice(0, 4) })} placeholder="123" maxLength="4" /></label>
                    </div>
                  </div>
                ) : (
                  <>
                    <label>Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={activeHint.title} /></label>
                    {!['Checklists', DOCUMENTS_CATEGORY, PICTURES_CATEGORY].includes(form.category) && <label>URL / Link<input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder={activeHint.url} /></label>}
                    {!['Notes', 'Checklists', DOCUMENTS_CATEGORY, PICTURES_CATEGORY].includes(form.category) && (
                      <>
                        <label>Username / Reference<input name="vault-item-reference" autoComplete="off" spellCheck="false" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" readOnly={!editingItemId && !itemCredentialFieldsArmed.username} onPointerDown={() => setItemCredentialFieldsArmed((current) => ({ ...current, username: true }))} onFocus={() => setItemCredentialFieldsArmed((current) => ({ ...current, username: true }))} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder={activeHint.username} /></label>
                        <label>Password / Secret
                          <div className="secret-input-row">
                            <input name="vault-item-secret-entry" className={showFormSecret ? 'item-secret-entry is-visible' : 'item-secret-entry is-concealed'} type="text" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck="false" inputMode="text" aria-autocomplete="none" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" data-protonpass-ignore="true" data-form-type="other" readOnly={!editingItemId && !itemCredentialFieldsArmed.password} onPointerDown={() => setItemCredentialFieldsArmed((current) => ({ ...current, password: true }))} onFocus={() => setItemCredentialFieldsArmed((current) => ({ ...current, password: true }))} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={activeHint.secret} />
                            <div className="secret-input-actions">
                              <button type="button" className="mini-button secret-generate-button" onClick={suggestStrongItemPassword}><Sparkles size={13} /> <span>Suggest</span></button>
                              <button type="button" className="mini-button" onClick={() => setShowFormSecret(!showFormSecret)} aria-label={showFormSecret ? 'Hide password' : 'Show password'}>{showFormSecret ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                            </div>
                          </div>
                        </label>
                      </>
                    )}
                  </>
                )}
                {form.category === DOCUMENTS_CATEGORY && (
                  <div className="document-upload-box">
                    <label className="document-upload-button"><Upload size={18} /> Choose document
                      <input type="file" accept=".txt,.md,.csv,.xls,.xlsx,.doc,.docx,.pdf,text/plain,text/markdown,text/csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleDocumentFileChange} />
                    </label>
                    <p>Supported files: TXT, MD, CSV, Excel, Word and PDF. File contents are encrypted and stored separately to keep your vault fast.</p>
                    <p className="document-upload-note">Files up to {formatFileSize(MAX_DOCUMENT_BYTES)} are supported. Larger documents may take a little longer to encrypt, upload and download.</p>
                    {form.file && <div className="document-selected"><FileText size={18} /><span>{form.file.name}</span><small>{formatFileSize(form.file.size)}</small></div>}
                  </div>
                )}
                {form.category === PICTURES_CATEGORY && (
                  <div className="document-upload-box picture-upload-box">
                    <label className="document-upload-button"><ImageIcon size={18} /> Choose picture
                      <input type="file" accept=".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={handlePictureFileChange} />
                    </label>
                    <p>Designed for photo IDs, passports, licences and other important pictures. The picture is encrypted before it leaves this device.</p>
                    <p className="document-upload-note">JPG, JPEG, PNG, WEBP, HEIC and HEIF are supported. Maximum {formatFileSize(MAX_PICTURE_BYTES)} per picture.</p>
                    {form.file && <div className="document-selected picture-selected"><ImageIcon size={18} /><span>{form.file.name}</span><small>{formatFileSize(form.file.size)}</small>{form.file.dataUrl && <img src={form.file.dataUrl} alt="Selected encrypted picture preview" />}</div>}
                  </div>
                )}
                <label>{form.category === 'Checklists' ? 'Checklist items' : form.category === DOCUMENTS_CATEGORY ? 'Document notes' : form.category === PICTURES_CATEGORY ? 'Picture notes' : form.category === CARDS_CATEGORY ? 'Card notes' : 'Notes'}<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={activeHint.notes} rows="6" /></label>
                <label className="favourite-toggle"><input type="checkbox" checked={form.favourite} onChange={(e) => setForm({ ...form, favourite: e.target.checked })} /> Mark as favourite</label>
                </div>
                <div className="item-popup-footer form-buttons">
                  <button type="submit" className={isSavingItem ? "primary-button saving-button" : "primary-button"} disabled={isSavingItem} aria-busy={isSavingItem ? 'true' : 'false'}>
                    {isSavingItem ? <span className="button-spinner" aria-hidden="true" /> : <ShieldCheck size={18} />}
                    {isSavingItem ? (editingItemId ? 'Saving updates...' : 'Saving item...') : (editingItemId ? 'Save updated item' : 'Save encrypted item')}
                  </button>
                  <button type="button" className="secondary-button" onClick={closeItemPopup}>{editingItemId ? <><X size={16} /> Cancel edit</> : 'Cancel'}</button>
                </div>
              </form>
            </div>
          )}

          {isFolderPopupOpen && (
            <div className="item-popup-layer" role="dialog" aria-modal="true" aria-label="Create folder">
              <button type="button" className="item-popup-backdrop" onClick={closeFolderPopup} aria-label="Close folder popup" />
              <form className="item-popup-card folder-popup-card" onSubmit={createCustomFolder}>
                <div className="item-popup-header">
                  <h2><Plus size={20} /> New folder</h2>
                  <button type="button" className="icon-button" onClick={closeFolderPopup} aria-label="Close"><X size={18} /></button>
                </div>
                <div className="item-popup-body">
                  <p className="form-helper">Create your own folder and it will appear in the folder row above.</p>
                  <label>Folder name<input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="e.g. Family, Travel, Clients" /></label>
                  <div className="folder-popup-note"><ShieldCheck size={16} /><span>Folder names are saved inside your encrypted vault backup.</span></div>
                </div>
                <div className="item-popup-footer form-buttons">
                  <button type="submit" className={isSavingFolder ? "primary-button saving-button" : "primary-button"} disabled={isSavingFolder} aria-busy={isSavingFolder ? 'true' : 'false'}>
                    {isSavingFolder ? <span className="button-spinner" aria-hidden="true" /> : <Plus size={18} />}
                    {isSavingFolder ? 'Creating folder...' : 'Create folder'}
                  </button>
                  <button type="button" className="secondary-button" onClick={closeFolderPopup}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          <section className="vault-results-panel full-vault-list">
            {!hasActiveVaultFilter && <div className="empty-state">Search your vault or choose a folder to view saved items.</div>}
            {hasActiveVaultFilter && !!filteredItems.length && (
              <div className="vault-result-list" aria-label="Vault results">
                {filteredItems.map((item) => (
                  <button type="button" className="vault-result-row" key={item.id} onClick={() => openViewItem(item)} title={`Open ${item.title}`}>
                    <span className="vault-result-copy">
                      <span className="vault-result-name">{item.category === CARDS_CATEGORY ? (item.payload?.cardNickname || item.title) : item.title}</span>
                      {item.category === CARDS_CATEGORY && <span className="vault-result-subline">{item.payload?.cardName || 'Name on card not saved'}</span>}
                    </span>
                    <span className="vault-result-open" aria-hidden="true"><ExternalLink size={17} /></span>
                  </button>
                ))}
              </div>
            )}
            {hasActiveVaultFilter && !filteredItems.length && <div className="empty-state">No vault items match that search or folder.</div>}
          </section>
        </>
      ) : (
        <section className="settings-page settings-page-v040">
          {activeSettingsSection === 'overview' && (
            <>
              <div className="settings-header-card settings-directory-header">
                <p className="eyebrow">Settings</p>
                <h2><Settings size={22} /> Your vault settings</h2>
                <p>Choose a section to manage your account, protection, Emergency Access or help.</p>
              </div>

              <nav className="settings-directory" aria-label="Settings sections">
                <section className="settings-directory-group" aria-labelledby="settings-account-group">
                  <p className="settings-directory-label" id="settings-account-group">Account and device</p>
                  <button type="button" className="settings-directory-row" onClick={() => openSettingsSection('account')}>
                    <span className="settings-directory-icon"><UserRoundCheck size={22} /></span>
                    <span className="settings-directory-copy"><strong>My Account</strong><small>Contact details, plan and device verification.</small></span>
                    <span className="settings-directory-meta">{planDisplayName(bootstrap.planCode)}</span>
                    <ChevronRight size={21} className="settings-directory-chevron" aria-hidden="true" />
                  </button>
                  <button type="button" className="settings-directory-row" onClick={openSubscriptionSettings}>
                    <span className="settings-directory-icon"><CreditCard size={22} /></span>
                    <span className="settings-directory-copy"><strong>My Subscription</strong><small>Choose billing, manage payments and view renewal status.</small></span>
                    <span className={`settings-directory-state ${['past_due', 'unpaid'].includes(String(billing.subscription?.status || '').toLowerCase()) ? 'attention' : 'safe'}`}>{isFounderPlan(bootstrap) ? 'Founder' : subscriptionLifecycleLabel(billing.subscription || customerSession.subscription, bootstrap)}</span>
                    <ChevronRight size={21} className="settings-directory-chevron" aria-hidden="true" />
                  </button>
                  <button type="button" className="settings-directory-row" onClick={() => openSettingsSection('safety')}>
                    <span className="settings-directory-icon"><ShieldCheck size={22} /></span>
                    <span className="settings-directory-copy"><strong>Vault Safety</strong><small>Backup, syncing, device protection and recovery.</small></span>
                    <span className={`settings-directory-state ${!featureIncluded('cloudBackupSync') ? '' : vaultVerificationRequired || vaultSessionCheckFailed || vaultCloudAccessPaused || syncSafety.conflict || syncSafety.pending ? 'attention' : 'safe'}`}>{!featureIncluded('cloudBackupSync') ? 'Local only' : vaultSessionCheckFailed ? 'Check needed' : vaultVerificationRequired ? 'Verify device' : vaultCloudAccessPaused ? 'Cloud paused' : syncSafety.conflict ? 'Review' : syncSafety.pending ? 'Action needed' : syncSafety.state === 'unknown' ? 'Check' : 'Up to date'}</span>
                    <ChevronRight size={21} className="settings-directory-chevron" aria-hidden="true" />
                  </button>
                  <button type="button" className="settings-directory-row" onClick={() => openSettingsSection('notifications')}>
                    <span className="settings-directory-icon"><Bell size={22} /></span>
                    <span className="settings-directory-copy"><strong>Push Notifications</strong><small>Emergency Access alerts and important Password-Encrypt updates.</small></span>
                    <span className={`settings-directory-state ${pushNotifications.enabledThisDevice ? 'safe' : pushNotifications.permission === 'denied' ? 'attention' : ''}`}>{pushNotifications.enabledThisDevice ? 'Active' : pushNotifications.permission === 'denied' ? 'Blocked' : 'Off'}</span>
                    <ChevronRight size={21} className="settings-directory-chevron" aria-hidden="true" />
                  </button>
                </section>

                <section className="settings-directory-group" aria-labelledby="settings-protection-group">
                  <p className="settings-directory-label" id="settings-protection-group">Protection and recovery</p>
                  <button type="button" className="settings-directory-row" onClick={() => openSettingsSection('emergency-nominate')}>
                    <span className="settings-directory-icon"><UsersRound size={22} /></span>
                    <span className="settings-directory-copy"><strong>Emergency Access</strong><small>Nominate a trusted person to receive your prepared Emergency Package.</small></span>
                    <ChevronRight size={21} className="settings-directory-chevron" aria-hidden="true" />
                  </button>
                  <button type="button" className="settings-directory-row" onClick={() => openSettingsSection('emergency-receive')}>
                    <span className="settings-directory-icon"><KeyRound size={22} /></span>
                    <span className="settings-directory-copy"><strong>Emergency Access</strong><small>Receive an Emergency Package released to you.</small></span>
                    <ChevronRight size={21} className="settings-directory-chevron" aria-hidden="true" />
                  </button>
                </section>

                <section className="settings-directory-group" aria-labelledby="settings-help-group">
                  <p className="settings-directory-label" id="settings-help-group">Help and support</p>
                  <button type="button" className="settings-directory-row" onClick={openFaqSettings}>
                    <span className="settings-directory-icon"><CircleHelp size={22} /></span>
                    <span className="settings-directory-copy"><strong>Help & FAQs</strong><small>Guidance for vault access, backups, devices and support.</small></span>
                    <ChevronRight size={21} className="settings-directory-chevron" aria-hidden="true" />
                  </button>
                </section>
              </nav>
            </>
          )}

          {activeSettingsSection !== 'overview' && (
            <div className="settings-subpage-nav">
              <button type="button" onClick={openSettingsHome}><ArrowLeft size={18} /> Back to Settings</button>
            </div>
          )}

          {activeSettingsSection === 'account' && (
            <section className="settings-section-panel settings-account-panel" aria-label="My Account">
              <div className="settings-section-heading">
                <p className="eyebrow">My Account</p>
                <h3><UserRoundCheck size={20} /> Account details</h3>
                <p>Keep your account details up to date so you can verify your vault on another device.</p>
              </div>

              <div className="settings-drilldown-stack">
                <details className="settings-drilldown">
                  <summary><span className="settings-directory-icon"><UsersRound size={21} /></span><span className="settings-directory-copy"><strong>Account overview</strong><small>Plan, account status and verification summary.</small></span><ChevronRight size={21} className="settings-directory-chevron" /></summary>
                  <div className="settings-drilldown-content">
              <section className="saas-account-card settings-inner-card">
                <div>
                  <p className="eyebrow">Account status</p>
                  <h2><UsersRound size={21} /> Plan and account</h2>
                  <p>Your vault remains protected by your master password. These details identify your account and plan.</p>
                </div>
                <div className="saas-account-grid">
                  <span><strong>Account</strong>{bootstrap.accountName || bootstrap.tenantName || 'Private Vault'}</span>
                  <span><strong>Plan</strong>{planDisplayName(bootstrap.planCode)}</span>
                  <span><strong>Status</strong>{planStatusDisplayName(bootstrap.planStatus, bootstrap.accountStatus)}</span>
                  <span><strong>Role</strong>{tenantRoleDisplayName(bootstrap.tenantRole)}</span>
                  {!isFounderPlan(bootstrap) && <span><strong>Trial started</strong>{formatAccountDate(bootstrap.trialStartedAt, true)}</span>}
                  {!isFounderPlan(bootstrap) && <span><strong>Trial ends</strong>{formatAccountDate(bootstrap.trialEndsAt, true)}</span>}
                  {!isFounderPlan(bootstrap) && <span><strong>Time remaining</strong>{bootstrap.trialEndsAt ? `${accountTrialDaysRemaining(bootstrap.trialEndsAt)} day${accountTrialDaysRemaining(bootstrap.trialEndsAt) === 1 ? '' : 's'}` : 'No active trial'}</span>}
                  {isFounderPlan(bootstrap) && <span><strong>Access</strong>Permanent Founder access</span>}
                </div>
                {!isFounderPlan(bootstrap) && bootstrap.accountStatus === 'trial_expired' && <div className="trial-expired-card"><AlertTriangle size={18} /><span><strong>Your free trial has ended</strong><small>Your local encrypted vault remains available. Cloud backup, syncing, encrypted document storage and encrypted picture storage are paused until the account is activated.</small></span></div>}
              </section>

              <div className={`account-status-card ${accountStatus.state}`}>
                <div className="account-status-heading"><Phone size={18} /><strong>Verification details</strong></div>
                <span>{accountStatus.message}</span>
                <small>Phone: {maskPhone(accountSecurity.user?.phoneE164 || bootstrap.phoneE164 || buildPhoneE164(bootstrap.phoneCountryCode, bootstrap.phoneNumber)) || 'not set'}{(accountSecurity.user?.email || bootstrap.email) ? ` · Email: ${maskEmail(accountSecurity.user?.email || bootstrap.email)}` : ''}</small>
              </div>

                  </div>
                </details>

                <details className="settings-drilldown">
                  <summary><span className="settings-directory-icon"><Mail size={21} /></span><span className="settings-directory-copy"><strong>Contact details & recovery</strong><small>Email recovery plus the mobile contact number saved on your account.</small></span><ChevronRight size={21} className="settings-directory-chevron" /></summary>
                  <div className="settings-drilldown-content">
              <section className="account-contact-card settings-inner-card">
                <div className="account-management-heading"><div><p className="eyebrow">Verified contact details</p><h3>Account recovery contacts</h3></div>{customerSession.authenticated && <button type="button" className="icon-button" onClick={() => loadAccountSecurity()} disabled={accountSecurity.loading} aria-label="Refresh account security"><RefreshCw size={18} className={accountSecurity.loading ? 'is-rotating' : ''} /></button>}</div>
                <p>Email and mobile changes are completed only after a one-time code verifies the new contact detail. A verified mobile number can be used for Password-Encrypt account security features as SMS rollout is enabled.</p>
                <div className="account-contact-list">
                  <article><span className="account-contact-icon"><Mail size={20} /></span><div><strong>{accountSecurity.user?.email || bootstrap.email || 'Email not set'}</strong><small>{accountSecurity.user?.emailVerified === false ? 'Verification required' : 'Verified recovery email'}</small></div><button type="button" className="secondary-button" onClick={() => openAccountSecurityAction('change-email', { newEmail: accountSecurity.user?.email || bootstrap.email || '', verifyExisting: accountSecurity.user?.emailVerified === false })} disabled={!customerSession.authenticated}>{accountSecurity.user?.emailVerified === false ? 'Verify' : 'Change'}</button></article>
                  <article><span className="account-contact-icon"><Phone size={20} /></span><div><strong>{accountSecurity.user?.phoneMasked || maskPhone(bootstrap.phoneE164 || buildPhoneE164(bootstrap.phoneCountryCode, bootstrap.phoneNumber)) || 'Mobile not set'}</strong><small>{accountSecurity.user?.phoneVerified ? 'Verified mobile number' : 'Verification required'}</small></div>{SMS_MOBILE_CONTACT_VERIFICATION_ENABLED && <button type="button" className="secondary-button" onClick={() => openAccountSecurityAction('change-phone', { phoneCountryCode: accountSecurity.user?.phoneCountryCode || bootstrap.phoneCountryCode || '+254', phoneNumber: accountSecurity.user?.phoneNumber || bootstrap.phoneNumber || '', verifyExisting: accountSecurity.user?.phoneVerified === false })} disabled={!customerSession.authenticated}>{accountSecurity.user?.phoneVerified === false ? 'Verify' : accountSecurity.user?.phoneE164 ? 'Change' : 'Add'}</button>}</article>
                </div>
              </section>

                  </div>
                </details>

                <details className="settings-drilldown">
                  <summary><span className="settings-directory-icon"><MonitorSmartphone size={21} /></span><span className="settings-directory-copy"><strong>Devices & sessions</strong><small>Verify this device, review active devices and manage sessions.</small></span><ChevronRight size={21} className="settings-directory-chevron" /></summary>
                  <div className="settings-drilldown-content">
              <div className={`secure-session-card ${customerSession.authenticated ? 'active' : 'inactive'}`}>
                <div><ShieldCheck size={19} /><span><strong>{customerSession.authenticated ? 'Account session active' : 'Device verification required'}</strong><small>{customerSession.authenticated && accountSecurity.sessionExpiresAt ? `Renews securely during use · expires ${formatAccountDate(accountSecurity.sessionExpiresAt, true)}` : customerSession.message}</small></span></div>
                {customerSession.authenticated
                  ? <button type="button" className="secondary-button" onClick={endCustomerSession}>End this session</button>
                  : <button type="button" className="secondary-button" onClick={openDeviceVerification}>Verify this device</button>}
              </div>

              <section className="verified-devices-card settings-inner-card">
                <div className="account-management-heading"><div><p className="eyebrow">Verified devices</p><h3><MonitorSmartphone size={20} /> Devices and sessions</h3></div><span>{accountSecurity.devices.filter((device) => !device.revoked_at).length} active</span></div>
                <p>Remove a lost or old device to end every account session linked to it. This does not remotely erase an encrypted local vault copy already stored on that device.</p>
                {!customerSession.authenticated && <div className="account-security-empty">Verify this device to view and manage account devices.</div>}
                {customerSession.authenticated && accountSecurity.loading && <div className="account-security-empty">Loading verified devices...</div>}
                {customerSession.authenticated && !accountSecurity.loading && accountSecurity.devices.filter((device) => !device.revoked_at).map((device) => <article className={`verified-device-row ${device.current ? 'current' : ''}`} key={device.id}>
                  <span className="verified-device-icon"><MonitorSmartphone size={21} /></span>
                  <div><strong>{device.device_name || 'Verified device'}{device.current ? ' · This device' : ''}</strong><small>{device.platform || device.device_type || 'Browser'}{device.browser ? ` · ${device.browser}` : ''}</small><small>Last used {formatAccountDate(device.last_seen_at, true)} · {device.activeSessions} active session{device.activeSessions === 1 ? '' : 's'}</small></div>
                  <button type="button" className="secondary-button danger-soft" onClick={() => openAccountSecurityAction('remove-device', { deviceId: device.id, deviceName: device.device_name || 'this device' })}>Remove</button>
                </article>)}
                {customerSession.authenticated && !accountSecurity.loading && !accountSecurity.devices.filter((device) => !device.revoked_at).length && <div className="account-security-empty">No verified devices were found yet.</div>}
              </section>

                  </div>
                </details>

                <details className="settings-drilldown">
                  <summary><span className="settings-directory-icon"><UserRoundCheck size={21} /></span><span className="settings-directory-copy"><strong>Profile & personal information</strong><small>Update names, download account information and manage account-wide sessions.</small></span><ChevronRight size={21} className="settings-directory-chevron" /></summary>
                  <div className="settings-drilldown-content">
              <form className="bootstrap-grid settings-inner-card account-name-form" onSubmit={bootstrapAdmin}>
                <label>Display name<input value={bootstrap.displayName} onChange={(e) => setBootstrap({ ...bootstrap, displayName: e.target.value })} /></label>
                <label>Account name<input value={bootstrap.accountName || bootstrap.tenantName || ''} onChange={(e) => setBootstrap({ ...bootstrap, accountName: e.target.value, tenantName: e.target.value })} /></label>
                <div className="account-managed-field"><span>Plan</span><strong>{planDisplayName(bootstrap.planCode)}</strong><small>Plans and subscription status are controlled by verified billing events.</small></div>
                <div className="button-stack"><button type="submit" className="primary-button" disabled={syncing}><UserRoundCheck size={18} /> Save names</button></div>
              </form>

              <section className="account-data-actions settings-inner-card">
                <div className="account-management-heading"><div><p className="eyebrow">Account controls</p><h3>Sessions and personal information</h3></div></div>
                <button type="button" className="settings-tool-card" onClick={downloadAccountInformation} disabled={!customerSession.authenticated}><Download size={20} /><strong>Download personal account information</strong><span>Export account, subscription, device and activity information. Decrypted vault contents are not included.</span></button>
                <button type="button" className="settings-tool-card danger-account-action" onClick={() => openAccountSecurityAction('end-all-sessions')} disabled={!customerSession.authenticated}><ShieldCheck size={20} /><strong>End all account sessions</strong><span>Sign out every verified browser and device, including this one.</span></button>
              </section>

                  </div>
                </details>

                <details className="settings-drilldown settings-drilldown-danger">
                  <summary><span className="settings-directory-icon"><Trash2 size={21} /></span><span className="settings-directory-copy"><strong>Delete account</strong><small>Request or cancel permanent account deletion.</small></span><ChevronRight size={21} className="settings-directory-chevron" /></summary>
                  <div className="settings-drilldown-content">
              <section className={`account-deletion-card settings-inner-card ${accountSecurity.deletion?.status === 'pending' ? 'pending' : ''}`}>
                <div className="account-management-heading"><div><p className="eyebrow">Account deletion</p><h3><Trash2 size={20} /> Delete account and encrypted data</h3></div></div>
                {accountSecurity.deletion?.status === 'pending' ? <>
                  <p>Deletion is scheduled for <strong>{formatAccountDate(accountSecurity.deletion.scheduled_for, true)}</strong>. Until then, you can cancel this request and keep the account.</p>
                  <button type="button" className="secondary-button" onClick={cancelAccountDeletion}>Cancel account deletion</button>
                </> : <>
                  <p>A verified email code is required. Deletion then waits 14 days before the active Password-Encrypt cloud account, encrypted vault backups, stored documents and stored pictures are removed. Limited payment, legal or provider records may remain where retention is required for accounting, fraud prevention, disputes or law.</p>
                  <button type="button" className="secondary-button danger-soft" onClick={() => openAccountSecurityAction('delete-account')} disabled={!customerSession.authenticated}><Trash2 size={17} /> Request account deletion</button>
                </>}
              </section>

                  </div>
                </details>

                <details className="settings-drilldown">
                  <summary><span className="settings-directory-icon"><KeyRound size={21} /></span><span className="settings-directory-copy"><strong>Secure device unlock</strong><small>Manage quick unlock on this device and understand the master-password boundary.</small></span><ChevronRight size={21} className="settings-directory-chevron" /></summary>
                  <div className="settings-drilldown-content">
              <div className="master-password-boundary-note"><Lock size={20} /><span><strong>Account recovery does not reset the master password</strong><small>It restores the account, subscription and verified-device access only. A previously configured Secure device unlock may still provide local access, but support cannot supply or reset the vault encryption secret.</small></span></div>

              {!featureIncluded('secureDeviceUnlock') && <div className="plan-feature-unavailable"><KeyRound size={21} /><span><strong>Secure device unlock is not included</strong><small>Your master password still opens the encrypted vault normally. Upgrade or ask Admin for an entitlement override to enable quick unlock on this device.</small></span><button type="button" className="secondary-button" onClick={() => showEntitlementUpgrade('secureDeviceUnlock')}>Review plan</button></div>}
              <section className={`biometric-settings-card settings-inner-card ${biometricUnlock ? 'enabled' : ''} ${!featureIncluded('secureDeviceUnlock') ? 'feature-disabled' : ''}`}>
                <div className="vault-security-info-heading"><KeyRound size={19} /><strong>Secure device unlock on this device</strong></div>
                <p>{!featureIncluded('secureDeviceUnlock') ? 'Quick unlock is unavailable on the current plan. The master password remains the secure way to open this device’s local encrypted vault.' : biometricStatus.supported ? (biometricUnlock ? 'Secure device unlock is enabled. On the vault login screen, the key icon opens your device security prompt only; your phone or computer handles any PIN, fingerprint, face unlock or passkey input.' : 'Set up Secure device unlock here after opening the vault with your master password. After setup, the key icon on the login screen opens your device security prompt only.') : 'This browser or device does not support secure device unlock for this PWA.'}</p>
                <div className="biometric-status-grid">
                  <span><strong>Status</strong>{!featureIncluded('secureDeviceUnlock') ? 'Not included in current plan' : biometricUnlock ? 'Enabled on this device' : (biometricStatus.supported ? 'Ready to set up' : 'Not available')}</span>
                  <span><strong>Device method</strong>{biometricStatus.label}</span>
                  <span><strong>Scope</strong>This device only</span>
                  <span><strong>Password check</strong>Required every 14 days or 10 quick unlocks</span>
                </div>
                <div className="biometric-actions">
                  {!biometricUnlock && biometricStatus.supported && featureIncluded('secureDeviceUnlock') && <button type="button" className="secondary-button" onClick={enableBiometricUnlock}>Set up secure device unlock</button>}
                  {biometricUnlock && <button type="button" className="secondary-button danger-lite" onClick={disableBiometricUnlock}>Remove from this device</button>}
                </div>
                <p className="biometric-note"><strong>Security note:</strong> this is a trusted-device convenience feature, not a password replacement. Your browser may offer PIN, fingerprint, face unlock, passkey or device lock. Password-Encrypt will pause quick unlock every 14 days or after 10 quick unlocks and ask you to type your master password, so you do not forget it.</p>
              </section>
                  </div>
                </details>
              </div>
            </section>
          )}

          {activeSettingsSection === 'notifications' && (
            <section className="settings-section-panel push-settings-panel" aria-label="Push Notifications">
              <div className="settings-section-heading">
                <p className="eyebrow">Push Notifications</p>
                <h3><Bell size={20} /> Important alerts on this device</h3>
                <p>Receive timely Password-Encrypt alerts even when the app is not open. Email alerts continue to work alongside push notifications.</p>
              </div>

              <section className={`push-status-card ${pushNotifications.enabledThisDevice ? 'active' : pushNotifications.permission === 'denied' ? 'blocked' : ''}`}>
                <div className="push-status-main">
                  <span className="push-status-icon"><Bell size={22} /></span>
                  <div>
                    <strong>{pushNotifications.enabledThisDevice ? 'Push notifications are active' : pushNotifications.permission === 'denied' ? 'Notifications are blocked' : !pushNotifications.supported ? 'Push notifications are unavailable on this device' : !pushNotifications.configured && pushNotifications.loaded ? 'Push notifications are temporarily unavailable' : 'Push notifications are off'}</strong>
                    <p>{pushNotifications.enabledThisDevice
                      ? 'This device can receive Emergency Access warnings and important Password-Encrypt updates.'
                      : pushNotifications.permission === 'denied'
                        ? 'Allow notifications for Password-Encrypt in your browser or app permissions, then return here to enable them.'
                        : !pushNotifications.supported
                          ? 'This browser or device does not currently provide the web push features Password-Encrypt needs.'
                          : !pushNotifications.configured && pushNotifications.loaded
                            ? 'Push alerts cannot be enabled right now. Your existing email notifications are unaffected.'
                            : 'Turn on push notifications to receive important alerts on this device.'}</p>
                  </div>
                </div>
                <div className="push-status-actions">
                  {pushNotifications.enabledThisDevice
                    ? <button type="button" className="secondary-button" onClick={disablePushNotifications} disabled={pushNotifications.loading}>Turn off on this device</button>
                    : pushNotifications.supported && pushNotifications.permission !== 'denied' && (pushNotifications.configured || !pushNotifications.loaded)
                      ? <button type="button" className="primary-button" onClick={enablePushNotifications} disabled={pushNotifications.loading}>{pushNotifications.loading ? 'Working...' : 'Enable push notifications'}</button>
                      : null}
                  <button type="button" className="secondary-button" onClick={() => loadPushNotificationStatus()} disabled={pushNotifications.loading || !customerSession.authenticated}><RefreshCw size={17} className={pushNotifications.loading ? 'is-rotating' : ''} /> Refresh</button>
                </div>
                {pushNotifications.enabledThisDevice && pushNotifications.activeCount > 1 && <small className="push-device-count">Push is also active on {pushNotifications.activeCount - 1} other registered device{pushNotifications.activeCount - 1 === 1 ? '' : 's'} for this account.</small>}
                {pushNotifications.message && !pushNotifications.enabledThisDevice && <small className="push-status-message">{pushNotifications.message}</small>}
              </section>

              <div className="push-alert-list">
                <article><Bell size={20} /><div><strong>Trusted Person status</strong><span>Know when your trusted person accepts or declines the nomination, or confirms a routine Trusted Person reminder.</span></div></article>
                <article><AlertTriangle size={20} /><div><strong>Emergency Access request</strong><span>Receive an urgent owner alert as soon as your trusted person starts Emergency Access so you can review or cancel during the waiting period.</span></div></article>
                <article><UsersRound size={20} /><div><strong>Emergency package release</strong><span>Know when the waiting period completes without cancellation and the prepared emergency package becomes available.</span></div></article>
                <article><ShieldCheck size={20} /><div><strong>Important service updates</strong><span>Password-Encrypt Admin can send important app-wide notices to users who have chosen to receive push notifications.</span></div></article>
              </div>

              <div className="push-privacy-note"><ShieldCheck size={19} /><span><strong>Private by design</strong><small>Push notifications contain status messages only. Passwords, card details, secure notes, documents, master passwords and other vault contents are never placed in push notification text.</small></span></div>
            </section>
          )}

          {activeSettingsSection === 'subscription' && (
            <section className="settings-section-panel subscription-settings-panel" aria-label="My Subscription">
              <div className="settings-section-heading">
                <p className="eyebrow">My Subscription</p>
                <h3><CreditCard size={20} /> Plan and billing</h3>
                
              </div>

              {isFounderPlan(bootstrap) ? (() => {
                const localVaultItems = getVisibleVaultItems(items).length;
                const usedItems = Math.max(localVaultItems, Number(entitlements?.usage?.vaultItems || 0));
                const usedDocuments = Number(entitlements?.usage?.documents || 0);
                const usedPictures = Number(entitlements?.usage?.pictures || 0);
                const usedStorageMb = Number(entitlements?.usage?.storageMb || 0);
                return <div className="settings-drilldown-stack">
                  <details className="settings-drilldown" open>
                    <summary><span className="settings-directory-icon"><ShieldCheck size={21} /></span><span className="settings-directory-copy"><strong>Subscription overview</strong><small>Founder access and current account usage.</small></span><ChevronRight size={21} className="settings-directory-chevron" /></summary>
                    <div className="settings-drilldown-content">
                      <section className="subscription-founder-card settings-inner-card founder-subscription-overview">
                        <ShieldCheck size={24} />
                        <div className="founder-subscription-copy"><strong>Permanent Founder access</strong><p>Your Founder Plan does not expire, has no plan limits and does not require Stripe Billing.</p></div>
                        <div className="founder-usage-grid" aria-label="Founder plan usage">
                          <span><strong>Total vault items</strong>{usedItems}</span>
                          <span><strong>Encrypted documents</strong>{usedDocuments}</span>
                          <span><strong>Encrypted pictures</strong>{usedPictures}</span>
                          <span><strong>Account storage used</strong>{usedStorageMb.toFixed(2)} MB</span>
                        </div>
                      </section>
                    </div>
                  </details>
                </div>;
              })() : (() => {
                const currentSubscription = billing.subscription || customerSession.subscription || null;
                const lifecycleState = subscriptionLifecycleState(currentSubscription, bootstrap);
                const lifecycleLabel = subscriptionLifecycleLabel(currentSubscription, bootstrap);
                const currentPlanCode = currentSubscription?.planCode || bootstrap.planCode;
                const currentPlan = publicPlans.find((plan) => plan.code === currentPlanCode) || null;
                const selectedPlan = publicPlans.find((plan) => plan.code === (billing.planCode || currentPlanCode)) || publicPlans[0] || null;
                const stripeSubscriptionExists = currentSubscription?.provider === 'stripe' && Boolean(currentSubscription?.providerSubscriptionIdPresent);
                const paymentNeedsAttention = lifecycleState === 'payment_needs_attention';
                const cancellationScheduled = lifecycleState === 'cancellation_scheduled';
                const ended = lifecycleState === 'cancelled';
                const suspended = lifecycleState === 'suspended';
                const duplicateCount = Number(currentSubscription?.duplicateSubscriptionCount || billing.duplicateSubscriptionIds.length || 0);
                const canChange = stripeSubscriptionExists && ['subscription_active', 'trial_active'].includes(lifecycleState) && !cancellationScheduled && !paymentNeedsAttention && !suspended && duplicateCount <= 1;
                const nextInvoice = billing.nextInvoice || currentSubscription?.nextInvoice || null;
                const paymentHistory = billing.paymentHistory?.length ? billing.paymentHistory : (currentSubscription?.paymentHistory || []);
                const nextAmount = nextInvoice?.amountDueMinor ?? currentSubscription?.priceMinor ?? 0;
                const nextCurrency = nextInvoice?.currency || currentSubscription?.currency || 'GBP';
                const nextDate = nextInvoice?.renewalAt || currentSubscription?.currentPeriodEnd || null;
                const changeMode = selectedPlan ? subscriptionChangeMode(currentSubscription, currentPlan, selectedPlan, billing.interval) : 'none';
                const chooserEnabled = (!stripeSubscriptionExists || ended) ? true : canChange;
                const visibleBillingMessage = billing.message && billing.status !== 'refreshing' && billing.message !== 'Subscription status refreshed directly from Stripe.' ? billing.message : '';
                const currentActionLabel = changeMode === 'immediate' ? 'Upgrade now' : changeMode === 'scheduled' ? 'Schedule for next renewal' : 'Current plan and billing';
                return <div className="settings-drilldown-stack">
                  <details className="settings-drilldown">
                    <summary><span className="settings-directory-icon"><ShieldCheck size={21} /></span><span className="settings-directory-copy"><strong>Subscription overview</strong><small>Current plan, renewal date and payment status.</small></span><ChevronRight size={21} className="settings-directory-chevron" /></summary>
                    <div className="settings-drilldown-content">
                  <section className={`subscription-status-card subscription-lifecycle-card settings-inner-card state-${lifecycleState}`}>
                    <div className="subscription-lifecycle-topline">
                      <div className="subscription-lifecycle-heading"><span className="subscription-lifecycle-icon">{paymentNeedsAttention ? <AlertTriangle size={22} /> : <ShieldCheck size={22} />}</span><span><strong>{lifecycleLabel}</strong><small>{currentSubscription?.provider === 'stripe' ? `${planDisplayName(currentPlanCode)} · ${billingIntervalLabel(currentSubscription.billingInterval)} billing` : `${planDisplayName(bootstrap.planCode)} · trial access`}</small></span></div>
                      <button type="button" className="subscription-refresh-icon-button" onClick={() => refreshCustomerSubscription()} disabled={billing.status === 'refreshing' || billing.status === 'updating'} aria-label={billing.status === 'refreshing' ? 'Refreshing subscription from Stripe' : 'Refresh subscription from Stripe'} title={billing.status === 'refreshing' ? 'Refreshing from Stripe' : 'Refresh from Stripe'}><RefreshCw size={20} className={billing.status === 'refreshing' ? 'is-rotating' : ''} /></button>
                    </div>

                    <div className="subscription-status-grid subscription-summary-grid">
                      <span><strong>Current plan</strong>{planDisplayName(currentPlanCode)}</span>
                      <span><strong>{cancellationScheduled ? 'Access ends' : 'Next renewal'}</strong>{formatAccountDate(nextDate, true)}</span>
                      <span><strong>{cancellationScheduled ? 'Renewal' : 'Renewal amount'}</strong>{stripeSubscriptionExists && !cancellationScheduled ? formatBillingMoney(nextAmount, nextCurrency) : cancellationScheduled ? 'No further renewal' : 'Trial / not billed'}</span>
                    </div>

                    <details className="subscription-disclosure subscription-details-disclosure">
                      <summary><span><strong>More subscription details</strong><small>Billing period, payment and Stripe refresh information</small></span><ChevronRight size={19} /></summary>
                      <div className="subscription-status-grid subscription-detail-grid">
                        <span><strong>Billing period</strong>{currentSubscription?.provider === 'stripe' ? billingIntervalLabel(currentSubscription.billingInterval) : 'Trial / not billed'}</span>
                        <span><strong>Last payment</strong>{formatAccountDate(currentSubscription?.lastPaymentAt, true)}</span>
                        <span><strong>Last Stripe refresh</strong>{formatAccountDate(currentSubscription?.lastStripeSyncAt, true)}</span>
                      </div>
                    </details>

                    {currentSubscription?.scheduledChange && <div className="subscription-scheduled-change"><CalendarClock size={20} /><span><strong>Upcoming scheduled change</strong><small>{planDisplayName(currentSubscription.scheduledChange.planCode)} · {billingIntervalLabel(currentSubscription.scheduledChange.billingInterval)} billing{currentSubscription.scheduledChange.amountMinor ? ` · ${formatBillingMoney(currentSubscription.scheduledChange.amountMinor, currentSubscription.scheduledChange.currency)}` : ''}</small><small>Takes effect at renewal on {formatAccountDate(currentSubscription.scheduledChange.effectiveAt, true)}.</small></span></div>}
                    {paymentNeedsAttention && <div className="subscription-payment-warning"><AlertTriangle size={19} /><span><strong>Payment needs attention</strong><small>{String(currentSubscription?.status || '').toLowerCase() === 'unpaid' ? 'Stripe has stopped automatic payment retries. Open the billing portal now to update your payment method and settle the invoice.' : 'Stripe could not complete the latest payment. Open the billing portal to update your payment method before the grace period ends.'}</small>{currentSubscription?.gracePeriodEndsAt && <small><strong>Grace period:</strong> cloud services may pause after {formatAccountDate(currentSubscription.gracePeriodEndsAt, true)}.</small>}</span></div>}
                    {cancellationScheduled && <div className="subscription-cancellation-note"><CalendarClock size={19} /><span><strong>Cancellation is scheduled</strong><small>Your subscription remains active until {formatAccountDate(currentSubscription?.currentPeriodEnd, true)}. You can reactivate it before then.</small></span></div>}
                    {suspended && <div className="subscription-payment-warning"><AlertTriangle size={19} /><span><strong>Account suspended</strong><small>Subscription changes are unavailable while the account is suspended. Contact support if you believe this is incorrect.</small></span></div>}
                    {duplicateCount > 1 && <div className="subscription-payment-warning"><AlertTriangle size={19} /><span><strong>Overlapping Stripe subscriptions detected</strong><small>No automatic plan change will be made until Admin keeps one live subscription and refreshes this account from Stripe.</small></span></div>}
                  </section>

                    </div>
                  </details>

                  <details className="settings-drilldown">
                    <summary><span className="settings-directory-icon"><Database size={21} /></span><span className="settings-directory-copy"><strong>Plan usage</strong><small>Vault items, encrypted documents, pictures and total account storage.</small></span><ChevronRight size={21} className="settings-directory-chevron" /></summary>
                    <div className="settings-drilldown-content">
                  <section className="plan-usage-card settings-inner-card" aria-label="Plan usage">
                    <div className="plan-usage-heading"><div><p className="eyebrow">Plan usage</p><h3>How much of your plan you are using</h3></div><span>{entitlements?.planName || planDisplayName(currentPlanCode)}</span></div>
                    {(() => {
                      const localVaultItems = getVisibleVaultItems(items).length;
                      const usedItems = Math.max(localVaultItems, Number(entitlements?.usage?.vaultItems || 0));
                      const itemLimit = Number(entitlements?.limits?.itemLimit || 0);
                      const usedDocuments = Number(entitlements?.usage?.documents || 0);
                      const documentLimit = Number(entitlements?.limits?.documentLimit || 0);
                      const usedPictures = Number(entitlements?.usage?.pictures || 0);
                      const photoLimit = Number(entitlements?.limits?.photoLimit || 0);
                      const usedStorageMb = Number(entitlements?.usage?.storageMb || 0);
                      const storageLimitMb = Number(entitlements?.limits?.storageLimitMb || 0);
                      const rows = [
                        { key: 'items', label: 'Vault items', used: usedItems, limit: itemLimit, detail: itemLimit > 0 ? `${Math.max(0, itemLimit - usedItems)} item${Math.max(0, itemLimit - usedItems) === 1 ? '' : 's'} left` : 'Unlimited on this plan' },
                        { key: 'documents', label: 'Encrypted documents', used: usedDocuments, limit: documentLimit, detail: documentLimit > 0 ? `${Math.max(0, documentLimit - usedDocuments)} document${Math.max(0, documentLimit - usedDocuments) === 1 ? '' : 's'} left` : 'Unlimited on this plan' },
                        { key: 'pictures', label: 'Encrypted pictures', used: usedPictures, limit: photoLimit, detail: photoLimit > 0 ? `${Math.max(0, photoLimit - usedPictures)} picture${Math.max(0, photoLimit - usedPictures) === 1 ? '' : 's'} left` : 'Unlimited on this plan' },
                        { key: 'storage', label: 'Total account storage', used: usedStorageMb, limit: storageLimitMb, detail: storageLimitMb > 0 ? `${usedStorageMb.toFixed(2)} MB of ${storageLimitMb} MB used · includes your encrypted cloud vault, documents and pictures` : `${usedStorageMb.toFixed(2)} MB used · unlimited allocation` }
                      ];
                      return <div className="plan-usage-list">{rows.map((row) => {
                        const percent = row.limit > 0 ? Math.min(100, Math.max(0, (Number(row.used || 0) / row.limit) * 100)) : 0;
                        return <article key={row.key} className="plan-usage-row"><div className="plan-usage-row-copy"><strong>{row.label}</strong><span>{row.limit > 0 ? `${Number(row.used || 0).toFixed(row.key === 'storage' ? 2 : 0)} / ${row.limit}` : `${Number(row.used || 0).toFixed(row.key === 'storage' ? 2 : 0)} used`}</span></div><div className="plan-usage-track" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div><small>{row.detail}</small></article>;
                      })}</div>;
                    })()}
                  </section>

                    </div>
                  </details>

                  <details className="settings-drilldown">
                    <summary><span className="settings-directory-icon"><CreditCard size={21} /></span><span className="settings-directory-copy"><strong>Plan & billing options</strong><small>Choose a plan, billing period or review a subscription change.</small></span><ChevronRight size={21} className="settings-directory-chevron" /></summary>
                    <div className="settings-drilldown-content">
                  <section className="subscription-chooser subscription-change-card settings-inner-card">
                    <div className="subscription-card-heading"><div><p className="eyebrow">{!stripeSubscriptionExists || ended ? 'Subscription options' : 'Change subscription'}</p><h3>{ended ? 'Restart your subscription' : !stripeSubscriptionExists ? 'Choose your plan and billing period' : 'Change plan or billing period'}</h3><p>Choose the plan and payment frequency you prefer. Higher-plan upgrades take effect immediately; downgrades and billing-period changes begin at the next renewal.</p></div><span>GBP (£)</span></div>

                    {publicPlans.length ? <>
                      <div className="subscription-selection-form">
                        <label><span>Plan</span><CustomSelect value={selectedPlan?.code || ''} ariaLabel="Choose subscription plan" options={publicPlans.map((plan) => ({ value: plan.code, label: plan.displayName }))} onChange={(planCode) => { setBilling((current) => ({ ...current, planCode, message: '' })); setBillingTermsAccepted(false); }} disabled={!chooserEnabled || billing.status === 'updating'} /></label>
                        <label><span>Billing period</span><CustomSelect value={billing.interval} ariaLabel="Choose billing period" options={['monthly', 'quarterly', 'annual'].map((interval) => ({ value: interval, label: `${billingIntervalLabel(interval)}${selectedPlan && planIntervalReady(selectedPlan, interval) ? ` — ${billingPriceLabel(selectedPlan, interval)}` : ' — Not available'}`, disabled: !selectedPlan || !planIntervalReady(selectedPlan, interval) }))} onChange={(interval) => { setBilling((current) => ({ ...current, interval, message: '' })); setBillingTermsAccepted(false); }} disabled={!chooserEnabled || billing.status === 'updating'} /></label>
                      </div>

                      <div className="subscription-selection-summary">
                        <div><strong>{selectedPlan?.displayName || 'Select a plan'}</strong><small>{selectedPlan?.description || 'Choose a published Personal plan.'}</small></div>
                        <span>{selectedPlan ? billingPriceLabel(selectedPlan, billing.interval) : 'Not available'}</span>
                      </div>

                      {selectedPlan && !planIntervalReady(selectedPlan, billing.interval) && <div className="subscription-inline-note"><AlertTriangle size={17} /><span>This billing option is not available yet. Choose another billing period.</span></div>}

                      {!stripeSubscriptionExists || ended ? (
                        <>
                          <div className="billing-purchase-consent">
                            <input id="billing-purchase-consent" type="checkbox" checked={billingTermsAccepted} onChange={(event) => { setBillingTermsAccepted(event.target.checked); setBilling((current) => ({ ...current, message: '' })); }} aria-labelledby="billing-purchase-consent-text" />
                            <span id="billing-purchase-consent-text">I have read and agree to the <button type="button" className="legal-inline-link" onClick={() => setBillingLegalModalOpen(true)}>Subscription, Cancellation &amp; Refund Policy</button> for this paid subscription.</span>
                          </div>
                          <button type="button" className="primary-button subscription-checkout-button" onClick={startStripeCheckout} disabled={billing.status === 'opening-checkout' || !billingTermsAccepted || !selectedPlan || !planIntervalAmount(selectedPlan, billing.interval) || !planIntervalReady(selectedPlan, billing.interval)}><CreditCard size={18} /> {billing.status === 'opening-checkout' ? 'Opening Stripe Checkout...' : `Continue with ${billingIntervalLabel(billing.interval)} billing`}</button>
                        </>
                      ) : <button type="button" className="primary-button subscription-change-button" onClick={reviewSubscriptionChange} disabled={!canChange || changeMode === 'none' || !selectedPlan || !planIntervalReady(selectedPlan, billing.interval) || billing.status === 'updating'}><CalendarClock size={18} /> {currentActionLabel}</button>}
                    </> : <div className="subscription-inline-note"><AlertTriangle size={17} /><span>Plan choices could not be loaded. Use the refresh icon above and try again.</span></div>}
                  </section>

                    </div>
                  </details>

                  <details className="settings-drilldown">
                    <summary><span className="settings-directory-icon"><FileText size={21} /></span><span className="settings-directory-copy"><strong>Payments, invoices & cancellation</strong><small>Stripe portal, invoice history, billing terms and cancellation controls.</small></span><ChevronRight size={21} className="settings-directory-chevron" /></summary>
                    <div className="settings-drilldown-content">
                  {stripeSubscriptionExists && <details className="subscription-disclosure subscription-management-disclosure settings-inner-card">
                    <summary><span><strong>Manage subscription</strong><small>Payment method, Stripe records and cancellation</small></span><ChevronRight size={19} /></summary>
                    <div className="subscription-management-content">
                      {currentSubscription?.providerCustomerIdPresent && <div className="subscription-manage-card"><div><ExternalLink size={20} /><span><strong>Stripe Customer Portal</strong><small>Update card details, pay an outstanding invoice and open Stripe’s full invoice records.</small></span></div><button type="button" className="secondary-button" onClick={openStripePortal} disabled={billing.status === 'opening-portal'}>{billing.status === 'opening-portal' ? 'Opening...' : 'Open billing portal'}</button></div>}
                      <div className="subscription-lifecycle-actions"><div><strong>Subscription controls</strong><small>Cancellation is scheduled for the end of the current paid period, unless applicable law requires otherwise.</small></div><div className="subscription-action-row">{cancellationScheduled ? <button type="button" className="primary-button" onClick={reviewSubscriptionReactivation} disabled={billing.status === 'updating'}><ShieldCheck size={17} /> Keep subscription active</button> : !ended && <button type="button" className="secondary-button danger-soft" onClick={reviewSubscriptionCancellation} disabled={billing.status === 'updating' || suspended}><X size={17} /> Cancel at period end</button>}</div></div>
                    </div>
                  </details>}

                  {stripeSubscriptionExists && <details className="subscription-disclosure subscription-history-disclosure settings-inner-card">
                    <summary><span><strong>Payment and invoice history</strong><small>{paymentHistory.length ? `${paymentHistory.length} recent Stripe record${paymentHistory.length === 1 ? '' : 's'}` : 'No Stripe invoices are available yet'}</small></span><ChevronRight size={19} /></summary>
                    <div className="subscription-invoice-list">
                      {paymentHistory.map((invoice) => {
                        const display = invoiceCustomerDisplay(invoice);
                        const downloadUrl = invoice.invoicePdfUrl && invoice.invoicePdfUrl !== display.primaryUrl ? invoice.invoicePdfUrl : '';
                        return <article key={invoice.id} className={`subscription-invoice-row status-${String(invoice.status || '').toLowerCase()}`}>
                          <FileText size={19} />
                          <div className="subscription-invoice-copy"><strong>{invoice.number || 'Stripe invoice'}</strong><small><span className="invoice-status-label">{display.statusLabel}</span>{display.dateLabel}</small></div>
                          <span>{formatBillingMoney(display.amountMinor, invoice.currency)}</span>
                          <div className="subscription-invoice-actions">
                            {display.primaryUrl && <a className="secondary-button invoice-link-button" href={display.primaryUrl} target="_blank" rel="noreferrer">{String(invoice.status || '').toLowerCase() === 'paid' ? <ShieldCheck size={15} /> : <ExternalLink size={15} />} {display.primaryLabel}</a>}
                            {downloadUrl && <a className="secondary-button invoice-link-button invoice-download-button" href={downloadUrl} target="_blank" rel="noreferrer"><Download size={15} /> Download invoice</a>}
                          </div>
                        </article>;
                      })}
                      {!paymentHistory.length && <div className="subscription-history-empty">No Stripe invoices are available yet.</div>}
                    </div>
                  </details>}

                  <section className="subscription-legal-note settings-inner-card">
                    <CreditCard size={19} />
                    <div><strong>Billing terms and payment records</strong><small>Prices are shown in GBP. Stripe hosts the official invoice and receipt records. Cancellation is normally effective at the end of the current paid period. Mandatory consumer rights still apply.</small><span><a href="/billing-terms" target="_blank" rel="noreferrer">Billing & refunds</a><a href="/terms" target="_blank" rel="noreferrer">Terms</a><a href="/privacy" target="_blank" rel="noreferrer">Privacy</a></span></div>
                  </section>

                  {!customerSession.authenticated && <section className="subscription-verify-card settings-inner-card"><ShieldCheck size={20} /><span><strong>Verify this device first</strong><small>Device verification protects access to subscription and billing actions.</small></span><button type="button" className="secondary-button" onClick={openDeviceVerification}>Verify this device</button></section>}
                  {visibleBillingMessage && <div className={`subscription-message ${billing.status}`}>{visibleBillingMessage}</div>}
                    </div>
                  </details>
                </div>;
              })()}
            </section>
          )}

          {['emergency-nominate', 'emergency-receive'].includes(activeSettingsSection) && (
            <section className="settings-section-panel settings-emergency-panel" aria-label={activeSettingsSection === 'emergency-receive' ? 'Receive an Emergency Package' : 'Nominate a Trusted Person'}>
              <div className="settings-section-heading emergency-access-settings-heading">
                <p className="eyebrow">Emergency Access</p>
                <h3>{activeSettingsSection === 'emergency-receive' ? <><KeyRound size={20} /> Receive an Emergency Package</> : <><UsersRound size={20} /> Nominate a Trusted Person</>}</h3>
                <p>{activeSettingsSection === 'emergency-receive'
                  ? 'Enter an Import Code from an Emergency Package released to you and add it securely to your own Password-Encrypt vault.'
                  : 'Choose and manage the trusted person who should receive your prepared Emergency Package if it is ever genuinely needed.'}</p>
              </div>

              {activeSettingsSection === 'emergency-nominate' && (
              <section className="emergency-access-purpose-section emergency-access-nominate-section" aria-labelledby="emergency-nominate-title">
                <div className="emergency-access-purpose-heading">
                  <span className="emergency-access-purpose-icon"><UsersRound size={22} /></span>
                  <div>
                    <p className="eyebrow">Nominate</p>
                    <h4 id="emergency-nominate-title">Nominate a Trusted Person</h4>
                    <p>Choose and manage the person who should receive your prepared Emergency Package if it is ever genuinely needed.</p>
                  </div>
                  <button type="button" className="trusted-person-help-button" onClick={() => setTrustedPersonHelpOpen(true)} aria-label="Open Trusted Person help and FAQs" title="Trusted Person help"><CircleHelp size={20} /></button>
                </div>

              {!featureIncluded('emergencyAccess') && <div className="plan-feature-unavailable"><UsersRound size={21} /><span><strong>Trusted Person planning is not included</strong><small>You can still import an Emergency Package released to your Password-Encrypt account. Upgrade or ask Admin for an entitlement override to configure your own trusted person.</small></span><button type="button" className="secondary-button" onClick={() => showEntitlementUpgrade('emergencyAccess')}>Review plan</button></div>}

              {featureIncluded('emergencyAccess') && pushNotifications.supported && pushNotifications.configured && (
                <div className={`emergency-push-alert-card ${pushNotifications.enabledThisDevice ? 'active' : pushNotifications.permission === 'denied' ? 'blocked' : ''}`}>
                  <span className="emergency-push-alert-icon"><Bell size={20} /></span>
                  <div><strong>{pushNotifications.enabledThisDevice ? 'Emergency push alerts are active' : pushNotifications.permission === 'denied' ? 'Emergency push alerts are blocked' : 'Turn on Emergency Access push alerts'}</strong><small>{pushNotifications.enabledThisDevice ? 'This device will receive an immediate push warning if your trusted person starts Emergency Access.' : pushNotifications.permission === 'denied' ? 'Notifications are blocked in this browser or app. Review Push Notifications in Settings for guidance.' : 'Recommended: receive an immediate owner warning on this device if your trusted person starts Emergency Access.'}</small></div>
                  {pushNotifications.enabledThisDevice
                    ? <button type="button" className="secondary-button" onClick={() => openSettingsSection('notifications')}>Manage</button>
                    : pushNotifications.permission === 'denied'
                      ? <button type="button" className="secondary-button" onClick={() => openSettingsSection('notifications')}>Review</button>
                      : <button type="button" className="secondary-button" onClick={enablePushNotifications} disabled={pushNotifications.loading}>{pushNotifications.loading ? 'Working...' : 'Enable'}</button>}
                </div>
              )}

              <button type="button" className={`emergency-current-stage-card emergency-current-stage-glance emergency-current-stage-button ${emergencyInvitationAccepted ? 'ready' : ''}`} aria-label={`Current setup progress. Stage ${emergencySetupStageNumber} of 4. ${emergencySetupProgress.title}. Tap to go to this stage.`} onClick={() => goToEmergencySetupStage(emergencySetupStageNumber)}>
                <div className="emergency-current-progress-meta">
                  <span className="emergency-current-progress-label">Current progress</span>
                  <span className="emergency-current-stage-step">Stage {emergencySetupStageNumber} of 4 setup</span>
                </div>
                <div className="emergency-current-progress-copy"><strong>{emergencySetupProgress.title}</strong><p>{emergencySetupProgress.copy}</p><small>Tap to go to Stage {emergencySetupStageNumber}</small></div>
                <ChevronRight size={22} className="emergency-current-progress-chevron" />
              </button>

              <form className={`emergency-access-form ${!featureIncluded('emergencyAccess') ? 'feature-disabled' : ''}`} aria-disabled={!featureIncluded('emergencyAccess')} onSubmit={(event) => event.preventDefault()}>
                <div className="emergency-flow-roadmap">
                  <details id="emergency-stage-1" className={`emergency-flow-stage emergency-flow-stage-editor ${emergencyTrustedPersonComplete ? 'completed' : emergencyCurrentStage.number === 1 ? 'current' : ''}`} defaultOpen={!emergencyTrustedPersonComplete}>
                    <summary className="emergency-flow-stage-summary">
                      <span className="emergency-flow-step-number">1</span>
                      <span className="emergency-flow-stage-copy"><strong>Add your trusted person</strong><small>Name, relationship, email, phone and the waiting period.</small></span>
                      <span className="emergency-flow-stage-action-label">{emergencyTrustedPersonComplete ? 'Edit details' : 'Add details'} <ChevronRight size={18} /></span>
                      <span className={`emergency-flow-stage-status ${emergencyTrustedPersonComplete ? 'done' : ''}`} aria-label={emergencyTrustedPersonComplete ? 'Completed' : 'Not completed'}>{emergencyTrustedPersonComplete ? <Check size={29} strokeWidth={3} /> : <span>1</span>}</span>
                    </summary>
                    <div className="emergency-flow-stage-content">
                      <div className="bootstrap-grid emergency-access-grid">
                        <label>Next of kin / trusted person name<input value={emergencyDraft.contactName} onChange={(e) => setEmergencyDraft({ ...emergencyDraft, contactName: e.target.value })} placeholder="Full name" /></label>
                        <label>Relationship<input value={emergencyDraft.relationship} onChange={(e) => setEmergencyDraft({ ...emergencyDraft, relationship: e.target.value })} placeholder="Spouse, child, sibling, solicitor..." /></label>
                        <label>Email<input type="email" value={emergencyDraft.contactEmail} onChange={(e) => setEmergencyDraft({ ...emergencyDraft, contactEmail: e.target.value })} placeholder="trusted@example.com" /></label>
                        <label>Phone<input inputMode="tel" value={emergencyDraft.contactPhone} onChange={(e) => setEmergencyDraft({ ...emergencyDraft, contactPhone: e.target.value })} placeholder="Mobile or landline" /></label>
                        <label>Waiting period<CustomSelect value={emergencyDraft.waitingPeriod} ariaLabel="Choose emergency waiting period" options={[
                          { value: '10 minutes', label: '10 minutes — testing only' },
                          { value: '24 hours', label: '24 hours' },
                          { value: '3 days', label: '3 days' },
                          { value: '7 days', label: '7 days' },
                          { value: '14 days', label: '14 days' },
                          { value: '30 days', label: '30 days' }
                        ]} onChange={(waitingPeriod) => setEmergencyDraft({ ...emergencyDraft, waitingPeriod })} /></label>
                      </div>
                      <label className="emergency-access-notes-label">Notes or instructions<textarea value={emergencyDraft.instructions} onChange={(e) => setEmergencyDraft({ ...emergencyDraft, instructions: e.target.value })} placeholder="Add any wishes, instructions, or details you want kept with this emergency plan." /></label>
                      <div className="emergency-section-save-row"><button type="button" className="primary-button" disabled={emergencySaveState === 'saving' || !featureIncluded('emergencyAccess')} onClick={(event) => saveEmergencyAccessPlan(event, 'Trusted person details saved. Step 1 is complete.', 'trusted_person')}><Save size={17} /> {emergencySaveState === 'saving' ? 'Saving...' : 'Save Step 1'}</button></div>
                    </div>
                  </details>

                  <details id="emergency-stage-2" className={`emergency-flow-stage emergency-flow-stage-editor ${emergencyPackageComplete ? 'completed' : emergencyCurrentStage.number === 2 ? 'current' : !emergencyTrustedPersonComplete ? 'locked' : ''}`} defaultOpen={emergencyTrustedPersonComplete && !emergencyPackageComplete}>
                    <summary className="emergency-flow-stage-summary">
                      <span className="emergency-flow-step-number">2</span>
                      <span className="emergency-flow-stage-copy"><strong>Prepare the emergency package</strong><small>Choose what your trusted person should receive if the waiting period completes.</small></span>
                      <span className="emergency-flow-stage-action-label">{!emergencyTrustedPersonComplete ? 'Complete Step 1 first' : emergencyPackageComplete ? 'Edit package' : 'Prepare package'} <ChevronRight size={18} /></span>
                      <span className={`emergency-flow-stage-status ${emergencyPackageComplete ? 'done' : ''}`} aria-label={emergencyPackageComplete ? 'Completed' : 'Not completed'}>{emergencyPackageComplete ? <Check size={29} strokeWidth={3} /> : <span>2</span>}</span>
                    </summary>
                    <div className="emergency-flow-stage-content">
                      {!emergencyTrustedPersonComplete && <div className="emergency-flow-locked-note"><Lock size={17} /> Save Step 1 before preparing the package.</div>}
                      <div className="emergency-package-editor-card">
                        <div className="emergency-package-editor-heading">
                          <FileText size={20} />
                          <div><strong>Emergency package</strong><span>This is the information that can become available only after a genuine Emergency Access request and your waiting period.</span></div>
                        </div>
                        <label className="emergency-toggle-row"><input type="checkbox" checked={emergencyDraft.emergencyPackageEnabled !== false} onChange={(e) => setEmergencyDraft({ ...emergencyDraft, emergencyPackageEnabled: e.target.checked })} /><span>Prepare an emergency release package after the waiting period if I do not cancel.</span></label>
                        <div className="bootstrap-grid emergency-package-grid">
                          <label>Package title<input value={emergencyDraft.emergencyPackageTitle ?? ''} onChange={(e) => setEmergencyDraft({ ...emergencyDraft, emergencyPackageTitle: e.target.value })} placeholder="Emergency Info package" /></label>
                          <label>Release scope<CustomSelect value={emergencyDraft.accessScope} ariaLabel="Choose emergency release scope" options={[
                            { value: 'Emergency Info folder only', label: 'Emergency Info folder only' },
                            { value: 'Selected folders later', label: 'Selected folders later' },
                            { value: 'Selected documents later', label: 'Selected documents later' },
                            { value: 'Full vault access', label: 'Full vault access' }
                          ]} onChange={(accessScope) => setEmergencyDraft({ ...emergencyDraft, accessScope })} /></label>
                        </div>
                        {emergencyDraft.accessScope === 'Full vault access' && <div className="emergency-document-release-note"><FileText size={17} /><span><strong>Stored documents and pictures are included</strong><small>Stored document and picture files are prepared as separate encrypted copies for this Trusted Person arrangement. While the arrangement is active, changed, added or removed files are automatically reflected when your vault is online and unlocked. They are released only if the waiting period completes without cancellation.</small></span></div>}
                        <div className="emergency-package-notes-grid">
                          <label className="emergency-access-notes-label">Emergency message<textarea value={emergencyDraft.emergencyPackageMessage || ''} onChange={(e) => setEmergencyDraft({ ...emergencyDraft, emergencyPackageMessage: e.target.value })} placeholder="Write the message your trusted person should see first if the waiting period ends." /></label>
                          <label className="emergency-access-notes-label">Important contacts<textarea value={emergencyDraft.emergencyPackageContacts || ''} onChange={(e) => setEmergencyDraft({ ...emergencyDraft, emergencyPackageContacts: e.target.value })} placeholder="Solicitor, doctor, accountant, family contacts, executor, insurance contact..." /></label>
                          <label className="emergency-access-notes-label">Documents and locations<textarea value={emergencyDraft.emergencyPackageDocuments || ''} onChange={(e) => setEmergencyDraft({ ...emergencyDraft, emergencyPackageDocuments: e.target.value })} placeholder="Where to find will, policy documents, house papers, key files, physical documents..." /></label>
                          <label className="emergency-access-notes-label">Checklist for trusted person<textarea value={emergencyDraft.emergencyPackageChecklist || ''} onChange={(e) => setEmergencyDraft({ ...emergencyDraft, emergencyPackageChecklist: e.target.value })} placeholder="Step 1: Contact..., Step 2: Check..., Step 3: Do not..." /></label>
                        </div>
                        {emergencyDraft.invitationId && <div className={`emergency-package-freshness-card ${emergencyPackageFreshness.state || 'idle'}`}>
                          <RefreshCw size={18} className={emergencyPackageFreshness.state === 'refreshing' ? 'sync-button-spinner' : ''} />
                          <span>
                            <strong>{emergencyPackageFreshness.state === 'frozen' ? 'Released package snapshot is fixed' : emergencyPackageFreshness.state === 'pending' ? 'Package refresh pending' : emergencyPackageFreshness.state === 'refreshing' ? 'Updating prepared package' : 'Prepared package stays up to date automatically'}</strong>
                            <small>{emergencyPackageFreshness.state === 'frozen'
                              ? 'The waiting period has completed. The package released to your trusted person is now frozen and later vault changes will not alter it.'
                              : emergencyPackageFreshness.state === 'pending'
                                ? emergencyPackageFreshness.message || 'Password-Encrypt will refresh the prepared package when this vault is online and unlocked.'
                                : emergencyPackageFreshness.state === 'refreshing'
                                  ? 'Password-Encrypt is rebuilding the prepared release snapshot from the latest unlocked vault.'
                                  : `Changes you make to included vault items are automatically reflected before release.${emergencyPackageFreshness.lastRefreshedAt ? ` Last refreshed: ${formatAppDate(emergencyPackageFreshness.lastRefreshedAt, true)}.` : ''}`}</small>
                            {emergencyPackageFreshness.state !== 'frozen' && <small>Because Password-Encrypt cannot decrypt your vault on the server, refresh happens when the vault is unlocked and online. The package is frozen when the waiting period completes.</small>}
                          </span>
                        </div>}
                        <div className="emergency-section-save-row"><button type="button" className="primary-button" disabled={emergencySaveState === 'saving' || !featureIncluded('emergencyAccess') || !emergencyTrustedPersonComplete || isEmergencyReleaseReady} onClick={(event) => saveEmergencyAccessPlan(event, 'Emergency package saved. Step 2 is complete.', 'package')}><Save size={17} /> {isEmergencyReleaseReady ? 'Released package frozen' : emergencySaveState === 'saving' ? 'Saving...' : 'Save Step 2'}</button></div>
                      </div>
                    </div>
                  </details>

                  <section id="emergency-stage-3" className={`emergency-flow-stage ${emergencyInvitationWasSent ? 'completed' : emergencyCurrentStage.number === 3 ? 'current' : 'locked'}`}>
                    <div className="emergency-flow-stage-summary">
                      <span className="emergency-flow-step-number">3</span>
                      <span className="emergency-flow-stage-copy"><strong>Send the invitation</strong><small>Only after Steps 1 and 2 are saved should Password-Encrypt contact your trusted person.</small></span>
                      <span className="emergency-flow-stage-action">
                        {!emergencyInvitationWasSent ? <button type="button" className="primary-button compact" onClick={sendEmergencyAccessInvite} disabled={!emergencyTrustedPersonComplete || !emergencyPackageComplete || emergencyInviteState.status === 'sending'}><Mail size={16} /> {emergencyInviteState.status === 'sending' ? 'Sending...' : 'Send invitation'}</button> : <span className="emergency-flow-complete-label">Invitation sent</span>}
                      </span>
                      <span className={`emergency-flow-stage-status ${emergencyInvitationWasSent ? 'done' : ''}`}>{emergencyInvitationWasSent ? <Check size={29} strokeWidth={3} /> : <span>3</span>}</span>
                    </div>
                  </section>

                  <section id="emergency-stage-4" className={`emergency-flow-stage ${emergencyInvitationAccepted ? 'completed' : emergencyCurrentStage.number === 4 ? 'current' : !emergencyInvitationWasSent ? 'locked' : emergencyInvitationNeedsAttention ? 'attention' : ''}`}>
                    <div className="emergency-flow-stage-summary">
                      <span className="emergency-flow-step-number">4</span>
                      <span className="emergency-flow-stage-copy"><strong>Trusted person accepts</strong><small>{emergencyInvitationNeedsAttention ? 'The invitation needs attention before this flow can continue.' : emergencyInvitationAccepted ? 'Accepted. Their separate Emergency Access link has already been emailed for future use.' : 'They accept from their secure email. This page checks automatically while open; acceptance still gives them no vault access.'}</small></span>
                      <span className="emergency-flow-stage-action">
                        {emergencyInvitationWasSent && !emergencyInvitationAccepted ? <CustomSelect value="" placeholder="Invitation actions" ariaLabel="Trusted person invitation actions" className="emergency-flow-action-select" menuClassName="emergency-flow-action-menu" options={emergencyInvitationStageOptions} onChange={runEmergencyFlowAction} disabled={emergencyInviteState.status === 'checking'} /> : emergencyInvitationAccepted ? <span className="emergency-flow-complete-label">Accepted</span> : <span className="emergency-flow-waiting-label">Waiting for Step 3</span>}
                      </span>
                      <span className={`emergency-flow-stage-status ${emergencyInvitationAccepted ? 'done' : ''}`}>{emergencyInvitationAccepted ? <Check size={29} strokeWidth={3} /> : <span>4</span>}</span>
                    </div>
                  </section>

                  <div className="emergency-flow-emergency-heading">
                    <span><AlertTriangle size={18} /></span>
                    <div><strong>Emergency-only stages</strong><small>Stages 5 and 6 are not part of setup. They stay dormant unless your trusted person later requests Emergency Access in a genuine emergency.</small></div>
                  </div>

                  <section id="emergency-stage-5" className={`emergency-flow-stage ${emergencyRequestWasMade ? 'completed' : emergencyCurrentStage.number === 5 ? 'current' : 'locked'}`}>
                    <div className="emergency-flow-stage-summary">
                      <span className="emergency-flow-step-number">5</span>
                      <span className="emergency-flow-stage-copy"><strong>Emergency Access is requested</strong><small>Your trusted person uses the secure link they saved only if emergency access is genuinely needed.</small></span>
                      <span className="emergency-flow-stage-action">
                        {emergencyInvitationAccepted && !emergencyRequestWasMade ? <CustomSelect value="" placeholder="Emergency link actions" ariaLabel="Emergency Access link actions" className="emergency-flow-action-select" menuClassName="emergency-flow-action-menu" options={emergencyAcceptedStageOptions} onChange={runEmergencyFlowAction} /> : emergencyRequestWasMade ? <span className="emergency-flow-complete-label">Request received</span> : <span className="emergency-flow-waiting-label">Waiting for Step 4</span>}
                      </span>
                      <span className={`emergency-flow-stage-status ${emergencyRequestWasMade ? 'done' : ''}`}>{emergencyRequestWasMade ? <Check size={29} strokeWidth={3} /> : <span>5</span>}</span>
                    </div>
                  </section>

                  <section id="emergency-stage-6" className={`emergency-flow-stage ${isEmergencyReleaseReady ? 'completed' : emergencyCurrentStage.number === 6 ? 'current active' : 'locked'}`}>
                    <div className="emergency-flow-stage-summary">
                      <span className="emergency-flow-step-number">6</span>
                      <span className="emergency-flow-stage-copy"><strong>Waiting period completes</strong><small>{isEmergencyReleaseReady ? 'The waiting period completed without cancellation and the prepared package is available to your trusted person.' : hasActiveEmergencyRequest ? `The waiting period is active. You can still cancel before ${emergencyDraft.requestWaitingEndsAt ? formatAppDate(emergencyDraft.requestWaitingEndsAt, true) : 'it ends'}.` : 'Nothing is released unless an Emergency Access request reaches this step. Once the waiting period ends, Password-Encrypt checks automatically and emails the final package link.'}</small></span>
                      <span className="emergency-flow-stage-action">
                        {hasActiveEmergencyRequest ? <CustomSelect value="" placeholder="Waiting-period actions" ariaLabel="Waiting period actions" className="emergency-flow-action-select" menuClassName="emergency-flow-action-menu" options={emergencyWaitingStageOptions} onChange={runEmergencyFlowAction} /> : isEmergencyReleaseReady ? <span className="emergency-flow-complete-label">Package released</span> : <span className="emergency-flow-waiting-label">Waiting for Step 5</span>}
                      </span>
                      <span className={`emergency-flow-stage-status ${isEmergencyReleaseReady ? 'done' : ''}`}>{isEmergencyReleaseReady ? <Check size={29} strokeWidth={3} /> : <span>6</span>}</span>
                    </div>
                  </section>
                </div>

                {emergencyInviteState.message && <div className="emergency-flow-latest-message"><strong>Latest update</strong><span>{emergencyInviteState.message}</span></div>}

                <div className="settings-drilldown-stack emergency-flow-secondary-tools">
                  <details className="settings-drilldown" onToggle={(event) => { if (event.currentTarget.open && emergencyDraft.invitationId) checkEmergencyInvitationStatus({ silent: true }); }}>
                    <summary><span className="settings-directory-icon"><FileText size={21} /></span><span className="settings-directory-copy"><strong>Event history</strong><small>Optional audit of this Trusted Person flow with dates and times.</small></span><ChevronRight size={21} className="settings-directory-chevron" /></summary>
                    <div className="settings-drilldown-content">
                      <div className="emergency-flow-audit-list">
                        {emergencyFlowEvents.map((event) => <article key={event.id || `${event.type}-${event.occurredAt}`}><span className="emergency-flow-audit-dot" /><div><strong>{event.title || String(event.type || '').replace(/_/g, ' ')}</strong>{event.message && <p>{event.message}</p>}<small>{event.occurredAt ? formatAppDate(event.occurredAt, true) : 'Time unavailable'}</small></div></article>)}
                        {!emergencyFlowEvents.length && <p className="emergency-flow-audit-empty">No flow events are recorded yet.</p>}
                      </div>
                    </div>
                  </details>

                  <details className="settings-drilldown emergency-flow-manage">
                    <summary><span className="settings-directory-icon"><Settings size={21} /></span><span className="settings-directory-copy"><strong>Manage or reset this flow</strong><small>Use this only for maintenance actions such as returning the entire Trusted Person flow to zero.</small></span><ChevronRight size={21} className="settings-directory-chevron" /></summary>
                    <div className="settings-drilldown-content">
                      {emergencyManagementOptions.length ? <div className="emergency-action-select-row"><CustomSelect value="" placeholder="Manage flow" ariaLabel="Manage Trusted Person flow" className="emergency-flow-action-select" menuClassName="emergency-flow-action-menu" options={emergencyManagementOptions} onChange={runEmergencyFlowAction} disabled={emergencyInviteState.status === 'resetting'} /></div> : <p className="emergency-flow-audit-empty">There are no flow maintenance actions available yet.</p>}
                    </div>
                  </details>
                </div>
                {emergencyDraft.updatedAt && <p className="emergency-access-updated">Last saved: {formatAppDate(emergencyDraft.updatedAt, true)}</p>}
              </form>
              </section>
              )}

              {activeSettingsSection === 'emergency-receive' && (
              <section className="emergency-access-purpose-section emergency-access-receive-section" aria-labelledby="emergency-receive-title">
                <div className="emergency-access-purpose-heading">
                  <span className="emergency-access-purpose-icon"><KeyRound size={22} /></span>
                  <div>
                    <p className="eyebrow">Receive</p>
                    <h4 id="emergency-receive-title">Receive an Emergency Package</h4>
                    <p>Enter an Import Code from a package released to you and keep received packages together in your own encrypted vault.</p>
                  </div>
                </div>

                <section className="settings-inner-card emergency-received-settings-card" aria-label="Import Emergency Package">
                  <div className="emergency-received-settings-header">
                    <span className="emergency-received-settings-icon"><KeyRound size={21} /></span>
                    <div><strong>Import Emergency Package</strong><small>Enter the Import Code from a released Emergency Package to add it securely to this vault.</small></div>
                    <button type="button" className="primary-button" onClick={openEmergencyImportCodeModal}><KeyRound size={17} /> Enter Import Code</button>
                  </div>
                  <div className="emergency-received-settings-list">
                    <strong>Emergency Packages received</strong>
                    {receivedEmergencyPackages.length ? receivedEmergencyPackages.map((received) => (
                      <button type="button" className="emergency-access-package-link" key={received.fingerprint} onClick={() => { setQuery(''); openVaultSection(received.folderName); }}>
                        <span><b>{received.ownerName || 'Account owner'}</b><small>{received.importedAt ? `Imported ${formatAppDate(received.importedAt, true)}` : 'Imported package'} · {received.itemCount || 0} item(s){received.documentCount ? ` · ${received.documentCount} document(s)` : ''}</small></span>
                        <ChevronRight size={18} />
                      </button>
                    )) : <p>No Emergency Packages have been imported into this vault yet.</p>}
                  </div>
                </section>
              </section>
              )}
            </section>
          )}

          {activeSettingsSection === 'safety' && (
            <section className="settings-section-panel vault-safety-panel" aria-label="Vault Safety">
              <div className="settings-section-heading">
                <p className="eyebrow">Vault Safety</p>
                <h3><ShieldCheck size={20} /> Keep every change protected</h3>
                <p>See at a glance whether your latest vault changes are safely backed up and available on your devices.</p>
              </div>

              {!featureIncluded('cloudBackupSync') && <div className="plan-feature-unavailable"><Cloud size={21} /><span><strong>Cloud backup and sync are not included</strong><small>Your encrypted vault remains available on this device. Cross-device refresh, cloud recovery points and automatic backup require an upgrade or Admin override.</small></span><button type="button" className="secondary-button" onClick={() => showEntitlementUpgrade('cloudBackupSync')}>Review plan</button></div>}

              <div className="settings-drilldown-stack">
                <details className="settings-drilldown">
                  <summary><span className="settings-directory-icon"><ShieldCheck size={21} /></span><span className="settings-directory-copy"><strong>Current protection status</strong><small>See whether the latest vault copy is protected and up to date.</small></span><ChevronRight size={21} className="settings-directory-chevron" /></summary>
                  <div className="settings-drilldown-content">
              <div className={`vault-safety-status-card ${!featureIncluded('cloudBackupSync') ? 'plan-local-only' : vaultVerificationRequired || vaultSessionCheckFailed || vaultCloudAccessPaused ? 'pending' : syncSafety.conflict ? 'conflict' : syncSafety.pending ? 'pending' : syncSafety.state === 'unknown' ? 'unknown' : 'safe'}`}>
                <div className="vault-safety-status-icon">{!featureIncluded('cloudBackupSync') ? <Database size={27} /> : vaultVerificationRequired || vaultSessionCheckFailed || vaultCloudAccessPaused || syncSafety.conflict || syncSafety.pending ? <AlertTriangle size={27} /> : <ShieldCheck size={27} />}</div>
                <div>
                  <strong>{!featureIncluded('cloudBackupSync') ? 'Your vault is stored locally on this device' : vaultSessionCheckFailed ? 'Device verification status needs checking' : vaultVerificationRequired ? 'Device verification required' : vaultCloudAccessPaused ? 'Cloud backup is paused' : syncSafety.conflict ? 'Different vault changes need review' : syncSafety.pending ? 'Changes are waiting to be backed up' : syncSafety.state === 'unknown' ? 'Vault safety has not been checked yet' : 'Your vault is up to date'}</strong>
                  <span>{!featureIncluded('cloudBackupSync') ? 'Local saves continue to be encrypted. They are not backed up or available on another device under the current plan.' : vaultSessionCheckFailed ? 'Password-Encrypt could not confirm the current verified-device session. Use Vault Status to check again.' : vaultVerificationRequired ? (customerSession.message || 'Verify this device before secure backup and syncing can continue.') : vaultCloudAccessPaused ? (customerSession.message || 'This device is verified, but cloud backup and syncing are currently paused.') : syncSafety.message || (syncSafety.pending ? 'Your latest changes are currently stored on this device only.' : syncSafety.state === 'unknown' ? 'Use Check and back up now to confirm this device is protected.' : 'Your latest changes are protected and available on your verified devices.')}</span>
                  <small>{featureIncluded('cloudBackupSync') ? `${syncSafety.lastSuccessAt ? `Last successful backup: ${formatAppDate(syncSafety.lastSuccessAt, true)}` : 'No successful backup recorded on this device yet.'}${syncSafety.itemCount ? ` · ${syncSafety.itemCount} item(s)` : ''}` : `${getVisibleVaultItems(items).length} vault item(s) stored in this device’s encrypted local copy`}</small>
                </div>
              </div>

                  </div>
                </details>

                <details className="settings-drilldown">
                  <summary><span className="settings-directory-icon"><Cloud size={21} /></span><span className="settings-directory-copy"><strong>Backup & sync</strong><small>Protect local changes and check for changes from another verified device.</small></span><ChevronRight size={21} className="settings-directory-chevron" /></summary>
                  <div className="settings-drilldown-content">
              <div className="vault-safety-action-grid">
                <button type="button" className="settings-tool-card primary-safety-action" disabled={syncing || cloudChangeCheckBusy || (featureIncluded('cloudBackupSync') && syncSafety.conflict)} onClick={retryPendingBackup}><Cloud size={20} /><strong>{!featureIncluded('cloudBackupSync') ? 'Cloud backup unavailable' : syncing ? 'Protecting changes...' : syncSafety.pending ? 'Back up changes now' : 'Check and back up now'}</strong><span>{featureIncluded('cloudBackupSync') ? 'Securely protect the latest vault copy from this device.' : 'Review your plan to make this vault available on verified devices.'}</span></button>
                <button type="button" className={`settings-tool-card ${cloudChangeCheckBusy ? 'is-working' : ''}`} onClick={restoreCloudToThisDevice} disabled={syncing || cloudChangeCheckBusy}><RefreshCw size={20} className={cloudChangeCheckBusy ? 'spin-icon' : ''} /><strong>{!featureIncluded('cloudBackupSync') ? 'Cross-device refresh unavailable' : cloudChangeCheckBusy ? 'Checking for changes...' : 'Check for changes from another device'}</strong><span>{featureIncluded('cloudBackupSync') ? (cloudChangeCheckBusy ? 'Comparing this device with the latest protected cloud copy.' : 'Nothing is replaced if different changes are found.') : 'Cloud backup and sync are required for this action.'}</span></button>
              </div>

              {featureIncluded('cloudBackupSync') && !customerSession.authenticated && (
                <div className="vault-safety-verification-card"><UserRoundCheck size={21} /><span><strong>Device verification required</strong><small>Verify this device before secure backup and syncing can continue.</small></span><button type="button" className="secondary-button" onClick={openDeviceVerification}>Verify device</button></div>
              )}


                  </div>
                </details>

                <details className="settings-drilldown">
                  <summary><span className="settings-directory-icon"><Database size={21} /></span><span className="settings-directory-copy"><strong>Recovery tools</strong><small>Review recovery points or clear the encrypted local vault on this device.</small></span><ChevronRight size={21} className="settings-directory-chevron" /></summary>
                  <div className="settings-drilldown-content">
              <div className="advanced-recovery-card settings-inner-card">
                  <p>These controls are only needed when changing devices or recovering an earlier secure copy.</p>
                  <button type="button" className={`secondary-button recovery-check-button ${snapshotHistory.loading ? 'is-working' : ''}`} disabled={snapshotHistory.loading} onClick={() => loadSnapshotHistory(true)}>{snapshotHistory.loading ? <RefreshCw size={17} className="spin-icon" /> : <Database size={17} />} {featureIncluded('cloudBackupSync') ? (snapshotHistory.loading ? 'Checking recovery points...' : 'Checkup recovery points') : 'Recovery points unavailable'}</button>
                  {snapshotHistory.loaded && <p className={`recovery-check-status ${snapshotHistory.snapshots.length ? 'success' : ''}`}>{snapshotHistory.message}</p>}
                  {!!snapshotHistory.snapshots.length && <p className="recovery-summary">{snapshotHistory.total} encrypted recovery point(s) are available. The latest contains {snapshotHistory.snapshots[0]?.item_count || 0} item(s) from {formatAppDate(snapshotHistory.snapshots[0]?.created_at, true)}.</p>}
                  <button type="button" className="clear-local-vault-link" onClick={resetLocalVaultOnDevice}>Clear local vault on this device</button>
                </div>
                  </div>
                </details>
              </div>
            </section>
          )}

          {activeSettingsSection === 'faq' && (
            <section className="settings-section-panel settings-faq-panel" aria-label="Frequently asked questions">
              <div className="settings-faq-hero">
                <div className="settings-faq-hero-icon"><CircleHelp size={28} /></div>
                <div>
                  <p className="eyebrow">Help centre</p>
                  <h3>Frequently asked questions</h3>
                  <p>Clear guidance for vault security, account verification, backups, devices, documents and Emergency Access.</p>
                </div>
                <Sparkles className="settings-faq-sparkle" size={24} aria-hidden="true" />
              </div>

              <div className="settings-faq-quick-grid" aria-label="Popular help topics">
                <article><KeyRound size={20} /><strong>Vault access</strong><span>Master passwords and secure device unlock.</span></article>
                <article><Cloud size={20} /><strong>Backup and restore</strong><span>Local vaults, cloud snapshots and new devices.</span></article>
                <article><UsersRound size={20} /><strong>Emergency Access</strong><span>Invites, waiting periods and release scope.</span></article>
              </div>

              <div className="settings-faq-list">
                {SETTINGS_FAQS.map((faq, index) => (
                  <details className="settings-faq-item" key={`${faq.category}-${index}`}>
                    <summary>
                      <span><small>{faq.category}</small><strong>{faq.question}</strong></span>
                      <Plus size={18} className="settings-faq-plus" aria-hidden="true" />
                    </summary>
                    <p>{faq.answer}</p>
                  </details>
                ))}
              </div>

              <div className="settings-faq-support-card">
                <div><Mail size={20} /><span><strong>Still need help?</strong><small>Email support from the address linked to your account. Never include your master password or decrypted vault contents.</small></span></div>
                <a href="mailto:info@zippyweb.uk">info@zippyweb.uk</a>
                <div className="settings-legal-links"><a href="/terms" target="_blank" rel="noreferrer">Terms</a><a href="/privacy" target="_blank" rel="noreferrer">Privacy</a><a href="/billing-terms" target="_blank" rel="noreferrer">Billing & refunds</a></div>
              </div>
            </section>
          )}


        </section>
      )}


      {emergencyImportState.visible && (
        <div className="item-popup-layer" role="dialog" aria-modal="true" aria-label="Import Emergency Package">
          <button type="button" className="item-popup-backdrop" onClick={() => closeEmergencyImportModal()} aria-label="Close Emergency Package import" />
          <article className="item-popup-card emergency-import-popup-card">
            <div className="item-popup-header">
              <h2><ShieldCheck size={20} /> Import Emergency Package</h2>
              <button type="button" className="icon-button" onClick={() => closeEmergencyImportModal()} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="item-popup-body emergency-import-popup-body">
              {emergencyImportState.status === 'loading' ? (
                <div className="emergency-import-loading"><RefreshCw size={22} className="spin-icon" /><strong>Checking the released package...</strong><span>Please keep this page open.</span></div>
              ) : ['code-entry', 'error'].includes(emergencyImportState.status) ? (
                <>
                  <div className="emergency-import-code-intro">
                    <KeyRound size={24} />
                    <div><strong>Enter the Emergency Package Import Code</strong><span>The code is shown on the released Emergency Package page. It securely connects that released package to your Password-Encrypt account.</span></div>
                  </div>
                  <label className="emergency-import-code-field">
                    <span>Import Code</span>
                    <input type="text" inputMode="text" autoCapitalize="characters" autoCorrect="off" spellCheck="false" maxLength={24} placeholder="ABCD-EFGH-JKLM-NPQR-STUV" value={emergencyImportState.codeInput} onChange={(event) => updateEmergencyImportCodeInput(event.target.value)} />
                  </label>
                  <div className="emergency-import-notice"><strong>Protected by your nominated identity</strong><span>The code works only after this device is verified and the email on your Password-Encrypt account matches the email nominated by the package owner.</span></div>
                  {emergencyImportState.status === 'error' && <div className="emergency-invite-status error">{emergencyImportState.message}</div>}
                </>
              ) : (
                <>
                  <div className="emergency-import-hero">
                    <ShieldCheck size={24} />
                    <div><strong>{emergencyImportState.packageData?.ownerName || 'Emergency Package'}</strong><span>{emergencyImportState.packageData?.itemCount || 0} released item(s) · {emergencyImportState.packageData?.documentCount || 0} document(s) · {emergencyImportState.packageData?.pictureCount || 0} picture(s)</span></div>
                  </div>
                  {emergencyImportState.status === 'duplicate' ? (
                    <div className="emergency-import-notice"><strong>Already imported</strong><span>This exact released package is already stored in <b>{emergencyImportState.duplicateFolder}</b>. Password-Encrypt will not create a duplicate copy.</span></div>
                  ) : (
                    <>
                      <p>This will create a new vault folder for the package and copy the released items into your own encrypted Password-Encrypt vault.</p>
                      <div className="emergency-import-notice"><strong>Kept separate from your own records</strong><span>Imported items keep their original type, but stay together in one Emergency Package folder. Documents and pictures are re-encrypted into your own vault before they are stored.</span></div>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="item-popup-footer emergency-import-popup-footer">
              <button type="button" className="secondary-button" onClick={() => closeEmergencyImportModal()} disabled={emergencyImportState.busy}>Cancel</button>
              {['code-entry', 'error'].includes(emergencyImportState.status) ? (
                <button type="button" className="primary-button" onClick={checkEmergencyPackageImportCode} disabled={emergencyImportState.busy || normaliseEmergencyImportCode(emergencyImportState.codeInput).length !== EMERGENCY_IMPORT_CODE_LENGTH}><KeyRound size={16} /> Check code</button>
              ) : emergencyImportState.status === 'duplicate' ? (
                <button type="button" className="primary-button" onClick={() => openImportedEmergencyFolder(emergencyImportState.duplicateFolder)}>Open imported folder</button>
              ) : emergencyImportState.status === 'ready' ? (
                <button type="button" className="primary-button" onClick={importEmergencyPackageIntoVault} disabled={emergencyImportState.busy}><Upload size={16} /> Add to my vault</button>
              ) : null}
            </div>
          </article>
        </div>
      )}

      {viewedItem && (
        <div className="item-popup-layer" role="dialog" aria-modal="true" aria-label="View vault item">
          <button type="button" className="item-popup-backdrop" onClick={closeViewItem} aria-label="Close item popup" />
          <article className="item-popup-card view-item-popup-card">
            <div className="item-popup-header">
              <h2><ShieldCheck size={20} /> {viewedItem.title}</h2>
              <button type="button" className="icon-button" onClick={closeViewItem} aria-label="Close"><X size={18} /></button>
            </div>
            <div className="item-popup-body">
              <div className="view-item-meta">
                <span className="category-pill">{viewedItem.category}</span>
                {isEmergencyImportedItem(viewedItem) && <span className="category-pill emergency-import-source-pill">From {effectiveVaultItemType(viewedItem)}</span>}
                {[DOCUMENTS_CATEGORY, PICTURES_CATEGORY].includes(effectiveVaultItemType(viewedItem)) && <button type="button" className="category-pill document-share-pill" onClick={() => shareStoredDocument(viewedItem)} disabled={sharingDocId === viewedItem.id} aria-label={`Share ${viewedItem.title || 'file'}`} title="Share file"><Share2 size={14} /> {sharingDocId === viewedItem.id ? 'Preparing...' : 'Share'}</button>}
                {viewedItem.favourite && <span className="category-pill favourite-mini"><Star size={14} fill="currentColor" /> Favourite</span>}
              </div>
              {(() => {
                const visible = !!showSecrets[viewedItem.id];
                const itemType = effectiveVaultItemType(viewedItem);
                const importedItem = isEmergencyImportedItem(viewedItem);
                const emergencyHub = isEmergencyAccessHubItem(viewedItem);
                if (emergencyHub) {
                  const receivedPackages = emergencyAccessHubPackages(viewedItem);
                  return (
                    <div className="emergency-access-hub-view">
                      <div className="emergency-access-hub-card">
                        <UsersRound size={22} />
                        <div><strong>Your Trusted Person Access</strong><span>Choose who should receive your prepared Emergency Package if they ever need to request access.</span></div>
                        <button type="button" className="secondary-button" onClick={() => { closeViewItem(); setActivePage('settings'); setActiveSettingsSection('emergency-nominate'); scrollSettingsToTop(); }}>Manage</button>
                      </div>
                      <div className="emergency-access-hub-card emergency-access-import-card">
                        <KeyRound size={22} />
                        <div><strong>Import Emergency Package</strong><span>Enter an Import Code from a released Emergency Package to add it as a separate folder in this vault.</span></div>
                        <button type="button" className="secondary-button" onClick={() => { closeViewItem(); openEmergencyImportCodeModal(); }}>Enter code</button>
                      </div>
                      <div className="emergency-access-hub-received">
                        <strong>Emergency Packages received</strong>
                        {receivedPackages.length ? receivedPackages.map((received) => (
                          <button type="button" className="emergency-access-package-link" key={received.fingerprint} onClick={() => { closeViewItem(); setQuery(''); openVaultSection(received.folderName); }}>
                            <span><b>{received.ownerName || 'Account owner'}</b><small>{received.importedAt ? `Imported ${formatAppDate(received.importedAt, true)}` : 'Imported package'} · {received.itemCount || 0} item(s)</small></span>
                            <ChevronRight size={18} />
                          </button>
                        )) : <p>No Emergency Packages have been imported into this vault yet.</p>}
                      </div>
                      <p className="emergency-access-hub-note">When someone releases an Emergency Package to you, copy the Import Code shown on their secure release page and enter it above. Password-Encrypt keeps the received package together in its own folder here.</p>
                    </div>
                  );
                }
                const isNote = itemType === 'Notes';
                const isChecklist = itemType === 'Checklists';
                const isDocument = itemType === DOCUMENTS_CATEGORY;
                const isPicture = itemType === PICTURES_CATEGORY;
                const isStoredFile = isDocument || isPicture;
                const isCard = itemType === CARDS_CATEGORY;
                const storedDocument = viewedItem.payload?.file;
                const checklistRows = isChecklist ? parseChecklistNotes(viewedItem.payload?.notes) : [];
                return (
                  <>
                    {viewedItem.payload?.url && !isChecklist && !isStoredFile && !isCard && (
                      <div className="app-field-block">
                        <span className="app-field-label">Website / Link</span>
                        <div className="app-value-field link-field">
                          <a href={viewedItem.payload.url} target="_blank" rel="noreferrer">{viewedItem.payload.url}</a>
                          <button type="button" className="field-action" onClick={() => copyText('URL', viewedItem.payload.url)} aria-label="Copy URL" title="Copy URL"><Copy size={18} /></button>
                        </div>
                      </div>
                    )}
                    {!isNote && !isChecklist && !isStoredFile && !isCard && (
                      <>
                        <div className="app-field-block">
                          <span className="app-field-label">Username</span>
                          <div className="app-value-field">
                            <span className="app-field-value">{viewedItem.payload?.username || '—'}</span>
                            <button type="button" className="field-action" onClick={() => copyText('Username', viewedItem.payload?.username)} aria-label="Copy username" title="Copy username"><Copy size={18} /></button>
                          </div>
                        </div>
                        <div className="app-field-block">
                          <span className="app-field-label">Password</span>
                          <div className="app-value-field secret-field">
                            <span className="app-field-value">{visible ? viewedItem.payload?.password || '—' : '••••••••••••••••'}</span>
                            <button type="button" className="field-action" onClick={() => setShowSecrets({ ...showSecrets, [viewedItem.id]: !visible })} aria-label={visible ? 'Hide password' : 'Show password'} title={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                            <button type="button" className="field-action" onClick={() => copyText('Secret', viewedItem.payload?.password)} aria-label="Copy password" title="Copy password"><Copy size={18} /></button>
                          </div>
                        </div>
                      </>
                    )}

                    {isCard && (
                      <div className="card-detail-panel">
                        <div className="card-detail-header">
                          <div>
                            <span className="app-field-label">Card details</span>
                            <strong>{viewedItem.payload?.cardNickname || viewedItem.title}</strong>
                            <small className="card-detail-subtitle">{viewedItem.payload?.cardName || 'Name on card not saved'}</small>
                          </div>
                          <button type="button" className="secondary-button copy-all-button" onClick={() => copyText('Card details', buildCardCopyText(viewedItem))} aria-label="Copy all card details"><Copy size={16} /> Copy all</button>
                        </div>
                        <div className="app-field-block">
                          <span className="app-field-label">Nickname</span>
                          <div className="app-value-field">
                            <span className="app-field-value">{viewedItem.payload?.cardNickname || viewedItem.title || '—'}</span>
                            <button type="button" className="field-action" onClick={() => copyText('Card nickname', viewedItem.payload?.cardNickname || viewedItem.title)} aria-label="Copy card nickname" title="Copy card nickname"><Copy size={18} /></button>
                          </div>
                        </div>
                        <div className="app-field-block">
                          <span className="app-field-label">Name on card</span>
                          <div className="app-value-field">
                            <span className="app-field-value">{viewedItem.payload?.cardName || '—'}</span>
                            <button type="button" className="field-action" onClick={() => copyText('Name on card', viewedItem.payload?.cardName)} aria-label="Copy name on card" title="Copy name on card"><Copy size={18} /></button>
                          </div>
                        </div>
                        <div className="app-field-block">
                          <span className="app-field-label">16 digit card number</span>
                          <div className="app-value-field secret-field">
                            <span className="app-field-value">{visible ? formatCardNumber(viewedItem.payload?.cardNumber) : maskCardNumber(viewedItem.payload?.cardNumber)}</span>
                            <button type="button" className="field-action" onClick={() => setShowSecrets({ ...showSecrets, [viewedItem.id]: !visible })} aria-label={visible ? 'Hide card details' : 'Show card details'} title={visible ? 'Hide card details' : 'Show card details'}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                            <button type="button" className="field-action" onClick={() => copyText('Card number', formatCardNumber(viewedItem.payload?.cardNumber))} aria-label="Copy card number" title="Copy card number"><Copy size={18} /></button>
                          </div>
                        </div>
                        <div className="card-detail-two">
                          <div className="app-field-block">
                            <span className="app-field-label">Expiry</span>
                            <div className="app-value-field">
                              <span className="app-field-value">{viewedItem.payload?.cardExpiry || '—'}</span>
                              <button type="button" className="field-action" onClick={() => copyText('Expiry', viewedItem.payload?.cardExpiry)} aria-label="Copy expiry" title="Copy expiry"><Copy size={18} /></button>
                            </div>
                          </div>
                          <div className="app-field-block">
                            <span className="app-field-label">CCV</span>
                            <div className="app-value-field secret-field">
                              <span className="app-field-value">{visible ? viewedItem.payload?.cardCcv || '—' : maskCcv(viewedItem.payload?.cardCcv)}</span>
                              <button type="button" className="field-action" onClick={() => copyText('CCV', viewedItem.payload?.cardCcv)} aria-label="Copy CCV" title="Copy CCV"><Copy size={18} /></button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {isStoredFile && (
                      <div className="app-field-block">
                        <span className="app-field-label">Stored {isPicture ? 'picture' : 'document'}</span>
                        <div className="document-download-card">
                          {isPicture ? <ImageIcon size={24} /> : <FileText size={24} />}
                          <div>
                            <strong>{storedDocument?.name || viewedItem.title}</strong>
                            <small>{storedDocument?.extension?.toUpperCase() || 'FILE'} · {formatFileSize(storedDocument?.size)} · {storedDocument?.storedExternally ? 'Encrypted file storage' : 'Vault storage'}</small>
                          </div>
                          {isPicture && <button type="button" className="secondary-button document-download-button" onClick={() => previewStoredPicture(viewedItem)} disabled={picturePreview.busy && picturePreview.itemId === viewedItem.id}><Eye size={16} /> {picturePreview.busy && picturePreview.itemId === viewedItem.id ? 'Opening...' : 'View'}</button>}
                          <button type="button" className="secondary-button document-download-button" onClick={() => downloadStoredDocument(viewedItem)} disabled={downloadingDocId === viewedItem.id || (!storedDocument?.dataUrl && !storedDocument?.externalDocumentId)}><Download size={16} /> {downloadingDocId === viewedItem.id ? 'Preparing...' : 'Download'}</button>
                        </div>
                        {isPicture && picturePreview.itemId === viewedItem.id && picturePreview.dataUrl && <div className="stored-picture-preview"><img src={picturePreview.dataUrl} alt={viewedItem.title || 'Stored picture'} /></div>}
                      </div>
                    )}
                    {isChecklist ? (
                      <div className="app-field-block">
                        <span className="app-field-label">Checklist</span>
                        <div className="checklist-display">
                          {checklistRows.length ? checklistRows.map((row) => (
                            <button type="button" key={`${viewedItem.id}-${row.index}-${row.text}`} className={row.done ? 'checklist-line done' : 'checklist-line'} onClick={() => { if (!importedItem) toggleChecklistLine(viewedItem, row.index); }} disabled={importedItem}>
                              <span className="check-box">{row.done ? '✓' : ''}</span>
                              <span>{row.text}</span>
                            </button>
                          )) : <span className="app-field-value">No checklist items yet.</span>}
                        </div>
                      </div>
                    ) : viewedItem.payload?.notes && (
                      <div className="app-field-block">
                        <span className="app-field-label">Notes</span>
                        <div className="app-value-field notes-field">
                          <span className="app-field-value multiline">{viewedItem.payload.notes}</span>
                          <button type="button" className="field-action" onClick={() => copyText('Notes', viewedItem.payload.notes)} aria-label="Copy notes" title="Copy notes"><Copy size={18} /></button>
                        </div>
                      </div>
                    )}
                    <p className="updated">Updated {formatAppDate(viewedItem.updatedAt, true)}</p>
                  </>
                );
              })()}
            </div>
            <div className="item-popup-footer view-item-footer">
              <div className="view-action-row">
                {!isEmergencyAccessHubItem(viewedItem) && !isEmergencyImportedItem(viewedItem) && <button type="button" className="secondary-button view-action-button" onClick={() => editViewedItem(viewedItem)} aria-label="Edit item"><Pencil size={16} /> <span>Edit</span></button>}
                {!isEmergencyAccessHubItem(viewedItem) && <button type="button" className="secondary-button view-action-button" onClick={() => toggleFavourite(viewedItem.id)} aria-label={viewedItem.favourite ? 'Unfavourite item' : 'Favourite item'}><Star size={16} fill={viewedItem.favourite ? 'currentColor' : 'none'} /> <span>{viewedItem.favourite ? 'Unfavourite' : 'Favourite'}</span></button>}
                {!isEmergencyAccessHubItem(viewedItem) && <button type="button" className="secondary-button danger-soft view-action-button" onClick={() => requestDeleteItem(viewedItem)} aria-label="Delete item"><Trash2 size={16} /> <span>Delete</span></button>}
              </div>
              <button type="button" className="primary-button view-done-button" onClick={closeViewItem}>Done</button>
            </div>
          </article>
        </div>
      )}



      {pendingDeleteItemId && (() => {
        const itemToDelete = items.find((item) => item.id === pendingDeleteItemId);
        if (!itemToDelete) return null;
        return (
          <div className="item-popup-layer delete-confirm-layer" role="presentation">
            <div className="item-popup-backdrop" onClick={cancelDeleteItem} />
            <section className="item-popup-card delete-confirm-card" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title">
              <header className="item-popup-header">
                <h2 id="delete-confirm-title"><Trash2 size={21} /> Delete this item?</h2>
                <button type="button" className="icon-button" onClick={cancelDeleteItem} aria-label="Cancel delete"><X size={20} /></button>
              </header>
              <div className="item-popup-body delete-confirm-body">
                <div className="delete-confirm-icon"><AlertTriangle size={28} /></div>
                <p className="delete-confirm-lead">Please confirm you want to delete this saved item from your vault.</p>
                <div className="delete-confirm-item-name">{itemToDelete.title || 'Untitled item'}</div>
                <p className="delete-confirm-copy">This removes the item from this device and then protects the updated vault. This action cannot be undone from the app screen.</p>
              </div>
              <footer className="item-popup-footer delete-confirm-footer">
                <button type="button" className="secondary-button" onClick={cancelDeleteItem}><X size={16} /> Cancel</button>
                <button type="button" className="danger-delete-button" onClick={confirmDeleteItem}><Trash2 size={16} /> Delete item</button>
              </footer>
            </section>
          </div>
        );
      })()}

      {subscriptionActionModal.visible && (
        <div className="item-popup-layer subscription-action-layer" role="presentation">
          <div className="item-popup-backdrop" onClick={() => billing.status !== 'updating' && setSubscriptionActionModal({ visible: false, action: '', title: '', message: '', planCode: '', interval: '', mode: '' })} />
          <section className="item-popup-card subscription-action-modal" role="dialog" aria-modal="true" aria-labelledby="subscription-action-title">
            <header className="item-popup-header">
              <h2 id="subscription-action-title"><CreditCard size={21} /> {subscriptionActionModal.title}</h2>
              <button type="button" className="icon-button" onClick={() => setSubscriptionActionModal({ visible: false, action: '', title: '', message: '', planCode: '', interval: '', mode: '' })} disabled={billing.status === 'updating'} aria-label="Close subscription confirmation"><X size={20} /></button>
            </header>
            <div className="item-popup-body subscription-action-body">
              <div className={`subscription-action-symbol ${subscriptionActionModal.mode}`}><CalendarClock size={28} /></div>
              <p>{subscriptionActionModal.message}</p>
              <div className="subscription-action-safety"><ShieldCheck size={18} /><span>Stripe securely processes payments. Password-Encrypt does not receive or store your full card details.</span></div>
            </div>
            <footer className="item-popup-footer subscription-action-footer">
              <button type="button" className="secondary-button" onClick={() => setSubscriptionActionModal({ visible: false, action: '', title: '', message: '', planCode: '', interval: '', mode: '' })} disabled={billing.status === 'updating'}>Go back</button>
              <button type="button" className="primary-button" onClick={confirmSubscriptionAction} disabled={billing.status === 'updating'}>{billing.status === 'updating' ? 'Updating...' : subscriptionActionModal.action === 'cancel_at_period_end' ? 'Schedule cancellation' : subscriptionActionModal.action === 'reactivate' ? 'Keep active' : subscriptionActionModal.mode === 'immediate' ? 'Confirm upgrade' : 'Schedule change'}</button>
            </footer>
          </section>
        </div>
      )}

      {trustedPersonHelpOpen && (
        <div className="item-popup-layer trusted-person-help-popup-layer" role="dialog" aria-modal="true" aria-labelledby="trusted-person-help-title">
          <button type="button" className="item-popup-backdrop" onClick={() => setTrustedPersonHelpOpen(false)} aria-label="Close Trusted Person help" />
          <section className="item-popup-card trusted-person-help-popup-card">
            <header className="item-popup-header">
              <div>
                <p className="eyebrow">Trusted Person Planning</p>
                <h2 id="trusted-person-help-title"><CircleHelp size={20} /> Help &amp; FAQs</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setTrustedPersonHelpOpen(false)} aria-label="Close Trusted Person help"><X size={18} /></button>
            </header>
            <div className="item-popup-body trusted-person-help-popup-body">
              <div className="trusted-person-help-intro">
                <ShieldCheck size={21} />
                <div><strong>Designed for serious emergencies</strong><p>Trusted Person Access is intended for next of kin or another person you trust if you are incapacitated, seriously ill, or cannot access your vault yourself.</p></div>
              </div>
              <div className="emergency-access-qa-card trusted-person-help-faq">
                <strong>Setting up your Trusted Person</strong>
                <details open><summary>What do Stages 1–4 mean?</summary><p>Stages 1–4 are the setup journey: add your trusted person, prepare the emergency package, send the invitation, and wait for them to accept. Once Stage 4 is complete, your Trusted Person arrangement is set up.</p></details>
                <details><summary>What happens after my trusted person accepts?</summary><p>Nothing is released. They receive a separate secure Emergency Access link to keep for the future. Password-Encrypt also sends a routine reminder every three months while the flow is dormant so they can confirm they are still happy to remain your trusted person.</p></details>
                <details><summary>What are Stages 5 and 6?</summary><p>Stages 5 and 6 are emergency-only. They are not part of setup and remain dormant unless your trusted person later uses their saved Emergency Access link in a genuine emergency.</p></details>
                <details><summary>What happens when Emergency Access is requested?</summary><p>Your chosen waiting period starts and you are notified. No vault contents are released while the waiting period is active, and you can cancel the request before the waiting period ends.</p></details>
                <details><summary>Will my trusted person receive the latest version of my vault?</summary><p>Yes, for the folders and documents you chose to release. While the Trusted Person arrangement is active, Password-Encrypt refreshes the prepared package whenever included vault information changes and again when the unlocked vault comes online. Because the server cannot decrypt your vault by itself, the app must be unlocked and online for a refresh to complete. When the waiting period finishes, that latest prepared package is frozen as the release snapshot so later vault changes are not silently shared.</p></details>
                <details><summary>Does my trusted person need the Password-Encrypt app?</summary><p>No. Invitation, confirmation and Emergency Access links open in a normal browser. They do not need to install the PWA or create their own vault. If they already use Password-Encrypt, the released package page gives them an Import Code. They enter it under Settings → Protection and recovery → Emergency Access — Receive an Emergency Package to add the package to their own encrypted vault as a separate Emergency Package folder.</p></details>
                <details><summary>How will they know when the waiting period has ended?</summary><p>Password-Encrypt checks the waiting period automatically. When it completes without cancellation, the trusted person is emailed a secure link to the emergency package you prepared. That released-package link remains available for 30 days.</p></details>
                <details><summary>What is Full vault access?</summary><p>Full vault access is an explicit next-of-kin option that prepares the selected emergency package without saving or sending your master password.</p></details>
                <details><summary>What does Reset to zero do?</summary><p>Reset to zero removes the trusted person, invitation and request records, secure links, emergency-package setup and the flow audit history so you can start again from Stage 1.</p></details>
              </div>
            </div>
            <footer className="item-popup-footer trusted-person-help-popup-footer"><button type="button" className="primary-button" onClick={() => setTrustedPersonHelpOpen(false)}>Back to Trusted Person Planning</button></footer>
          </section>
        </div>
      )}

      {billingLegalModalOpen && (
        <div className="item-popup-layer signup-legal-popup-layer" role="dialog" aria-modal="true" aria-labelledby="billing-legal-popup-title">
          <button type="button" className="item-popup-backdrop" onClick={() => setBillingLegalModalOpen(false)} aria-label="Close billing policy" />
          <section className="item-popup-card signup-legal-popup-card">
            <header className="item-popup-header">
              <div>
                <p className="eyebrow">Subscription terms</p>
                <h2 id="billing-legal-popup-title"><FileText size={20} /> Billing &amp; Refund Terms</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setBillingLegalModalOpen(false)} aria-label="Close billing policy"><X size={18} /></button>
            </header>
            <div className="item-popup-body signup-legal-popup-body">
              <LegalPage page="billing" embedded />
            </div>
            <footer className="item-popup-footer signup-legal-popup-footer">
              <button type="button" className="primary-button" onClick={() => setBillingLegalModalOpen(false)}>Back to Plan &amp; Billing</button>
            </footer>
          </section>
        </div>
      )}

      <AccountSecurityModal state={accountSecurityModal} setState={setAccountSecurityModal} onClose={closeAccountSecurityModal} onRequestCode={requestAccountSecurityOtp} onConfirmCode={confirmAccountSecurityOtp} onRemoveDevice={confirmRemoveVerifiedDevice} onEndAllSessions={confirmEndAllSessions} />
      <PlanEntitlementModal state={entitlementModal} entitlements={entitlements} onClose={() => setEntitlementModal({ visible: false, feature: '', title: '', message: '' })} onOpenSubscription={openSubscriptionFromEntitlement} />
      <DeviceVerificationModal state={deviceVerificationModal} email={bootstrap.email} phone={bootstrap.phoneE164 || buildPhoneE164(bootstrap.phoneCountryCode, bootstrap.phoneNumber)} channel={otpChannel} otp={otpTest} onClose={() => setDeviceVerificationModal({ visible: false, purpose: '' })} onChannelChange={chooseOtpChannel} onSend={() => requestSelectedOtp({ popupFlow: true })} onChange={(value) => setOtpTest((current) => ({ ...current, input: value.replace(/\D/g, '').slice(0, 6) }))} onVerify={verifyTestOtp} />
      <SyncSafetyModal state={syncSafetyModal} onClose={closeSyncSafetyModal} onRetry={retryPendingBackup} onVerify={openDeviceVerification} onOpenSafety={() => { closeSyncSafetyModal(); openVaultSafetySettings(); }} onKeepDevice={keepThisDeviceCopy} onUseCloud={useSecureBackupCopy} onConfirmDanger={confirmDangerAction} onCheck={handleVaultStatusCheck} />
      <ExitAppConfirmationModal visible={exitAppConfirmationOpen} onStay={() => setExitAppConfirmationOpen(false)} onExit={confirmExitApp} />
      <PushActivationPromptModal
        visible={pushActivationPromptOpen}
        permission={pushNotifications.permission}
        loading={pushNotifications.loading}
        onClose={() => setPushActivationPromptOpen(false)}
        onSuppress={() => { suppressPushActivationPrompt(customerSession); setPushActivationPromptOpen(false); }}
        onEnable={() => { setPushActivationPromptOpen(false); enablePushNotifications(); }}
        onReview={() => { setPushActivationPromptOpen(false); openSettingsSection('notifications'); }}
      />
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      <footer className="app-version-footer"><span>{VERSION}</span><span className="app-version-footer-separator"> · </span><span>secure private vault</span></footer>
    </main>
  );
}

const legalPage = legalPageForPath(window.location.pathname);
createRoot(document.getElementById('root')).render(
  <AppStartupBoundary>
    {window.location.pathname.startsWith('/admin') ? <AdminApp version={VERSION} /> : legalPage ? <LegalPage page={legalPage} /> : <App />}
  </AppStartupBoundary>
);
