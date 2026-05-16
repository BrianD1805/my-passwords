import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Cloud, Copy, Database, Eye, EyeOff, KeyRound, Lock, Plus, RefreshCw, Search, ShieldCheck, Trash2, Unlock, UserRoundCheck } from 'lucide-react';
import './styles.css';

const VERSION = 'My Passwords Ver-0.002';
const STORAGE_KEY = 'my-passwords-v0.002-local-vault';
const LEGACY_STORAGE_KEY = 'my-passwords-v0.001-local-vault';
const SALT_KEY = 'my-passwords-v0.002-salt';
const LEGACY_SALT_KEY = 'my-passwords-v0.001-salt';
const BOOTSTRAP_KEY = 'my-passwords-v0.002-bootstrap-profile';

const categories = ['All', 'Passwords', 'Bank Details', 'Secret Keys', 'Work Stuff', 'Links', 'Notes', 'Checklists', 'Emergency Info'];

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
      notes: 'Future emergency access will use waiting periods, roles and audit logs. Ver-0.002 prepares the tenant/user database foundation.'
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
  return response.json();
}

function App() {
  const [locked, setLocked] = useState(true);
  const [masterPassword, setMasterPassword] = useState('');
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [showSecrets, setShowSecrets] = useState({});
  const [form, setForm] = useState({ title: '', category: 'Passwords', url: '', username: '', password: '', notes: '' });
  const [dbStatus, setDbStatus] = useState({ checked: false, connected: false, message: 'Not checked yet.' });
  const [bootstrap, setBootstrap] = useState(() => {
    try { return JSON.parse(localStorage.getItem(BOOTSTRAP_KEY)) || { email: '', displayName: 'Brian', tenantName: 'Brian Private Vault', tenantId: '', userId: '' }; }
    catch { return { email: '', displayName: 'Brian', tenantName: 'Brian Private Vault', tenantId: '', userId: '' }; }
  });
  const [syncing, setSyncing] = useState(false);

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
      const existing = await decryptVault(masterPassword);
      if (existing) {
        setItems(existing);
        setMessage('Vault unlocked. Ver-0.002 can now push encrypted snapshots to the database once configured.');
      } else {
        await encryptVault(starterItems, masterPassword);
        setItems(starterItems);
        setMessage('New encrypted local vault created. Delete the demo records when ready.');
      }
      setLocked(false);
    } catch (error) {
      setMessage('Could not unlock. Check your master password.');
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
    setMessage(note);
  }

  async function addItem(event) {
    event.preventDefault();
    if (!form.title.trim()) return setMessage('Add a title first.');
    const next = [
      {
        id: crypto.randomUUID(),
        title: form.title.trim(),
        category: form.category,
        favourite: false,
        payload: { url: form.url.trim(), username: form.username.trim(), password: form.password, notes: form.notes.trim() },
        updatedAt: new Date().toISOString()
      },
      ...items
    ];
    await saveItems(next);
    setForm({ title: '', category: 'Passwords', url: '', username: '', password: '', notes: '' });
    setMessage('Encrypted item saved locally. Use Sync encrypted vault when your database is connected.');
  }

  async function deleteItem(id) {
    await saveItems(items.filter((item) => item.id !== id));
    setMessage('Item deleted from encrypted local vault. Sync again to update the cloud snapshot.');
  }

  async function copyText(label, value) {
    if (!value) return setMessage(`Nothing to copy for ${label}.`);
    await navigator.clipboard.writeText(value);
    setMessage(`${label} copied.`);
  }

  async function checkDbHealth() {
    setDbStatus({ checked: true, connected: false, message: 'Checking database...' });
    try {
      const result = await fetch('/.netlify/functions/db-health').then((res) => res.json());
      setDbStatus({ checked: true, connected: !!result.connected, message: result.connected ? 'Database connected.' : result.message || 'Database not connected yet.' });
      setMessage(result.connected ? 'Database health check passed.' : result.message || 'Database not connected yet.');
    } catch (error) {
      setDbStatus({ checked: true, connected: false, message: 'Could not reach db-health function. Use netlify dev locally or test after deploy.' });
      setMessage('Could not reach db-health function. Use Netlify Dev locally or test after deploy.');
    }
  }

  async function bootstrapAdmin(event) {
    event.preventDefault();
    setSyncing(true);
    try {
      const result = await postJson('/.netlify/functions/bootstrap-admin', bootstrap);
      if (result.ok) {
        const next = { ...bootstrap, tenantId: result.tenantId, userId: result.userId };
        setBootstrap(next);
        setMessage('Admin tenant bootstrap completed and IDs saved locally.');
      } else {
        setMessage(result.message || 'Bootstrap did not complete.');
      }
    } catch (error) {
      setMessage('Could not reach bootstrap function. Use Netlify Dev locally or test after deploy.');
    } finally {
      setSyncing(false);
    }
  }

  async function syncEncryptedVault() {
    const envelope = getLocalEnvelope();
    if (!envelope) return setMessage('No local encrypted vault envelope found yet.');
    if (!bootstrap.tenantId || !bootstrap.userId) return setMessage('Bootstrap the admin tenant first so the app has a tenantId and userId.');
    setSyncing(true);
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
      setMessage(result.message || (result.ok ? 'Encrypted vault synced.' : 'Encrypted vault did not sync.'));
    } catch (error) {
      setMessage('Could not reach sync function. Use Netlify Dev locally or test after deploy.');
    } finally {
      setSyncing(false);
    }
  }

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const text = `${item.title} ${item.category} ${item.payload.url} ${item.payload.username} ${item.payload.notes}`.toLowerCase();
      return text.includes(query.toLowerCase()) && (category === 'All' || item.category === category);
    });
  }, [items, query, category]);

  if (locked) {
    return (
      <main className="lock-screen">
        <section className="lock-card">
          <div className="brand-mark"><Lock size={38} /></div>
          <p className="eyebrow">Private encrypted PWA foundation</p>
          <h1>My Passwords</h1>
          <p className="intro">Unlock your local encrypted vault. Ver-0.002 adds database connection checks, admin tenant bootstrap and encrypted snapshot sync.</p>
          <form onSubmit={unlockVault} className="unlock-form">
            <label>Master vault password</label>
            <input type="password" value={masterPassword} onChange={(e) => setMasterPassword(e.target.value)} placeholder="Enter your master password" autoFocus />
            <button type="submit"><Unlock size={18} /> Unlock / Create Vault</button>
          </form>
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
        <article><Database /><strong>{dbStatus.connected ? 'Connected' : 'Pending'}</strong><span>Netlify Database</span></article>
        <article><UserRoundCheck /><strong>{bootstrap.userId ? 'Ready' : 'Setup'}</strong><span>Admin tenant</span></article>
      </section>

      <section className="sync-panel">
        <div className="sync-title">
          <div><p className="eyebrow">Ver-0.002 database foundation</p><h2><Cloud size={21} /> Encrypted sync setup</h2></div>
          <button type="button" className="secondary-button" onClick={checkDbHealth}><RefreshCw size={16} /> Check DB</button>
        </div>
        <p className={dbStatus.connected ? 'db-ok' : 'db-wait'}>{dbStatus.message}</p>
        <form className="bootstrap-grid" onSubmit={bootstrapAdmin}>
          <label>Admin email<input value={bootstrap.email} onChange={(e) => setBootstrap({ ...bootstrap, email: e.target.value })} placeholder="you@example.com" /></label>
          <label>Display name<input value={bootstrap.displayName} onChange={(e) => setBootstrap({ ...bootstrap, displayName: e.target.value })} /></label>
          <label>Tenant / vault name<input value={bootstrap.tenantName} onChange={(e) => setBootstrap({ ...bootstrap, tenantName: e.target.value })} /></label>
          <div className="button-stack">
            <button type="submit" className="primary-button" disabled={syncing}><UserRoundCheck size={18} /> Bootstrap admin</button>
            <button type="button" className="secondary-button" disabled={syncing} onClick={syncEncryptedVault}><Cloud size={18} /> Sync encrypted vault</button>
          </div>
        </form>
        {(bootstrap.tenantId || bootstrap.userId) && <p className="ids-line">Tenant ID: <code>{bootstrap.tenantId}</code> · User ID: <code>{bootstrap.userId}</code></p>}
      </section>

      <section className="controls-panel">
        <div className="search-box"><Search size={18} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles, notes, users or links" /></div>
        <div className="chip-row">{categories.map((cat) => <button key={cat} className={cat === category ? 'chip active' : 'chip'} onClick={() => setCategory(cat)}>{cat}</button>)}</div>
      </section>

      {message && <p className="message in-app">{message}</p>}

      <section className="main-grid">
        <form className="item-form" onSubmit={addItem}>
          <h2><Plus size={20} /> Add encrypted item</h2>
          <label>Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Barclays login" /></label>
          <label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.filter((cat) => cat !== 'All').map((cat) => <option key={cat}>{cat}</option>)}</select></label>
          <label>URL / Link<input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://" /></label>
          <label>Username / Reference<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
          <label>Password / Secret<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <label>Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows="5" /></label>
          <button type="submit" className="primary-button"><ShieldCheck size={18} /> Save encrypted item</button>
        </form>

        <section className="vault-list">
          {filteredItems.map((item) => {
            const visible = !!showSecrets[item.id];
            return (
              <article className="vault-card" key={item.id}>
                <div className="card-title-row">
                  <div><span className="category-pill">{item.category}</span><h3>{item.title}</h3></div>
                  <button className="icon-button danger" onClick={() => deleteItem(item.id)} title="Delete"><Trash2 size={17} /></button>
                </div>
                {item.payload.url && <p className="url-line"><a href={item.payload.url} target="_blank" rel="noreferrer">{item.payload.url}</a></p>}
                <div className="field-row"><span>User</span><code>{item.payload.username || '—'}</code><button onClick={() => copyText('Username', item.payload.username)}><Copy size={15} /> Copy</button></div>
                <div className="field-row"><span>Secret</span><code>{visible ? item.payload.password || '—' : '••••••••••••'}</code><button onClick={() => setShowSecrets({ ...showSecrets, [item.id]: !visible })}>{visible ? <EyeOff size={15} /> : <Eye size={15} />} {visible ? 'Hide' : 'Show'}</button><button onClick={() => copyText('Secret', item.payload.password)}><Copy size={15} /> Copy</button></div>
                {item.payload.notes && <p className="notes">{item.payload.notes}</p>}
                <p className="updated">Updated {new Date(item.updatedAt).toLocaleString()}</p>
              </article>
            );
          })}
          {!filteredItems.length && <div className="empty-state">No vault items match that search.</div>}
        </section>
      </section>

      <footer>{VERSION} · SaaS-ready encrypted vault foundation</footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
