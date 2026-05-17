import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Cloud, Copy, Database, Eye, EyeOff, KeyRound, Lock, Plus, RefreshCw, Search, ShieldCheck, Star, Trash2, Unlock, UserRoundCheck } from 'lucide-react';
import './styles.css';

const VERSION = 'My Passwords Ver-0.006';
const STORAGE_KEY = 'my-passwords-v0.002-local-vault';
const LEGACY_STORAGE_KEY = 'my-passwords-v0.001-local-vault';
const SALT_KEY = 'my-passwords-v0.002-salt';
const LEGACY_SALT_KEY = 'my-passwords-v0.001-salt';
const BOOTSTRAP_KEY = 'my-passwords-v0.002-bootstrap-profile';

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
      notes: 'Future emergency access will use waiting periods, roles and audit logs. Ver-0.005 improves item forms, shows cloud snapshot count/history and tidies the admin/sync layout.'
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

async function decryptVault(masterPassword) {
  const stored = readStoredVault();
  if (!stored) return null;
  const parsed = JSON.parse(stored.raw);
  const salt = parsed.salt || localStorage.getItem(SALT_KEY) || localStorage.getItem(LEGACY_SALT_KEY);
  if (!salt) return null;
  const key = await deriveKey(masterPassword, salt);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToArrayBuffer(parsed.iv) }, key, base64ToArrayBuffer(parsed.encrypted));
  const items = JSON.parse(new TextDecoder().decode(decrypted));
  if (stored.source === 'legacy') await encryptVault(items, masterPassword);
  return items;
}

function getLocalEnvelope() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
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
  const [dbStatus, setDbStatus] = useState({ checked: false, connected: false, message: 'Not checked yet.' });
  const [bootstrap, setBootstrap] = useState(() => {
    try { return JSON.parse(localStorage.getItem(BOOTSTRAP_KEY)) || { email: '', displayName: 'Brian', tenantName: 'Brian Private Vault', tenantId: '', userId: '' }; }
    catch { return { email: '', displayName: 'Brian', tenantName: 'Brian Private Vault', tenantId: '', userId: '' }; }
  });
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ state: 'idle', message: 'No encrypted cloud sync has run yet.', lastSyncAt: '', lastSnapshotId: '', itemCount: 0, snapshotCount: 0 });
  const [snapshotHistory, setSnapshotHistory] = useState({ loaded: false, loading: false, total: 0, snapshots: [], message: 'Snapshot history has not been loaded yet.' });

  const activeHint = categoryHints[form.category] || categoryHints.Passwords;

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
    localStorage.setItem(BOOTSTRAP_KEY, JSON.stringify(bootstrap));
  }, [bootstrap]);

  async function unlockVault(event) {
    event.preventDefault();
    if (masterPassword.length < 8) {
      setMessage('Use at least 8 characters for this foundation build. A stronger rule can be added later.');
      return;
    }
    try {
      const localVault = readStoredVault();
      if (localVault) {
        const existing = await decryptVault(masterPassword);
        if (!existing) throw new Error('Vault could not be decrypted.');
        setItems(existing);
        setMessage('Vault unlocked. Ver-0.006 keeps bootstrap repeat-safe and prevents accidental wrong-password vault creation.');
        setLocked(false);
        return;
      }

      if (!createMode) {
        setCreateMode(true);
        setMessage('No local vault exists on this device. Confirm your master password to create a new encrypted local vault.');
        return;
      }

      if (masterPassword !== confirmMasterPassword) {
        setMessage('The two master password entries do not match. Nothing has been saved.');
        return;
      }

      await encryptVault(starterItems, masterPassword);
      setHasLocalVault(true);
      setCreateMode(false);
      setConfirmMasterPassword('');
      setItems(starterItems);
      setMessage('New encrypted local vault created on this device. Delete the demo records when ready.');
      setLocked(false);
    } catch (error) {
      setMessage('Could not unlock. Check your master password. Nothing new was saved.');
    }
  }

  async function saveItems(nextItems) {
    setItems(nextItems);
    await encryptVault(nextItems, masterPassword);
  }

  function lockVault(note = 'Vault locked.') {
    setLocked(true);
    setItems([]);
    setShowSecrets({});
    setMasterPassword('');
    setConfirmMasterPassword('');
    setMessage(note);
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
    setMessage('Local encrypted vault cleared on this device. You can now create a fresh local vault with confirmed password entry.');
  }

  async function addItem(event) {
    event.preventDefault();
    if (!form.title.trim()) return setMessage('Add a title first.');
    const next = [
      {
        id: crypto.randomUUID(),
        title: form.title.trim(),
        category: form.category,
        favourite: !!form.favourite,
        payload: { url: form.url.trim(), username: form.username.trim(), password: form.password, notes: form.notes.trim() },
        updatedAt: new Date().toISOString()
      },
      ...items
    ];
    await saveItems(next);
    setForm({ title: '', category: form.category, url: '', username: '', password: '', notes: '', favourite: false });
    setShowFormSecret(false);
    setMessage('Encrypted item saved locally. Use Sync encrypted vault to update the Supabase snapshot.');
  }

  async function deleteItem(id) {
    await saveItems(items.filter((item) => item.id !== id));
    setMessage('Item deleted from encrypted local vault. Sync again to update the cloud snapshot.');
  }

  async function toggleFavourite(id) {
    const next = items.map((item) => item.id === id ? { ...item, favourite: !item.favourite, updatedAt: new Date().toISOString() } : item);
    await saveItems(next);
    setMessage('Favourite status updated locally. Sync again to update the cloud snapshot.');
  }

  async function copyText(label, value) {
    if (!value) return setMessage(`Nothing to copy for ${label}.`);
    await navigator.clipboard.writeText(value);
    setMessage(`${label} copied.`);
  }

  function clearForm() {
    setForm({ title: '', category: form.category, url: '', username: '', password: '', notes: '', favourite: false });
    setShowFormSecret(false);
    setMessage('Form cleared.');
  }

  async function checkDbHealth() {
    setDbStatus({ checked: true, connected: false, message: 'Checking Supabase...' });
    try {
      const result = await fetch('/.netlify/functions/db-health').then((res) => res.json());
      setDbStatus({ checked: true, connected: !!result.connected && !!result.schema_ready, message: result.connected && result.schema_ready ? 'Supabase connected and schema ready.' : result.message || 'Supabase not ready yet.' });
      setMessage(result.connected && result.schema_ready ? 'Supabase health check passed. Schema is ready.' : result.message || 'Supabase not ready yet.');
    } catch (error) {
      setDbStatus({ checked: true, connected: false, message: 'Could not reach db-health function. Use netlify dev locally or test after deploy.' });
      setMessage('Could not reach db-health function. Use Netlify Dev locally or test after deploy.');
    }
  }

  async function bootstrapAdmin(event) {
    event.preventDefault();
    const email = String(bootstrap.email || '').trim();
    if (!email || !email.includes('@')) {
      setMessage('Please enter a valid admin email before bootstrapping.');
      return;
    }
    setSyncing(true);
    setMessage('Bootstrapping admin tenant...');
    try {
      const result = await postJson('/.netlify/functions/bootstrap-admin', { ...bootstrap, email });
      if (result.ok) {
        const next = { ...bootstrap, email, tenantId: result.tenantId, userId: result.userId };
        setBootstrap(next);
        setMessage(result.message || 'Admin tenant bootstrap completed in Supabase and IDs saved locally.');
      } else {
        setMessage(`${result.message || 'Bootstrap did not complete.'}${result.error ? ` Error: ${result.error}` : ''}`);
      }
    } catch (error) {
      setMessage(`Could not reach bootstrap function. ${error.message || 'Use Netlify Dev locally or test after deploy.'}`);
    } finally {
      setSyncing(false);
    }
  }

  async function loadSnapshotHistory(showMessage = true) {
    if (!bootstrap.tenantId || !bootstrap.userId) {
      const note = 'Bootstrap the admin tenant first so snapshot history can be loaded.';
      setSnapshotHistory((current) => ({ ...current, loaded: true, loading: false, message: note }));
      if (showMessage) setMessage(note);
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
      if (showMessage) setMessage(next.message);
      return next;
    } catch (error) {
      const note = `Could not load snapshot history. ${error.message || ''}`.trim();
      setSnapshotHistory((current) => ({ ...current, loaded: true, loading: false, message: note }));
      if (showMessage) setMessage(note);
      return null;
    }
  }

  async function syncEncryptedVault() {
    const envelope = getLocalEnvelope();
    if (!envelope) {
      const note = 'No local encrypted vault envelope found yet.';
      setSyncStatus({ state: 'error', message: note, lastSyncAt: '', lastSnapshotId: '', itemCount: items.length, snapshotCount: snapshotHistory.total });
      return setMessage(note);
    }
    if (!bootstrap.tenantId || !bootstrap.userId) {
      const note = 'Bootstrap the admin tenant first so the app has a tenantId and userId.';
      setSyncStatus({ state: 'error', message: note, lastSyncAt: '', lastSnapshotId: '', itemCount: items.length, snapshotCount: snapshotHistory.total });
      return setMessage(note);
    }
    setSyncing(true);
    setSyncStatus({ state: 'syncing', message: 'Encrypting and sending vault snapshot to Supabase...', lastSyncAt: syncStatus.lastSyncAt, lastSnapshotId: syncStatus.lastSnapshotId, itemCount: items.length, snapshotCount: snapshotHistory.total });
    try {
      const result = await postJson('/.netlify/functions/sync-vault', {
        tenantId: bootstrap.tenantId,
        userId: bootstrap.userId,
        encryptedBlob: envelope.encrypted,
        localSalt: envelope.salt,
        localIv: envelope.iv,
        itemCount: items.length,
        clientUpdatedAt: envelope.updatedAt
      });
      if (!result.ok) {
        const note = `${result.message || 'Encrypted vault did not sync.'}${result.error ? ` Error: ${result.error}` : ''}`;
        setSyncStatus({ state: 'error', message: note, lastSyncAt: '', lastSnapshotId: '', itemCount: items.length, snapshotCount: snapshotHistory.total });
        setMessage(note);
        return;
      }
      const verified = await fetch(`/.netlify/functions/sync-vault?tenantId=${encodeURIComponent(bootstrap.tenantId)}&userId=${encodeURIComponent(bootstrap.userId)}`).then((res) => res.json());
      const verifiedSnapshot = verified?.snapshot || null;
      const history = await loadSnapshotHistory(false);
      const lastSyncAt = new Date().toISOString();
      const snapshotCount = history?.total || snapshotHistory.total || (verified?.hasSnapshot ? 1 : 0);
      const note = verified?.hasSnapshot
        ? `Encrypted vault synced and verified in Supabase. ${snapshotCount} cloud snapshot(s) now recorded. Latest snapshot contains ${verifiedSnapshot?.item_count ?? items.length} item(s).`
        : 'Encrypted vault saved, but latest snapshot verification did not return a row yet.';
      setSyncStatus({
        state: verified?.hasSnapshot ? 'success' : 'warning',
        message: note,
        lastSyncAt,
        lastSnapshotId: verifiedSnapshot?.id || result.snapshotId || '',
        itemCount: Number(verifiedSnapshot?.item_count ?? items.length),
        snapshotCount
      });
      setMessage(note);
    } catch (error) {
      const note = `Could not complete encrypted sync test. ${error.message || 'Use Netlify Dev locally or test after deploy.'}`;
      setSyncStatus({ state: 'error', message: note, lastSyncAt: '', lastSnapshotId: '', itemCount: items.length, snapshotCount: snapshotHistory.total });
      setMessage(note);
    } finally {
      setSyncing(false);
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
          <p className="eyebrow">Private encrypted PWA foundation</p>
          <h1>My Passwords</h1>
          <p className="intro">Unlock your local encrypted vault. Ver-0.006 prevents accidental wrong-password vault creation and makes admin bootstrap safe to run more than once.</p>
          <form onSubmit={unlockVault} className="unlock-form">
            <label>{hasLocalVault ? 'Master vault password' : 'Create master vault password'}</label>
            <input type="password" value={masterPassword} onChange={(e) => setMasterPassword(e.target.value)} placeholder={hasLocalVault ? 'Enter your master password' : 'Create a strong master password'} autoFocus />
            {!hasLocalVault && createMode && (
              <>
                <label>Confirm master vault password</label>
                <input type="password" value={confirmMasterPassword} onChange={(e) => setConfirmMasterPassword(e.target.value)} placeholder="Type the same password again" />
                <p className="create-warning">No local vault exists on this device. A new encrypted local vault is only created after both password entries match.</p>
              </>
            )}
            <button type="submit"><Unlock size={18} /> {hasLocalVault ? 'Unlock Vault' : 'Create New Local Vault'}</button>
          </form>
          {hasLocalVault && <button type="button" className="link-danger" onClick={resetLocalVaultOnDevice}>Clear local vault on this device</button>}
          {message && <p className="message">{message}</p>}
          <div className="security-note"><ShieldCheck size={18} /> Master password stays in the browser. Database sync stores encrypted snapshots only.</div>
          <p className="version">{VERSION}</p>
        </section>
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
        <article><UserRoundCheck /><strong>{bootstrap.userId ? 'Ready' : 'Setup'}</strong><span>Admin tenant</span></article>
      </section>

      <section className="sync-panel">
        <div className="sync-title">
          <div><p className="eyebrow">Ver-0.006 Supabase foundation</p><h2><Cloud size={21} /> Encrypted sync and admin status</h2></div>
          <div className="sync-actions">
            <button type="button" className="secondary-button" onClick={checkDbHealth}><RefreshCw size={16} /> Check Supabase</button>
            <button type="button" className="secondary-button" disabled={snapshotHistory.loading} onClick={() => loadSnapshotHistory(true)}><Database size={16} /> Snapshot history</button>
          </div>
        </div>
        <p className={dbStatus.connected ? 'db-ok' : 'db-wait'}>{dbStatus.message}</p>
        <div className={`sync-status-card ${syncStatus.state}`}>
          <strong>{syncStatus.state === 'success' ? 'Encrypted cloud sync verified' : syncStatus.state === 'syncing' ? 'Sync in progress' : syncStatus.state === 'error' ? 'Sync needs attention' : syncStatus.state === 'warning' ? 'Sync warning' : 'Encrypted cloud sync status'}</strong>
          <span>{syncStatus.message}</span>
          {(syncStatus.lastSyncAt || syncStatus.snapshotCount) && <small>Last sync: {syncStatus.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleString() : 'Not synced in this session'} · Items: {syncStatus.itemCount} · Cloud snapshots: {syncStatus.snapshotCount || snapshotHistory.total || 0}{syncStatus.lastSnapshotId ? ` · Latest: ${shortId(syncStatus.lastSnapshotId)}` : ''}</small>}
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
          <label>Admin email<input value={bootstrap.email} onChange={(e) => setBootstrap({ ...bootstrap, email: e.target.value })} placeholder="you@example.com" /></label>
          <label>Display name<input value={bootstrap.displayName} onChange={(e) => setBootstrap({ ...bootstrap, displayName: e.target.value })} /></label>
          <label>Tenant / vault name<input value={bootstrap.tenantName} onChange={(e) => setBootstrap({ ...bootstrap, tenantName: e.target.value })} /></label>
          <div className="button-stack">
            <button type="submit" className="primary-button" disabled={syncing}><UserRoundCheck size={18} /> Bootstrap admin</button>
            <button type="button" className="secondary-button" disabled={syncing} onClick={syncEncryptedVault}><Cloud size={18} /> {syncing ? 'Syncing...' : 'Sync encrypted vault'}</button>
          </div>
        </form>
        {(bootstrap.tenantId || bootstrap.userId) && <p className="ids-line">Tenant ID: <code>{bootstrap.tenantId}</code> · User ID: <code>{bootstrap.userId}</code></p>}
      </section>

      <section className="controls-panel">
        <div className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles, notes, users or links" /></div>
        <div className="chip-row">{categories.map((cat) => <button key={cat} className={cat === category ? 'chip active' : 'chip'} onClick={() => setCategory(cat)}>{cat}</button>)}</div>
      </section>

      <section className="main-grid">
        <form className="item-form" onSubmit={addItem}>
          <h2><Plus size={20} /> Add encrypted item</h2>
          <p className="form-helper">Category-aware fields for passwords, bank details, secret keys, notes and checklists. Everything is encrypted locally before cloud sync.</p>
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
            <button type="submit" className="primary-button"><ShieldCheck size={18} /> Save encrypted item</button>
            <button type="button" className="secondary-button" onClick={clearForm}>Clear</button>
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
                    <button className="icon-button" onClick={() => toggleFavourite(item.id)} title="Toggle favourite"><Star size={17} fill={item.favourite ? 'currentColor' : 'none'} /></button>
                    <button className="icon-button danger" onClick={() => deleteItem(item.id)} title="Delete"><Trash2 size={17} /></button>
                  </div>
                </div>
                {item.payload.url && <p className="url-line"><a href={item.payload.url} target="_blank" rel="noreferrer">{item.payload.url}</a> <button onClick={() => copyText('URL', item.payload.url)}><Copy size={14} /> Copy URL</button></p>}
                <div className="field-row"><span>User</span><code>{item.payload.username || '—'}</code><button onClick={() => copyText('Username', item.payload.username)}><Copy size={15} /> Copy</button></div>
                <div className="field-row"><span>Secret</span><code>{visible ? item.payload.password || '—' : '••••••••••••'}</code><button onClick={() => setShowSecrets({ ...showSecrets, [item.id]: !visible })}>{visible ? <EyeOff size={15} /> : <Eye size={15} />} {visible ? 'Hide' : 'Show'}</button><button onClick={() => copyText('Secret', item.payload.password)}><Copy size={15} /> Copy</button></div>
                {item.payload.notes && <div className="notes-block"><p className="notes">{item.payload.notes}</p><button onClick={() => copyText('Notes', item.payload.notes)}><Copy size={14} /> Copy notes</button></div>}
                <p className="updated">Updated {new Date(item.updatedAt).toLocaleString()}</p>
              </article>
            );
          })}
          {!filteredItems.length && <div className="empty-state">No vault items match that search.</div>}
        </section>
      </section>

      <footer>{VERSION} · SaaS-ready encrypted vault foundation · Supabase cloud layer · repeat-safe bootstrap · safer local vault creation</footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
