import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Cloud, Copy, Database, Eye, EyeOff, KeyRound, Lock, Mail, MonitorSmartphone, Pencil, Phone, Plus, RefreshCw, Search, ShieldCheck, Star, Trash2, Unlock, UserRoundCheck, X } from 'lucide-react';
import './styles.css';

const VERSION = 'My Passwords Ver-0.013A';
const STORAGE_KEY = 'my-passwords-v0.002-local-vault';
const LEGACY_STORAGE_KEY = 'my-passwords-v0.001-local-vault';
const SALT_KEY = 'my-passwords-v0.002-salt';
const LEGACY_SALT_KEY = 'my-passwords-v0.001-salt';
const BOOTSTRAP_KEY = 'my-passwords-v0.002-bootstrap-profile';
const ACCOUNT_KEY = 'my-passwords-v0.011-account-identity';

const categories = ['All', 'Passwords', 'Bank Details', 'Secret Keys', 'Work Stuff', 'Links', 'Notes', 'Checklists', 'Emergency Info'];

const categoryHints = {
  Passwords: {
    title: 'e.g. Gmail, Netlify, Supabase, Barclays login',
    url: 'https://example.com',
    username: 'Email / username',
    secret: 'Password',
    notes: 'Recovery notes, 2FA app, backup codes, support number...'
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
  },
  {
    id: crypto.randomUUID(),
    title: 'Emergency Access Note',
    category: 'Emergency Info',
    favourite: false,
    payload: {
      url: '',
      username: 'Trusted person access',
      password: 'Not enabled yet',
      notes: 'Future emergency access will use waiting periods, roles and audit logs. Ver-0.013A adds test-mode OTP foundation for new-device restore while preserving local-first encrypted vault unlock.'
    },
    updatedAt: new Date().toISOString()
  }
];

function arrayBufferToBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToArrayBuffer(base64) {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)).buffer;
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

async function encryptVault(items, masterPassword) {
  let salt = localStorage.getItem(SALT_KEY) || localStorage.getItem(LEGACY_SALT_KEY);
  if (!salt) {
    salt = arrayBufferToBase64(crypto.getRandomValues(new Uint8Array(16)));
    localStorage.setItem(SALT_KEY, salt);
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(masterPassword, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(items));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const envelope = { version: VERSION, iv: arrayBufferToBase64(iv), salt, encrypted: arrayBufferToBase64(encrypted), updatedAt: new Date().toISOString() };
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

function storeCloudSnapshotLocally(snapshot) {
  const envelope = {
    version: VERSION,
    iv: snapshot.local_iv,
    salt: snapshot.local_salt,
    encrypted: snapshot.encrypted_blob,
    updatedAt: snapshot.client_updated_at || snapshot.created_at || new Date().toISOString(),
    cloudSnapshotId: snapshot.id || ''
  };
  localStorage.setItem(SALT_KEY, envelope.salt);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  return envelope;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  let data = {};
  try {
    data = await response.json();
  } catch (error) {
    data = { ok: false, message: 'Function returned a non-JSON response.' };
  }
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
  { code: '+254', label: 'Kenya +254' },
  { code: '+44', label: 'United Kingdom +44' },
  { code: '+27', label: 'South Africa +27' },
  { code: '+1', label: 'USA / Canada +1' },
  { code: '+353', label: 'Ireland +353' },
  { code: '+61', label: 'Australia +61' },
  { code: '+64', label: 'New Zealand +64' },
  { code: '+971', label: 'UAE +971' },
  { code: '+91', label: 'India +91' }
];

const defaultAccount = {
  email: '',
  phoneCountryCode: '+254',
  phoneNumber: '',
  phoneE164: '',
  displayName: 'Brian',
  tenantName: 'Brian Private Vault',
  tenantId: '',
  userId: '',
  otpStatus: 'Test-mode OTP foundation ready',
  accountVerified: false
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
    return { ok: false, message: 'Enter a mobile number with country code so SMS OTP can be added safely.' };
  }
  if (email && !email.includes('@')) {
    return { ok: false, message: 'The backup email address does not look valid.' };
  }
  return { ok: true, email, phoneCountryCode, phoneNumber, phoneE164 };
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

function App() {
  const [locked, setLocked] = useState(true);
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmMasterPassword, setConfirmMasterPassword] = useState('');
  const [hasLocalVault, setHasLocalVault] = useState(() => Boolean(readStoredVault()));
  const [createMode, setCreateMode] = useState(() => !Boolean(readStoredVault()));
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [showSecrets, setShowSecrets] = useState({});
  const [showFormSecret, setShowFormSecret] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'Passwords', url: '', username: '', password: '', notes: '', favourite: false });
  const [editingItemId, setEditingItemId] = useState('');
  const [dbStatus, setDbStatus] = useState({ checked: false, connected: false, message: 'Not checked yet.' });
  const [bootstrap, setBootstrap] = useState(() => readSavedAccount());
  const [accountStatus, setAccountStatus] = useState({ state: 'local-first', message: 'Local encrypted vault remains the normal daily unlock. Account identity is used only for cloud restore and future OTP.' });
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ state: 'idle', message: 'No encrypted cloud sync has run yet. Your live vault is only changed when you save, delete, favourite, edit or push an encrypted snapshot.', lastSyncAt: '', lastSnapshotId: '', itemCount: 0, snapshotCount: 0 });
  const [snapshotHistory, setSnapshotHistory] = useState({ loaded: false, loading: false, total: 0, snapshots: [], message: 'Snapshot history has not been loaded yet.' });
  const [deviceStatus, setDeviceStatus] = useState({
    state: 'not-checked',
    label: 'This device has not checked the encrypted cloud snapshot yet.',
    lastCloudCheckAt: '',
    lastRestoreAt: '',
    latestSnapshotId: '',
    latestCloudItemCount: 0,
    source: hasLocalVault ? 'local-encrypted-vault-present' : 'no-local-vault'
  });
  const [toasts, setToasts] = useState([]);
  const [otpTest, setOtpTest] = useState({ status: 'not-requested', challengeId: '', code: '', input: '', message: 'Test-mode OTP has not been requested yet. It does not lock or unlock the vault in this build.', verified: false, expiresAt: '' });

  const activeHint = categoryHints[form.category] || categoryHints.Passwords;

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
    setToasts((current) => [...current.slice(-3), { id, text, type }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, type === 'error' ? 6400 : 4200);
  }

  function showMessage(text, type) {
    const safeText = String(text || '');
    setMessage(safeText);
    if (safeText.trim()) showToast(safeText, type || toastTypeFromMessage(safeText));
  }

  function dismissToast(id) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  useEffect(() => {
    if (!locked && masterPassword) {
      const timeout = setTimeout(() => lockVault('Vault auto-locked after inactivity.'), 10 * 60 * 1000);
      return () => clearTimeout(timeout);
    }
  }, [locked, masterPassword, items]);

  useEffect(() => {
    const phoneE164 = bootstrap.phoneE164 || buildPhoneE164(bootstrap.phoneCountryCode, bootstrap.phoneNumber);
    const account = { ...bootstrap, phoneCountryCode: normaliseCountryCode(bootstrap.phoneCountryCode || '+254') || '+254', phoneNumber: String(bootstrap.phoneNumber || '').trim(), phoneE164 };
    localStorage.setItem(BOOTSTRAP_KEY, JSON.stringify(account));
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  }, [bootstrap]);

  async function fetchLatestCloudSnapshot(account = bootstrap) {
    if (!account.tenantId || !account.userId) return { ok: false, hasSnapshot: false, message: 'Account identity is not verified on this device yet.' };
    return fetch(`/.netlify/functions/sync-vault?tenantId=${encodeURIComponent(account.tenantId)}&userId=${encodeURIComponent(account.userId)}`).then((res) => res.json());
  }

  async function restoreLatestCloudVault(passwordToUse, { showSuccess = true, reason = 'manual', account = bootstrap } = {}) {
    const checkedAt = new Date().toISOString();
    setDeviceStatus((current) => ({
      ...current,
      state: 'checking-cloud',
      label: reason === 'unlock' ? 'Checking latest encrypted cloud vault during unlock...' : 'Checking latest encrypted cloud vault...',
      lastCloudCheckAt: checkedAt
    }));
    const latest = await fetchLatestCloudSnapshot(account);
    if (!latest?.ok || !latest?.hasSnapshot || !latest.snapshot) {
      setDeviceStatus((current) => ({
        ...current,
        state: 'no-cloud-snapshot',
        label: latest?.message || 'No encrypted cloud snapshot was found for this account. Nothing was created or overwritten.',
        lastCloudCheckAt: checkedAt
      }));
      return { restored: false, latest };
    }
    const restoredItems = await decryptEnvelope(latest.snapshot, passwordToUse);
    storeCloudSnapshotLocally(latest.snapshot);
    setHasLocalVault(true);
    setCreateMode(false);
    setConfirmMasterPassword('');
    setItems(restoredItems);
    const snapshotCount = Number(latest.snapshotCount || snapshotHistory.total || 1);
    setSyncStatus((current) => ({
      ...current,
      state: 'success',
      message: `Latest encrypted cloud snapshot restored safely on this device. ${restoredItems.length} item(s) loaded.`,
      lastSyncAt: latest.snapshot.created_at || latest.snapshot.client_updated_at || new Date().toISOString(),
      lastSnapshotId: latest.snapshot.id || current.lastSnapshotId,
      itemCount: Number(latest.snapshot.item_count ?? restoredItems.length),
      snapshotCount
    }));
    setDeviceStatus({
      state: 'cloud-restored',
      label: `This device is now using the latest encrypted cloud snapshot. Local encrypted copy refreshed safely. ${restoredItems.length} item(s) loaded.`,
      lastCloudCheckAt: new Date().toISOString(),
      lastRestoreAt: new Date().toISOString(),
      latestSnapshotId: latest.snapshot.id || '',
      latestCloudItemCount: Number(latest.snapshot.item_count ?? restoredItems.length),
      source: reason === 'unlock' ? 'auto-pulled-on-unlock' : 'manual-pull'
    });
    if (showSuccess) showMessage(`Latest encrypted cloud snapshot restored safely on this device. ${restoredItems.length} item(s) loaded.`);
    return { restored: true, items: restoredItems, latest };
  }

  async function ensureAccountIdentity({ silent = false } = {}) {
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
      otpStatus: 'pending_provider'
    };

    setAccountStatus({ state: 'checking', message: 'Checking account identity for phone/email login foundation...' });
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
        tenantId: result.tenantId,
        userId: result.userId,
        phoneE164: result.phoneE164 || payload.phoneE164,
        accountVerified: true,
        otpStatus: 'OTP provider not connected yet — account foundation ready'
      };
      setBootstrap(next);
      setAccountStatus({ state: 'ready', message: `Account identity ready. Phone is stored as ${next.phoneE164} for future SMS OTP delivery. Master password still decrypts the vault only locally.` });
      if (!silent) showMessage(`Account identity ready. Phone stored as ${next.phoneE164}. OTP provider can be connected next; vault encryption remains unchanged.`);
      return { ok: true, account: next, result };
    } catch (error) {
      const note = `Could not reach account login foundation. ${error.message || 'Use Netlify Dev locally or test after deploy.'}`;
      setAccountStatus({ state: 'error', message: note });
      if (!silent) showMessage(note, 'error');
      return { ok: false, message: note };
    }
  }

  async function requestTestOtp() {
    const checked = validateAccountIdentity(bootstrap);
    if (!checked.ok) {
      setOtpTest((current) => ({ ...current, status: 'needs-details', message: checked.message, verified: false }));
      showMessage(checked.message, 'warning');
      return;
    }
    setOtpTest((current) => ({ ...current, status: 'requesting', message: 'Requesting test-mode OTP. No SMS or email will be sent in this build.', verified: false }));
    try {
      const accountCheck = await ensureAccountIdentity({ silent: true });
      if (!accountCheck.ok) throw new Error(accountCheck.message || 'Account identity is not ready yet.');
      const result = await postJson('/.netlify/functions/request-otp-test', {
        phoneCountryCode: checked.phoneCountryCode,
        phoneNumber: checked.phoneNumber,
        phoneE164: checked.phoneE164,
        email: checked.email,
        purpose: 'new_device_restore_test'
      });
      if (!result.ok) throw new Error(result.message || 'Could not create test OTP.');
      setOtpTest({
        status: 'sent-test',
        challengeId: result.challengeId || '',
        code: result.testOtpCode || '',
        input: '',
        message: result.message || 'Test-mode OTP created. Use the displayed code to verify the flow.',
        verified: false,
        expiresAt: result.expiresAt || ''
      });
      showMessage('Test-mode OTP created. No SMS was sent. Use the displayed code to test the verification step.', 'success');
    } catch (error) {
      const note = `Could not create test-mode OTP. ${error.message || 'Use Netlify Dev locally or test after deploy.'}`;
      setOtpTest((current) => ({ ...current, status: 'error', message: note, verified: false }));
      showMessage(note, 'error');
    }
  }

  async function verifyTestOtp() {
    if (!otpTest.challengeId) {
      const note = 'Request a test-mode OTP first. Nothing is locked behind OTP in this build.';
      setOtpTest((current) => ({ ...current, status: 'needs-code', message: note, verified: false }));
      showMessage(note, 'warning');
      return;
    }
    const code = String(otpTest.input || '').replace(/\D/g, '');
    if (code.length !== 6) {
      const note = 'Enter the 6-digit test OTP code shown on screen.';
      setOtpTest((current) => ({ ...current, status: 'needs-code', message: note, verified: false }));
      showMessage(note, 'warning');
      return;
    }
    setOtpTest((current) => ({ ...current, status: 'verifying', message: 'Verifying test-mode OTP...' }));
    try {
      const result = await postJson('/.netlify/functions/verify-otp-test', {
        challengeId: otpTest.challengeId,
        code
      });
      if (!result.ok) throw new Error(result.message || 'OTP verification failed.');
      setOtpTest((current) => ({
        ...current,
        status: 'verified',
        verified: true,
        message: 'Test-mode OTP verified. In a future build, this can become the gate before new-device cloud restore.'
      }));
      setAccountStatus({ state: 'ready', message: 'Test-mode OTP verified. Local-first unlock still remains unchanged and there is no lockout risk in this build.' });
      showMessage('Test-mode OTP verified. No lockout rules have been enabled yet.', 'success');
    } catch (error) {
      const note = `Test-mode OTP did not verify. ${error.message || ''}`.trim();
      setOtpTest((current) => ({ ...current, status: 'error', verified: false, message: note }));
      showMessage(note, 'error');
    }
  }

  async function unlockVault(event) {
    event.preventDefault();
    if (masterPassword.length < 8) {
      showMessage('Use at least 8 characters for this foundation build. A stronger rule can be added later.');
      return;
    }
    try {
      const localVault = readStoredVault();
      let activeAccount = bootstrap;

      if (!localVault) {
        const accountCheck = await ensureAccountIdentity({ silent: true });
        if (!accountCheck.ok) return;
        activeAccount = accountCheck.account;
      }

      const canCheckCloud = Boolean(activeAccount.tenantId && activeAccount.userId);

      if (canCheckCloud) {
        try {
          const cloudRestore = await restoreLatestCloudVault(masterPassword, { showSuccess: false, reason: 'unlock', account: activeAccount });
          if (cloudRestore.restored) {
            setLocked(false);
            showMessage(`Vault restored from the latest encrypted cloud snapshot. ${cloudRestore.items.length} item(s) loaded on this device.`);
            return;
          }
        } catch (cloudError) {
          setDeviceStatus((current) => ({
            ...current,
            state: 'cloud-decrypt-failed',
            label: 'Latest cloud snapshot could not be decrypted with that master password. Your local vault was not overwritten and no new vault was created.',
            lastCloudCheckAt: new Date().toISOString()
          }));
          if (!localVault) {
            showMessage('Could not decrypt the latest cloud snapshot with that master password. Nothing was saved or overwritten on this device.');
            return;
          }
        }
      }

      if (localVault) {
        const existing = await decryptVault(masterPassword);
        if (!existing) throw new Error('Vault could not be decrypted.');
        setItems(existing);
        setDeviceStatus((current) => ({
          ...current,
          state: canCheckCloud ? 'local-fallback' : 'local-only',
          label: canCheckCloud ? 'This device unlocked from its local encrypted vault. Cloud was checked, but no newer decryptable snapshot replaced it.' : 'This device unlocked locally. Bootstrap admin here to enable cloud restore/sync.',
          source: 'local-vault'
        }));
        showMessage(canCheckCloud ? 'Vault unlocked locally. Cloud snapshot was checked safely, but your existing local vault was used.' : 'Vault unlocked locally. Bootstrap admin on this device to enable cloud-first restore.');
        setLocked(false);
        return;
      }

      if (!createMode) {
        setCreateMode(true);
        showMessage('No local vault or decryptable cloud snapshot was found for this account on this device. Re-enter the master password only if you intentionally want to create a fresh encrypted local vault.');
        return;
      }

      if (masterPassword !== confirmMasterPassword) {
        showMessage('The two master password entries do not match. Nothing has been saved.');
        return;
      }

      await encryptVault(starterItems, masterPassword);
      setHasLocalVault(true);
      setCreateMode(false);
      setConfirmMasterPassword('');
      setItems(starterItems);
      showMessage('Fresh encrypted local vault created on this device and linked to this account identity. No existing cloud snapshot was overwritten.');
      setLocked(false);
    } catch (error) {
      showMessage('Could not unlock. Check your master password. Nothing new was saved.');
    }
  }

  async function saveItems(nextItems, options = {}) {
    setItems(nextItems);
    const envelope = await encryptVault(nextItems, masterPassword);
    if (options.autoSync) {
      await syncEncryptedVault({ envelope, nextItems, silent: options.silentAutoSync === true });
    }
  }

  function lockVault(note = 'Vault locked.') {
    setLocked(true);
    setItems([]);
    setShowSecrets({});
    setMasterPassword('');
    setConfirmMasterPassword('');
    showMessage(note);
  }



  function resetLocalVaultOnDevice() {
    const confirmed = window.confirm('This clears only the encrypted local vault saved on this device. It does not delete Supabase snapshots or admin IDs. Continue?');
    if (!confirmed) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(SALT_KEY);
    localStorage.removeItem(LEGACY_SALT_KEY);
    setHasLocalVault(false);
    setCreateMode(true);
    setMasterPassword('');
    setConfirmMasterPassword('');
    showMessage('Local encrypted vault cleared on this device only. Account identity remains saved for cloud restore and future OTP. Supabase encrypted snapshots were not deleted.');
  }

  function emptyForm(categoryToKeep = form.category) {
    return { title: '', category: categoryToKeep || 'Passwords', url: '', username: '', password: '', notes: '', favourite: false };
  }

  async function saveItem(event) {
    event.preventDefault();
    if (!form.title.trim()) return showMessage(editingItemId ? 'Add a title before updating this item.' : 'Add a title first.');

    const itemPayload = {
      title: form.title.trim(),
      category: form.category,
      favourite: !!form.favourite,
      payload: { url: form.url.trim(), username: form.username.trim(), password: form.password, notes: form.notes.trim() },
      updatedAt: new Date().toISOString()
    };

    if (editingItemId) {
      const exists = items.some((item) => item.id === editingItemId);
      if (!exists) {
        setEditingItemId('');
        return showMessage('That item is no longer available to edit. Nothing was changed.');
      }
      const next = items.map((item) => item.id === editingItemId ? { ...item, ...itemPayload } : item);
      await saveItems(next, { autoSync: true });
      const editedCategory = form.category;
      setEditingItemId('');
      setForm(emptyForm(editedCategory));
      setShowFormSecret(false);
      showMessage(bootstrap.tenantId && bootstrap.userId ? 'Encrypted item updated locally and auto-sync requested.' : 'Encrypted item updated locally. Bootstrap admin to enable automatic cloud sync.');
      return;
    }

    const next = [
      {
        id: crypto.randomUUID(),
        ...itemPayload
      },
      ...items
    ];
    await saveItems(next, { autoSync: true });
    setForm(emptyForm(form.category));
    setShowFormSecret(false);
    showMessage(bootstrap.tenantId && bootstrap.userId ? 'Encrypted item saved locally and auto-sync requested.' : 'Encrypted item saved locally. Bootstrap admin to enable automatic cloud sync.');
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
      favourite: !!item.favourite
    });
    setShowFormSecret(false);
    setCategory(item.category || 'All');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showMessage(`Editing ${item.title || 'selected item'}. Save changes or cancel edit.`);
  }

  function cancelEdit() {
    const keepCategory = form.category;
    setEditingItemId('');
    setForm(emptyForm(keepCategory));
    setShowFormSecret(false);
    showMessage('Edit cancelled. No changes were saved.');
  }

  async function deleteItem(id) {
    await saveItems(items.filter((item) => item.id !== id), { autoSync: true });
    showMessage(bootstrap.tenantId && bootstrap.userId ? 'Item deleted and encrypted cloud sync requested.' : 'Item deleted locally. Bootstrap admin to enable automatic cloud sync.');
  }

  async function toggleFavourite(id) {
    const next = items.map((item) => item.id === id ? { ...item, favourite: !item.favourite, updatedAt: new Date().toISOString() } : item);
    await saveItems(next, { autoSync: true });
    showMessage(bootstrap.tenantId && bootstrap.userId ? 'Favourite status updated and encrypted cloud sync requested.' : 'Favourite status updated locally. Bootstrap admin to enable automatic cloud sync.');
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
    setDbStatus({ checked: true, connected: false, message: 'Checking Supabase...' });
    try {
      const result = await fetch('/.netlify/functions/db-health').then((res) => res.json());
      setDbStatus({ checked: true, connected: !!result.connected && !!result.schema_ready, message: result.connected && result.schema_ready ? 'Supabase connected and schema ready.' : result.message || 'Supabase not ready yet.' });
      showMessage(result.connected && result.schema_ready ? 'Supabase health check passed. Schema is ready.' : result.message || 'Supabase not ready yet.');
    } catch (error) {
      setDbStatus({ checked: true, connected: false, message: 'Could not reach db-health function. Use netlify dev locally or test after deploy.' });
      showMessage('Could not reach db-health function. Use Netlify Dev locally or test after deploy.');
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
    showMessage('Bootstrapping admin tenant...');
    try {
      const result = await postJson('/.netlify/functions/bootstrap-admin', { ...bootstrap, email, phoneCountryCode: checked.phoneCountryCode, phoneNumber: checked.phoneNumber, phoneE164: checked.phoneE164, accountLoginFoundation: true });
      if (result.ok) {
        const next = { ...bootstrap, email, phoneCountryCode: checked.phoneCountryCode, phoneNumber: checked.phoneNumber, phoneE164: result.phoneE164 || checked.phoneE164, tenantId: result.tenantId, userId: result.userId, accountVerified: true, otpStatus: 'OTP provider not connected yet — account foundation ready' };
        setBootstrap(next);
        showMessage(result.message || 'Admin tenant bootstrap completed in Supabase and IDs saved locally.');
        if (masterPassword) {
          window.setTimeout(async () => {
            try {
              const restore = await restoreLatestCloudVault(masterPassword, { showSuccess: false, reason: 'bootstrap' });
              if (restore.restored) showMessage(`Admin is ready and the latest encrypted cloud vault was pulled to this device. ${restore.items.length} item(s) loaded.`);
            } catch (error) {
              showMessage('Admin is ready. Cloud restore was checked, but this device kept its current local vault.');
            }
          }, 250);
        }
      } else {
        showMessage(`${result.message || 'Bootstrap did not complete.'}${result.error ? ` Error: ${result.error}` : ''}`);
      }
    } catch (error) {
      showMessage(`Could not reach bootstrap function. ${error.message || 'Use Netlify Dev locally or test after deploy.'}`);
    } finally {
      setSyncing(false);
    }
  }

  async function loadSnapshotHistory(shouldShowMessage = true) {
    if (!bootstrap.tenantId || !bootstrap.userId) {
      const note = 'Bootstrap the admin tenant first so snapshot history can be loaded.';
      setSnapshotHistory((current) => ({ ...current, loaded: true, loading: false, message: note }));
      if (shouldShowMessage) showMessage(note);
      return null;
    }
    setSnapshotHistory((current) => ({ ...current, loading: true, message: 'Loading encrypted snapshot history...' }));
    try {
      const result = await fetch(`/.netlify/functions/sync-vault?tenantId=${encodeURIComponent(bootstrap.tenantId)}&userId=${encodeURIComponent(bootstrap.userId)}&history=1`).then((res) => res.json());
      if (!result.ok) throw new Error(result.message || result.error || 'Could not load snapshot history.');
      const next = {
        loaded: true,
        loading: false,
        total: Number(result.snapshotCount || 0),
        snapshots: result.snapshots || [],
        message: result.snapshotCount ? `${result.snapshotCount} encrypted cloud snapshot(s) found.` : 'No encrypted cloud snapshots found yet.'
      };
      setSnapshotHistory(next);
      setSyncStatus((current) => ({ ...current, snapshotCount: next.total }));
      if (shouldShowMessage) showMessage(next.message);
      return next;
    } catch (error) {
      const note = `Could not load snapshot history. ${error.message || ''}`.trim();
      setSnapshotHistory((current) => ({ ...current, loaded: true, loading: false, message: note }));
      if (shouldShowMessage) showMessage(note);
      return null;
    }
  }

  async function syncEncryptedVault(options = {}) {
    const effectiveItems = options.nextItems || items;
    const envelope = options.envelope || getLocalEnvelope();
    const silent = Boolean(options.silent);
    if (!envelope) {
      const note = 'No local encrypted vault envelope found yet.';
      setSyncStatus({ state: 'error', message: note, lastSyncAt: '', lastSnapshotId: '', itemCount: effectiveItems.length, snapshotCount: snapshotHistory.total });
      if (!silent) showMessage(note);
      return { ok: false, message: note };
    }
    if (!bootstrap.tenantId || !bootstrap.userId) {
      const note = 'Bootstrap the admin tenant first so the app has a tenantId and userId.';
      setSyncStatus({ state: 'warning', message: note, lastSyncAt: syncStatus.lastSyncAt, lastSnapshotId: syncStatus.lastSnapshotId, itemCount: effectiveItems.length, snapshotCount: snapshotHistory.total });
      if (!silent) showMessage(note);
      return { ok: false, message: note };
    }
    setSyncing(true);
    setSyncStatus({ state: 'syncing', message: silent ? 'Auto-syncing encrypted vault to Supabase...' : 'Encrypting and sending vault snapshot to Supabase...', lastSyncAt: syncStatus.lastSyncAt, lastSnapshotId: syncStatus.lastSnapshotId, itemCount: effectiveItems.length, snapshotCount: snapshotHistory.total });
    try {
      const result = await postJson('/.netlify/functions/sync-vault', {
        tenantId: bootstrap.tenantId,
        userId: bootstrap.userId,
        encryptedBlob: envelope.encrypted,
        localSalt: envelope.salt,
        localIv: envelope.iv,
        itemCount: effectiveItems.length,
        clientUpdatedAt: envelope.updatedAt
      });
      if (!result.ok) {
        const note = `${result.message || 'Encrypted vault did not sync.'}${result.error ? ` Error: ${result.error}` : ''}`;
        setSyncStatus({ state: 'error', message: note, lastSyncAt: '', lastSnapshotId: '', itemCount: effectiveItems.length, snapshotCount: snapshotHistory.total });
        if (!silent) showMessage(note);
        return result;
      }
      const verified = await fetch(`/.netlify/functions/sync-vault?tenantId=${encodeURIComponent(bootstrap.tenantId)}&userId=${encodeURIComponent(bootstrap.userId)}`).then((res) => res.json());
      const verifiedSnapshot = verified?.snapshot || null;
      const history = await loadSnapshotHistory(false);
      const lastSyncAt = new Date().toISOString();
      const snapshotCount = history?.total || snapshotHistory.total || (verified?.hasSnapshot ? 1 : 0);
      const note = verified?.hasSnapshot
        ? `${silent ? 'Auto-sync complete.' : 'Encrypted vault synced and verified in Supabase.'} ${snapshotCount} cloud snapshot(s) now recorded. Latest snapshot contains ${verifiedSnapshot?.item_count ?? effectiveItems.length} item(s).`
        : 'Encrypted vault saved, but latest snapshot verification did not return a row yet.';
      setSyncStatus({
        state: verified?.hasSnapshot ? 'success' : 'warning',
        message: note,
        lastSyncAt,
        lastSnapshotId: verifiedSnapshot?.id || result.snapshotId || '',
        itemCount: Number(verifiedSnapshot?.item_count ?? effectiveItems.length),
        snapshotCount
      });
      if (!silent) showMessage(note);
      return { ...result, verified };
    } catch (error) {
      const note = `Could not complete encrypted sync. ${error.message || 'Use Netlify Dev locally or test after deploy.'}`;
      setSyncStatus({ state: 'error', message: note, lastSyncAt: '', lastSnapshotId: '', itemCount: effectiveItems.length, snapshotCount: snapshotHistory.total });
      if (!silent) showMessage(note);
      return { ok: false, message: note };
    } finally {
      setSyncing(false);
    }
  }

  async function restoreCloudToThisDevice() {
    if (!masterPassword) return showMessage('Unlock the vault first so the app can use your master password to decrypt the cloud snapshot.');
    const confirmed = window.confirm('Safe restore check: this will download the latest encrypted cloud snapshot for this account and try to decrypt it with your current master password. If decryption fails, your local vault is left untouched. Continue?');
    if (!confirmed) return;
    try {
      const result = await restoreLatestCloudVault(masterPassword, { showSuccess: true, reason: 'manual' });
      if (!result.restored) showMessage(result.latest?.message || 'No encrypted cloud snapshot found yet. Your local vault was not changed.');
    } catch (error) {
      showMessage('Could not decrypt the latest cloud snapshot with this master password. Local vault was not overwritten.');
    }
  }

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const text = `${item.title} ${item.category} ${item.payload.url} ${item.payload.username} ${item.payload.notes}`.toLowerCase();
      return text.includes(query.toLowerCase()) && (category === 'All' || item.category === category);
    }).sort((a, b) => Number(b.favourite) - Number(a.favourite) || new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [items, query, category]);

  if (locked) {
    return (
      <main className="lock-screen">
        <section className="lock-card">
          <div className="brand-mark"><Lock size={38} /></div>
          <p className="eyebrow">Local-first encrypted vault</p>
          <h1>My Passwords</h1>
          <p className="intro">Unlock locally with your master password. If this is a new or cleared device, your phone/email identifies the account before any encrypted cloud restore is attempted.</p>
          <form onSubmit={unlockVault} className="unlock-form">
            {!hasLocalVault && (
              <div className="account-restore-panel">
                <div className="account-panel-title"><Phone size={17} /><strong>Account restore foundation</strong></div>
                <p>No local vault was found on this device. Your phone/email identifies the account, then your master password decrypts the encrypted cloud snapshot. SMS/email OTP is in safe test mode only. No real SMS is sent yet, and OTP is not enforced, so there is no lockout risk.</p>
                <label>Mobile country code</label>
                <select value={bootstrap.phoneCountryCode || '+254'} onChange={(e) => setBootstrap({ ...bootstrap, phoneCountryCode: e.target.value, phoneE164: buildPhoneE164(e.target.value, bootstrap.phoneNumber) })}>
                  {phoneCountryCodes.map((country) => <option key={country.code} value={country.code}>{country.label}</option>)}
                </select>
                <label>Mobile number</label>
                <input inputMode="tel" value={bootstrap.phoneNumber || ''} onChange={(e) => setBootstrap({ ...bootstrap, phoneNumber: e.target.value, phoneE164: buildPhoneE164(bootstrap.phoneCountryCode, e.target.value) })} placeholder="712345678" />
                <label>Backup email</label>
                <input type="email" value={bootstrap.email || ''} onChange={(e) => setBootstrap({ ...bootstrap, email: e.target.value })} placeholder="you@example.com" />
                <small>SMS format preview: <strong>{buildPhoneE164(bootstrap.phoneCountryCode, bootstrap.phoneNumber) || 'Enter mobile number'}</strong></small>
                <div className="restore-safety-note"><ShieldCheck size={16} /><span>Safe restore rule: a cloud snapshot only replaces this device after it decrypts successfully with your master password.</span></div>
                <div className={`otp-test-panel ${otpTest.status}`}>
                  <div className="otp-test-title"><ShieldCheck size={16} /><strong>OTP foundation, test mode only</strong></div>
                  <p>{otpTest.message}</p>
                  {otpTest.code && <div className="test-code-box"><span>Test OTP</span><code>{otpTest.code}</code></div>}
                  <div className="otp-input-row">
                    <input inputMode="numeric" value={otpTest.input} onChange={(e) => setOtpTest({ ...otpTest, input: e.target.value })} placeholder="Enter 6-digit test OTP" />
                    <button type="button" className="secondary-button" onClick={verifyTestOtp} disabled={otpTest.status === 'verifying'}>Verify test OTP</button>
                  </div>
                  <button type="button" className="secondary-button" onClick={requestTestOtp} disabled={otpTest.status === 'requesting'}>{otpTest.status === 'requesting' ? 'Creating test OTP...' : 'Create test OTP'}</button>
                  <small>Ver-0.013A does not require OTP before unlock. It only proves the future new-device restore flow safely.</small>
                </div>
              </div>
            )}
            <label>{hasLocalVault ? 'Master vault password' : 'Master vault password'}</label>
            <input type="password" value={masterPassword} onChange={(e) => setMasterPassword(e.target.value)} placeholder={hasLocalVault ? 'Enter your master password' : 'Enter or create your master password'} autoFocus={hasLocalVault} />
            {!hasLocalVault && createMode && (
              <>
                <label>Confirm master vault password</label>
                <input type="password" value={confirmMasterPassword} onChange={(e) => setConfirmMasterPassword(e.target.value)} placeholder="Type the same password again" />
                <p className="create-warning">No local encrypted vault exists on this device. The app checks your account for an encrypted cloud snapshot first. A fresh local vault is created only if no decryptable snapshot is found and both master password entries match.</p>
              </>
            )}
            <button type="submit"><Unlock size={18} /> {hasLocalVault ? 'Unlock Local Vault' : 'Verify Account & Unlock'}</button>
          </form>
          {hasLocalVault && <button type="button" className="link-danger" onClick={resetLocalVaultOnDevice}>Clear local vault on this device</button>}
          {message && <p className="message">{message}</p>}
          <div className="security-note"><ShieldCheck size={18} /> Master password decrypts only your vault. Phone/email identifies the account. Local and cloud storage contain encrypted vault data only.</div>
          <p className="version">{VERSION}</p>
        </section>
        <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">SaaS-ready private vault</p>
          <h1>My Passwords</h1>
          <p className="subtitle">Passwords, bank details, secret keys, work notes, links and emergency access planning.</p>
        </div>
        <button className="lock-button" onClick={() => lockVault()}><Lock size={18} /> Lock</button>
      </header>

      <section className="status-grid">
        <article><KeyRound /><strong>{items.length}</strong><span>Encrypted items</span></article>
        <article><Database /><strong>{dbStatus.connected ? 'Connected' : 'Pending'}</strong><span>Supabase Database</span></article>
        <article><Cloud /><strong>{snapshotHistory.total || syncStatus.snapshotCount || 0}</strong><span>Cloud snapshots</span></article>
        <article><UserRoundCheck /><strong>{bootstrap.userId ? 'Ready' : 'Setup'}</strong><span>Account login</span></article>
      </section>

      <section className="sync-panel">
        <div className="sync-title">
          <div><p className="eyebrow">Ver-0.013A OTP foundation</p><h2><Cloud size={21} /> Local-first vault with test-mode OTP foundation</h2></div>
          <div className="sync-actions">
            <button type="button" className="secondary-button" onClick={checkDbHealth}><RefreshCw size={16} /> Check Supabase</button>
            <button type="button" className="secondary-button" disabled={snapshotHistory.loading} onClick={() => loadSnapshotHistory(true)}><Database size={16} /> Snapshot history</button>
            <button type="button" className="secondary-button" disabled={syncing} onClick={restoreCloudToThisDevice}><RefreshCw size={16} /> Safe restore from cloud</button>
          </div>
        </div>
        <p className={dbStatus.connected ? 'db-ok' : 'db-wait'}>{dbStatus.message}</p>
        <div className={`account-status-card ${accountStatus.state}`}>
          <div className="account-status-heading"><Phone size={18} /><strong>Account login foundation</strong></div>
          <span>{accountStatus.message}</span>
          <small>Phone for SMS OTP: {maskPhone(bootstrap.phoneE164 || buildPhoneE164(bootstrap.phoneCountryCode, bootstrap.phoneNumber)) || 'not set'}{bootstrap.email ? ` · Backup email: ${maskEmail(bootstrap.email)}` : ''}</small>
        </div>
        <div className={`sync-status-card ${syncStatus.state}`}> 
          <strong>{syncStatus.state === 'success' ? 'Encrypted cloud sync verified' : syncStatus.state === 'syncing' ? 'Sync in progress' : syncStatus.state === 'error' ? 'Sync needs attention' : syncStatus.state === 'warning' ? 'Sync warning' : 'Encrypted cloud sync status'}</strong>
          <span>{syncStatus.message}</span>
          {(syncStatus.lastSyncAt || syncStatus.snapshotCount) && <small>Last sync: {syncStatus.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleString() : 'Not synced in this session'} · Items: {syncStatus.itemCount} · Cloud snapshots: {syncStatus.snapshotCount || snapshotHistory.total || 0}{syncStatus.lastSnapshotId ? ` · Latest: ${shortId(syncStatus.lastSnapshotId)}` : ''}</small>}
        </div>
        <div className={`device-status-card ${deviceStatus.state}`}>
          <div className="device-status-heading"><MonitorSmartphone size={18} /><strong>This device</strong></div>
          <span>{deviceStatus.label}</span>
          <small>Source: {deviceStatus.source || 'not checked'}{deviceStatus.lastCloudCheckAt ? ` · Cloud check: ${new Date(deviceStatus.lastCloudCheckAt).toLocaleString()}` : ''}{deviceStatus.lastRestoreAt ? ` · Restored: ${new Date(deviceStatus.lastRestoreAt).toLocaleString()}` : ''}{deviceStatus.latestSnapshotId ? ` · Snapshot: ${shortId(deviceStatus.latestSnapshotId)}` : ''}{deviceStatus.latestCloudItemCount ? ` · Cloud items: ${deviceStatus.latestCloudItemCount}` : ''}</small>
        </div>
        <div className="vault-security-info-card">
          <div className="vault-security-info-heading"><ShieldCheck size={18} /><strong>Vault security and recovery</strong></div>
          <div className="security-points">
            <span>Local vault: encrypted copy saved on this device for fast daily unlock.</span>
            <span>Cloud vault: encrypted Supabase snapshot for restore and device sync.</span>
            <span>Account phone/email: finds the correct vault account. It does not decrypt secrets.</span>
            <span>Master password: decrypts the vault. It is not saved by the app.</span>
          </div>
        </div>
        <div className={`otp-foundation-card ${otpTest.status}`}>
          <div className="vault-security-info-heading"><ShieldCheck size={18} /><strong>OTP foundation, test mode only</strong></div>
          <span>{otpTest.message}</span>
          {otpTest.code && <div className="test-code-box"><span>Test OTP</span><code>{otpTest.code}</code></div>}
          <div className="otp-input-row">
            <input inputMode="numeric" value={otpTest.input} onChange={(e) => setOtpTest({ ...otpTest, input: e.target.value })} placeholder="Enter 6-digit test OTP" />
            <button type="button" className="secondary-button" onClick={verifyTestOtp} disabled={otpTest.status === 'verifying'}>Verify test OTP</button>
            <button type="button" className="secondary-button" onClick={requestTestOtp} disabled={otpTest.status === 'requesting'}>{otpTest.status === 'requesting' ? 'Creating...' : 'Create test OTP'}</button>
          </div>
          <small>No SMS or email is sent yet. OTP is not enforced in Ver-0.013A, so your live vault remains accessible through the existing local-first unlock.</small>
        </div>
        <div className="snapshot-history-card">
          <div className="snapshot-history-title"><strong>Cloud snapshot history</strong><span>{snapshotHistory.loading ? 'Loading...' : snapshotHistory.message}</span></div>
          {!!snapshotHistory.snapshots.length && (
            <div className="snapshot-list">
              {snapshotHistory.snapshots.map((snap) => (
                <div className="snapshot-row" key={snap.id}>
                  <code>{shortId(snap.id)}</code>
                  <span>{snap.item_count} item(s)</span>
                  <small>{new Date(snap.created_at).toLocaleString()}</small>
                </div>
              ))}
            </div>
          )}
        </div>
        {message && <p className="message sync-message">{message}</p>}
        <form className="bootstrap-grid" onSubmit={bootstrapAdmin}>
          <label>Mobile country code<select value={bootstrap.phoneCountryCode || '+254'} onChange={(e) => setBootstrap({ ...bootstrap, phoneCountryCode: e.target.value, phoneE164: buildPhoneE164(e.target.value, bootstrap.phoneNumber) })}>{phoneCountryCodes.map((country) => <option key={country.code} value={country.code}>{country.label}</option>)}</select></label>
          <label>Mobile number<input inputMode="tel" value={bootstrap.phoneNumber || ''} onChange={(e) => setBootstrap({ ...bootstrap, phoneNumber: e.target.value, phoneE164: buildPhoneE164(bootstrap.phoneCountryCode, e.target.value) })} placeholder="712345678" /></label>
          <label>Backup email<input type="email" value={bootstrap.email} onChange={(e) => setBootstrap({ ...bootstrap, email: e.target.value })} placeholder="you@example.com" /></label>
          <label>Display name<input value={bootstrap.displayName} onChange={(e) => setBootstrap({ ...bootstrap, displayName: e.target.value })} /></label>
          <label>Tenant / vault name<input value={bootstrap.tenantName} onChange={(e) => setBootstrap({ ...bootstrap, tenantName: e.target.value })} /></label>
          <div className="button-stack">
            <button type="submit" className="primary-button" disabled={syncing}><UserRoundCheck size={18} /> Save account foundation</button>
            <button type="button" className="secondary-button" disabled={syncing} onClick={syncEncryptedVault}><Cloud size={18} /> {syncing ? 'Syncing...' : 'Push encrypted vault'}</button>
          </div>
        </form>
        {(bootstrap.tenantId || bootstrap.userId) && <p className="ids-line">Tenant ID: <code>{bootstrap.tenantId}</code> · User ID: <code>{bootstrap.userId}</code> · SMS phone: <code>{bootstrap.phoneE164 || buildPhoneE164(bootstrap.phoneCountryCode, bootstrap.phoneNumber)}</code></p>}
      </section>

      <section className="controls-panel">
        <div className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles, notes, users or links" /></div>
        <div className="chip-row">{categories.map((cat) => <button key={cat} className={cat === category ? 'chip active' : 'chip'} onClick={() => setCategory(cat)}>{cat}</button>)}</div>
      </section>

      <section className="main-grid">
        <form className={editingItemId ? "item-form edit-mode" : "item-form"} onSubmit={saveItem}>
          <h2>{editingItemId ? <Pencil size={20} /> : <Plus size={20} />} {editingItemId ? 'Edit encrypted item' : 'Add encrypted item'}</h2>
          <p className="form-helper">{editingItemId ? 'Update the saved details, then save. The existing encrypted local save and auto-sync path is reused.' : 'Category-aware fields for passwords, bank details, secret keys, notes and checklists. Everything is encrypted locally before cloud sync.'}</p>
          {editingItemId && <div className="edit-banner"><Pencil size={16} /><span>Editing existing item. Save updates or cancel without changing the vault.</span></div>}
          <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.filter((cat) => cat !== 'All').map((cat) => <option key={cat}>{cat}</option>)}</select></label>
          <label>Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={activeHint.title} /></label>
          <label>URL / Link<input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder={activeHint.url} /></label>
          <label>Username / Reference<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder={activeHint.username} /></label>
          <label>Password / Secret
            <div className="secret-input-row">
              <input type={showFormSecret ? 'text' : 'password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={activeHint.secret} />
              <button type="button" className="mini-button" onClick={() => setShowFormSecret(!showFormSecret)}>{showFormSecret ? <EyeOff size={15} /> : <Eye size={15} />}</button>
            </div>
          </label>
          <label>Notes / Checklist<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={activeHint.notes} rows="6" /></label>
          <label className="favourite-toggle"><input type="checkbox" checked={form.favourite} onChange={(e) => setForm({ ...form, favourite: e.target.checked })} /> Mark as favourite</label>
          <div className="form-buttons">
            <button type="submit" className="primary-button"><ShieldCheck size={18} /> {editingItemId ? 'Save updated item' : 'Save encrypted item'}</button>
            <button type="button" className="secondary-button" onClick={clearForm}>{editingItemId ? <><X size={16} /> Cancel edit</> : 'Clear'}</button>
          </div>
        </form>

        <section className="vault-list">
          {filteredItems.map((item) => {
            const visible = !!showSecrets[item.id];
            return (
              <article className={item.favourite ? 'vault-card favourite-card' : 'vault-card'} key={item.id}>
                <div className="card-title-row">
                  <div><span className="category-pill">{item.category}</span><h3>{item.favourite && <Star size={17} fill="currentColor" />} {item.title}</h3></div>
                  <div className="card-actions">
                    <button className="icon-button" onClick={() => startEditItem(item)} title="Edit item"><Pencil size={17} /></button>
                    <button className="icon-button" onClick={() => toggleFavourite(item.id)} title="Toggle favourite"><Star size={17} fill={item.favourite ? 'currentColor' : 'none'} /></button>
                    <button className="icon-button danger" onClick={() => deleteItem(item.id)} title="Delete"><Trash2 size={17} /></button>
                  </div>
                </div>
                {item.payload.url && (
                  <div className="app-field-block">
                    <span className="app-field-label">Website / Link</span>
                    <div className="app-value-field link-field">
                      <a href={item.payload.url} target="_blank" rel="noreferrer">{item.payload.url}</a>
                      <button type="button" className="field-action" onClick={() => copyText('URL', item.payload.url)} aria-label="Copy URL" title="Copy URL"><Copy size={18} /></button>
                    </div>
                  </div>
                )}
                <div className="app-field-block">
                  <span className="app-field-label">Username</span>
                  <div className="app-value-field">
                    <span className="app-field-value">{item.payload.username || '—'}</span>
                    <button type="button" className="field-action" onClick={() => copyText('Username', item.payload.username)} aria-label="Copy username" title="Copy username"><Copy size={18} /></button>
                  </div>
                </div>
                <div className="app-field-block">
                  <span className="app-field-label">Password</span>
                  <div className="app-value-field secret-field">
                    <span className="app-field-value">{visible ? item.payload.password || '—' : '••••••••••••••••'}</span>
                    <button type="button" className="field-action" onClick={() => setShowSecrets({ ...showSecrets, [item.id]: !visible })} aria-label={visible ? 'Hide password' : 'Show password'} title={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                    <button type="button" className="field-action" onClick={() => copyText('Secret', item.payload.password)} aria-label="Copy password" title="Copy password"><Copy size={18} /></button>
                  </div>
                </div>
                {item.payload.notes && (
                  <div className="app-field-block">
                    <span className="app-field-label">Notes</span>
                    <div className="app-value-field notes-field">
                      <span className="app-field-value multiline">{item.payload.notes}</span>
                      <button type="button" className="field-action" onClick={() => copyText('Notes', item.payload.notes)} aria-label="Copy notes" title="Copy notes"><Copy size={18} /></button>
                    </div>
                  </div>
                )}
                <p className="updated">Updated {new Date(item.updatedAt).toLocaleString()}</p>
              </article>
            );
          })}
          {!filteredItems.length && <div className="empty-state">No vault items match that search.</div>}
        </section>
      </section>

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      <footer>{VERSION} · local-first encrypted vault · safe cloud restore wording · account recovery foundation · Supabase encrypted sync</footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
