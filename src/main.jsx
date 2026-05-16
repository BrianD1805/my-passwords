import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Copy, Eye, EyeOff, KeyRound, Lock, Plus, Search, ShieldCheck, Trash2, Unlock, UserRoundCheck } from 'lucide-react';
import './styles.css';

const VERSION = 'My Passwords Ver-0.001';
const STORAGE_KEY = 'my-passwords-v0.001-local-vault';
const SALT_KEY = 'my-passwords-v0.001-salt';

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
      notes: 'Future SaaS-ready emergency access will use waiting periods, roles and audit logs.'
    },
    updatedAt: new Date().toISOString()
  }
];

const categories = ['All', 'Passwords', 'Bank Details', 'Secret Keys', 'Work Stuff', 'Links', 'Notes', 'Checklists', 'Emergency Info'];

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

async function encryptVault(items, masterPassword) {
  let salt = localStorage.getItem(SALT_KEY);
  if (!salt) {
    salt = arrayBufferToBase64(crypto.getRandomValues(new Uint8Array(16)));
    localStorage.setItem(SALT_KEY, salt);
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(masterPassword, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(items));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: VERSION, iv: arrayBufferToBase64(iv), salt, encrypted: arrayBufferToBase64(encrypted), updatedAt: new Date().toISOString() }));
}

async function decryptVault(masterPassword) {
  const stored = localStorage.getItem(STORAGE_KEY);
  const salt = localStorage.getItem(SALT_KEY);
  if (!stored || !salt) return null;
  const parsed = JSON.parse(stored);
  const key = await deriveKey(masterPassword, parsed.salt || salt);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToArrayBuffer(parsed.iv) }, key, base64ToArrayBuffer(parsed.encrypted));
  return JSON.parse(new TextDecoder().decode(decrypted));
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

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  useEffect(() => {
    if (!locked && masterPassword) {
      const timeout = setTimeout(() => lockVault('Vault auto-locked after inactivity.'), 10 * 60 * 1000);
      return () => clearTimeout(timeout);
    }
  }, [locked, masterPassword, items]);

  async function unlockVault(event) {
    event.preventDefault();
    if (masterPassword.length < 8) {
      setMessage('Use at least 8 characters for this foundation build. A stronger rule can be added in the next patch.');
      return;
    }
    try {
      const existing = await decryptVault(masterPassword);
      if (existing) {
        setItems(existing);
        setMessage('Vault unlocked.');
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
    setMessage('Encrypted item saved locally. Database sync comes in the next phase.');
  }

  async function deleteItem(id) {
    await saveItems(items.filter((item) => item.id !== id));
    setMessage('Item deleted from encrypted local vault.');
  }

  async function copyText(label, value) {
    if (!value) return setMessage(`Nothing to copy for ${label}.`);
    await navigator.clipboard.writeText(value);
    setMessage(`${label} copied.`);
  }

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const text = `${item.title} ${item.category} ${item.payload.url} ${item.payload.username} ${item.payload.notes}`.toLowerCase();
      const matchesQuery = text.includes(query.toLowerCase());
      const matchesCategory = category === 'All' || item.category === category;
      return matchesQuery && matchesCategory;
    });
  }, [items, query, category]);

  if (locked) {
    return (
      <main className="lock-screen">
        <section className="lock-card">
          <div className="brand-mark"><Lock size={38} /></div>
          <p className="eyebrow">Private encrypted PWA foundation</p>
          <h1>My Passwords</h1>
          <p className="intro">Unlock your local encrypted vault. Ver-0.001 stores demo/live records encrypted in your browser while the Netlify Database layer is prepared.</p>
          <form onSubmit={unlockVault} className="unlock-form">
            <label>Master vault password</label>
            <input type="password" value={masterPassword} onChange={(e) => setMasterPassword(e.target.value)} placeholder="Enter your master password" autoFocus />
            <button type="submit"><Unlock size={18} /> Unlock / Create Vault</button>
          </form>
          {message && <p className="message">{message}</p>}
          <div className="security-note"><ShieldCheck size={18} /> Sensitive values are encrypted locally with AES-GCM before storage in this foundation build.</div>
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
        <article><ShieldCheck /><strong>Client-side</strong><span>Vault encryption</span></article>
        <article><UserRoundCheck /><strong>Planned</strong><span>Emergency user</span></article>
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
                <div className="field-row"><span>Username</span><code>{item.payload.username || '—'}</code><button onClick={() => copyText('Username', item.payload.username)}><Copy size={15} /> Copy</button></div>
                <div className="field-row"><span>Secret</span><code>{visible ? (item.payload.password || '—') : '••••••••••••'}</code><button onClick={() => setShowSecrets({ ...showSecrets, [item.id]: !visible })}>{visible ? <EyeOff size={15} /> : <Eye size={15} />} {visible ? 'Hide' : 'Show'}</button><button onClick={() => copyText('Secret', item.payload.password)}><Copy size={15} /> Copy</button></div>
                {item.payload.notes && <p className="notes">{item.payload.notes}</p>}
                <p className="updated">Updated {new Date(item.updatedAt).toLocaleString()}</p>
              </article>
            );
          })}
          {!filteredItems.length && <div className="empty-state">No matching encrypted items yet.</div>}
        </section>
      </section>

      <footer>{VERSION} · Netlify/GitHub/Database-ready starter patch · Local encrypted foundation</footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
