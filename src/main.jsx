import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Cloud, Copy, Database, Download, ExternalLink, Eye, EyeOff, FileText, KeyRound, Lock, Mail, MonitorSmartphone, Pencil, Phone, Plus, RefreshCw, Search, Settings, ShieldCheck, Sparkles, Star, Trash2, Unlock, Upload, UserRoundCheck, UsersRound, X } from 'lucide-react';
import './styles.css';

const VERSION = 'My Passwords Ver-0.025A';
const STORAGE_KEY = 'my-passwords-v0.002-local-vault';
const LEGACY_STORAGE_KEY = 'my-passwords-v0.001-local-vault';
const SALT_KEY = 'my-passwords-v0.002-salt';
const LEGACY_SALT_KEY = 'my-passwords-v0.001-salt';
const BOOTSTRAP_KEY = 'my-passwords-v0.002-bootstrap-profile';
const ACCOUNT_KEY = 'my-passwords-v0.011-account-identity';

const BUILT_IN_CATEGORIES = ['Passwords', 'Bank Details', 'Secret Keys', 'Work Stuff', 'Links', 'Notes', 'Checklists', 'Documents', 'Emergency Info'];
const categories = ['All', ...BUILT_IN_CATEGORIES];
const FOLDER_META_CATEGORY = '__my_passwords_folder_meta';
const FOLDER_META_ID = '__my_passwords_custom_folders';
const DOCUMENTS_CATEGORY = 'Documents';
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
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
  Documents: {
    title: 'e.g. Passport scan, insurance PDF, policy document',
    url: '',
    username: '',
    secret: '',
    notes: 'Optional notes about this stored document...'
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
      notes: 'Emergency access planning note. Keep this updated with trusted contact guidance when the feature is enabled.'
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
      {open && (
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
              <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search country or code" />
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
        </div>
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

function getVisibleVaultItems(vaultItems) {
  return Array.isArray(vaultItems) ? vaultItems.filter((item) => !isFolderMetaItem(item)) : [];
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

function upsertFolderMetaItem(vaultItems, folders, folderOrder) {
  const currentMeta = getFolderMeta(vaultItems);
  const cleanFolders = uniqueFolderList(folders);
  const cleanOrder = uniqueFolderList(folderOrder || currentMeta?.payload?.folderOrder || []);
  const metaItem = {
    id: FOLDER_META_ID,
    title: 'Vault folders',
    category: FOLDER_META_CATEGORY,
    favourite: false,
    payload: { folders: cleanFolders, folderOrder: cleanOrder },
    updatedAt: new Date().toISOString()
  };
  const withoutMeta = getVisibleVaultItems(vaultItems);
  return (cleanFolders.length || cleanOrder.length) ? [metaItem, ...withoutMeta] : withoutMeta;
}

function folderExists(folder, folders) {
  const target = normaliseFolderName(folder).toLowerCase();
  return folders.some((entry) => entry.toLowerCase() === target);
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

function triggerDocumentDownload(item, dataUrl) {
  const file = item?.payload?.file;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = file?.name || `${item?.title || 'document'}.${file?.extension || 'txt'}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
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
                Enter master password
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

function App() {
  const [locked, setLocked] = useState(true);
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmMasterPassword, setConfirmMasterPassword] = useState('');
  const [hasLocalVault, setHasLocalVault] = useState(() => Boolean(readStoredVault()));
  const [createMode, setCreateMode] = useState(() => !Boolean(readStoredVault()));
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [showSecrets, setShowSecrets] = useState({});
  const [showFormSecret, setShowFormSecret] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'Passwords', url: '', username: '', password: '', notes: '', favourite: false, file: null });
  const [editingItemId, setEditingItemId] = useState('');
  const [dbStatus, setDbStatus] = useState({ checked: false, connected: false, message: 'Not checked yet.' });
  const [bootstrap, setBootstrap] = useState(() => readSavedAccount());
  const [accountStatus, setAccountStatus] = useState({ state: 'local-first', message: 'Your account details help you recover your vault on a new device.' });
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ state: 'idle', message: 'No cloud backup has run yet. Your vault is backed up when you save, delete, favourite or edit an item.', lastSyncAt: '', lastSnapshotId: '', itemCount: 0, snapshotCount: 0 });
  const [snapshotHistory, setSnapshotHistory] = useState({ loaded: false, loading: false, total: 0, snapshots: [], message: 'Backup history has not been loaded yet.' });
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
  const [otpTest, setOtpTest] = useState({ status: 'not-requested', challengeId: '', code: '', input: '', message: 'Choose how you would like to receive your one-time code.', verified: false, expiresAt: '' });
  const [otpChannel, setOtpChannel] = useState('email');
  const [verifyOverlay, setVerifyOverlay] = useState({ visible: false, status: 'idle', title: '', message: '', focusMasterPassword: false });
  const [suppressUnlockAutofocus, setSuppressUnlockAutofocus] = useState(false);
  const [activePage, setActivePage] = useState('home');
  const [isItemPopupOpen, setIsItemPopupOpen] = useState(false);
  const [viewItemId, setViewItemId] = useState('');
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState('');
  const [isFolderPopupOpen, setIsFolderPopupOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isSavingFolder, setIsSavingFolder] = useState(false);
  const [draggedFolderName, setDraggedFolderName] = useState('');
  const [touchReorderFolder, setTouchReorderFolder] = useState('');
  const [touchDropTargetFolder, setTouchDropTargetFolder] = useState('');
  const [showOnboardingDetails, setShowOnboardingDetails] = useState(() => !Boolean(readStoredVault()));
  const [isCreateAccountPopupOpen, setIsCreateAccountPopupOpen] = useState(false);
  const [isCreateVaultPopupOpen, setIsCreateVaultPopupOpen] = useState(false);
  const [landingOnboardingStep, setLandingOnboardingStep] = useState(1);
  const [landingAccountDraft, setLandingAccountDraft] = useState(() => {
    const saved = readSavedAccount();
    return {
      displayName: saved.displayName || '',
      email: saved.email || '',
      phoneCountryCode: saved.phoneCountryCode || '+254',
      phoneCountryIso: saved.phoneCountryIso || 'ke',
      phoneNumber: saved.phoneNumber || '',
      phoneE164: saved.phoneE164 || '',
      accountName: saved.accountName || saved.tenantName || 'My Private Vault',
      planCode: saved.planCode || 'personal_free'
    };
  });
  const touchReorderRef = useRef({ timer: null, source: '', active: false });

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

  function showVerifyOverlay(status, title, message, options = {}) {
    setVerifyOverlay({ visible: true, status, title, message, focusMasterPassword: !!options.focusMasterPassword });
  }

  function hideVerifyOverlay() {
    setVerifyOverlay((current) => ({ ...current, visible: false }));
  }

  function focusMasterPassword() {
    window.setTimeout(() => {
      const field = document.getElementById('master-password-input');
      if (field) {
        field.scrollIntoView({ behavior: 'smooth', block: 'center' });
        field.focus();
      }
    }, 80);
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
    const account = { ...bootstrap, phoneCountryCode: normaliseCountryCode(bootstrap.phoneCountryCode || '+254') || '+254', phoneCountryIso: getCountryByCode(bootstrap.phoneCountryCode || '+254', bootstrap.phoneCountryIso).iso, phoneNumber: String(bootstrap.phoneNumber || '').trim(), phoneE164 };
    localStorage.setItem(BOOTSTRAP_KEY, JSON.stringify(account));
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  }, [bootstrap]);

  useEffect(() => {
    document.body.classList.toggle('app-popup-open', isItemPopupOpen || Boolean(viewItemId) || isFolderPopupOpen || isCreateAccountPopupOpen || isCreateVaultPopupOpen);
    return () => document.body.classList.remove('app-popup-open');
  }, [isItemPopupOpen, viewItemId, isFolderPopupOpen, isCreateAccountPopupOpen, isCreateVaultPopupOpen]);

  useEffect(() => {
    if (!locked) setIsCreateVaultPopupOpen(false);
  }, [locked]);

  async function fetchLatestCloudSnapshot(account = bootstrap) {
    if (!account.tenantId || !account.userId) return { ok: false, hasSnapshot: false, message: 'Account identity is not verified on this device yet.' };
    return fetch(`/.netlify/functions/sync-vault?tenantId=${encodeURIComponent(account.tenantId)}&userId=${encodeURIComponent(account.userId)}`).then((res) => res.json());
  }

  async function restoreLatestCloudVault(passwordToUse, { showSuccess = true, reason = 'manual', account = bootstrap } = {}) {
    const checkedAt = new Date().toISOString();
    setDeviceStatus((current) => ({
      ...current,
      state: 'checking-cloud',
      label: reason === 'unlock' ? 'Checking your cloud backup...' : 'Checking your cloud backup...',
      lastCloudCheckAt: checkedAt
    }));
    const latest = await fetchLatestCloudSnapshot(account);
    if (!latest?.ok || !latest?.hasSnapshot || !latest.snapshot) {
      setDeviceStatus((current) => ({
        ...current,
        state: 'no-cloud-snapshot',
        label: latest?.message || 'No cloud backup was found for this account. Nothing was changed.',
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
      message: `Your cloud backup has been restored on this device. ${restoredItems.length} item(s) loaded.`,
      lastSyncAt: latest.snapshot.created_at || latest.snapshot.client_updated_at || new Date().toISOString(),
      lastSnapshotId: latest.snapshot.id || current.lastSnapshotId,
      itemCount: Number(latest.snapshot.item_count ?? getVisibleVaultItems(restoredItems).length),
      snapshotCount
    }));
    setDeviceStatus({
      state: 'cloud-restored',
      label: `This device is now using your latest cloud backup. ${restoredItems.length} item(s) loaded.`,
      lastCloudCheckAt: new Date().toISOString(),
      lastRestoreAt: new Date().toISOString(),
      latestSnapshotId: latest.snapshot.id || '',
      latestCloudItemCount: Number(latest.snapshot.item_count ?? getVisibleVaultItems(restoredItems).length),
      source: reason === 'unlock' ? 'auto-pulled-on-unlock' : 'manual-pull'
    });
    if (showSuccess) showMessage(`Your cloud backup has been restored on this device. ${restoredItems.length} item(s) loaded.`);
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
        tenantId: result.tenantId,
        userId: result.userId,
        phoneE164: result.phoneE164 || payload.phoneE164,
        accountVerified: true,
        otpStatus: 'Recovery verification ready',
        accountName: result.accountName || payload.accountName || payload.tenantName,
        planCode: result.planCode || payload.planCode || 'personal_free',
        planStatus: result.planStatus || payload.planStatus || 'trial_pending',
        accountStatus: result.accountStatus || payload.accountStatus || 'active',
        tenantRole: result.tenantRole || payload.tenantRole || 'primary_owner'
      };
      setBootstrap(next);
      setAccountStatus({ state: 'ready', message: `Account details saved. Your master password is still required to open the vault.` });
      if (!silent) showMessage(`Account details saved. Your master password is still required to open the vault.`);
      return { ok: true, account: next, result };
    } catch (error) {
      const note = `Could not save account details. ${error.message || 'Please try again.'}`;
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
    setOtpTest((current) => ({ ...current, status: 'requesting', message: 'Preparing SMS verification...', verified: false }));
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
      if (!result.ok) throw new Error(result.message || 'Could not create SMS code.');
      setOtpTest({
        status: 'sent-test',
        challengeId: result.challengeId || '',
        code: result.testOtpCode || '',
        input: '',
        message: result.message || 'SMS verification is not available yet. Please use email OTP.',
        verified: false,
        expiresAt: result.expiresAt || ''
      });
      showMessage('SMS verification is not available yet. Please use email OTP.', 'success');
    } catch (error) {
      const note = `Could not start SMS verification. Please use email OTP for now.`;
      setOtpTest((current) => ({ ...current, status: 'error', message: note, verified: false }));
      showMessage(note, 'error');
    }
  }


  async function requestSelectedOtp() {
    if (otpChannel === 'sms') {
      await requestTestOtp();
      return;
    }
    await requestEmailOtp();
  }

  async function requestEmailOtp() {
    const checked = validateAccountIdentity(bootstrap);
    if (!checked.ok) {
      setOtpTest((current) => ({ ...current, status: 'needs-details', message: checked.message, verified: false }));
      showMessage(checked.message, 'warning');
      return;
    }
    if (!checked.email) {
      const note = 'Add your backup email before requesting a code.';
      setOtpTest((current) => ({ ...current, status: 'needs-details', message: note, verified: false }));
      showMessage(note, 'warning');
      return;
    }
    setOtpTest((current) => ({ ...current, status: 'requesting', code: '', message: 'Sending your email code...', verified: false }));
    showVerifyOverlay('working', 'Sending your code', 'We are sending a one-time code to your email address.');
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
      showVerifyOverlay('success', 'Code sent', result.emailSent ? 'Check your email and enter the six-digit code.' : 'Your code is ready. Enter the code shown on screen.');
      showMessage(result.emailSent ? 'Email code sent. Please check your inbox.' : 'Email code created. Enter the code shown to continue.', result.emailSent ? 'success' : 'warning');
    } catch (error) {
      const note = `Could not send email code. ${error.message || 'Please try again.'}`;
      setOtpTest((current) => ({ ...current, status: 'error', message: note, verified: false }));
      showVerifyOverlay('error', 'Something went wrong', 'We could not send the code. Please check your details and try again.');
      showMessage(note, 'error');
    }
  }

  async function verifyTestOtp() {
    if (!otpTest.challengeId) {
      const note = 'Request a one-time code first.';
      setOtpTest((current) => ({ ...current, status: 'needs-code', message: note, verified: false }));
      showMessage(note, 'warning');
      return;
    }
    const code = String(otpTest.input || '').replace(/\D/g, '');
    if (code.length !== 6) {
      const note = 'Enter the six-digit code.';
      setOtpTest((current) => ({ ...current, status: 'needs-code', message: note, verified: false }));
      showMessage(note, 'warning');
      return;
    }
    setOtpTest((current) => ({ ...current, status: 'verifying', message: 'Checking your code...' }));
    showVerifyOverlay('working', 'Verifying your account', 'Please wait while we check your one-time code.');
    try {
      const result = await postJson('/.netlify/functions/verify-otp-test', {
        challengeId: otpTest.challengeId,
        code
      });
      if (!result.ok) throw new Error(result.message || 'Code verification failed.');
      setOtpTest((current) => ({
        ...current,
        status: 'verified',
        verified: true,
        message: 'Account verified. Enter your master password to complete login.'
      }));
      setAccountStatus({ state: 'ready', message: 'Account verified. Enter your master password to complete login or restore.' });
      showVerifyOverlay('success', 'Account verified', 'Now enter your master password to complete login or restore your vault.', { focusMasterPassword: true });
      showMessage('Account verified. Enter your master password to complete login.', 'success');
    } catch (error) {
      const note = `Code did not verify. ${error.message || ''}`.trim();
      setOtpTest((current) => ({ ...current, status: 'error', verified: false, message: note }));
      showVerifyOverlay('error', 'Something went wrong', 'The code did not verify. Please check the code and try again.');
      showMessage(note, 'error');
    }
  }

  async function unlockVault(event) {
    event.preventDefault();
    setSuppressUnlockAutofocus(false);
    if (masterPassword.length < 8) {
      showMessage('Use at least 8 characters for your master password.');
      return;
    }
    showVerifyOverlay('working', 'Opening your vault', 'Please wait while we verify your account and unlock this device.');
    try {
      const localVault = readStoredVault();
      let activeAccount = bootstrap;

      if (!localVault) {
        const accountCheck = await ensureAccountIdentity({ silent: true });
        if (!accountCheck.ok) return;
        if (!otpTest.verified) {
          showVerifyOverlay('error', 'Verify your account first', 'Please verify your email before creating or restoring a vault on this device.');
          showMessage('Please verify your account before creating or restoring a vault on this device.', 'warning');
          return;
        }
        activeAccount = accountCheck.account;
      }

      const canCheckCloud = Boolean(activeAccount.tenantId && activeAccount.userId);

      if (canCheckCloud) {
        try {
          const cloudRestore = await restoreLatestCloudVault(masterPassword, { showSuccess: false, reason: 'unlock', account: activeAccount });
          if (cloudRestore.restored) {
            setLocked(false);
            showVerifyOverlay('success', 'Vault restored', 'Your vault has been restored on this device.');
            showMessage(`Vault restored from your latest cloud backup. ${cloudRestore.items.length} item(s) loaded on this device.`);
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
        }
      }

      if (localVault) {
        const existing = await decryptVault(masterPassword);
        if (!existing) throw new Error('Vault could not be decrypted.');
        setItems(existing);
        setDeviceStatus((current) => ({
          ...current,
          state: canCheckCloud ? 'local-fallback' : 'local-only',
          label: canCheckCloud ? 'This device unlocked from its local vault. Your cloud backup was checked safely.' : 'This device unlocked locally. Save your account details to enable cloud restore.',
          source: 'local-vault'
        }));
        showMessage(canCheckCloud ? 'Vault unlocked locally. Your cloud backup was checked safely.' : 'Vault unlocked locally. Save your account details to enable cloud restore.');
        setLocked(false);
        return;
      }

      if (!createMode) {
        setCreateMode(true);
        showMessage('We could not restore a vault for this account. Only continue if you want to create a new vault on this device.');
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
      showMessage('New secure vault created on this device. No existing cloud backup was overwritten.');
      setLocked(false);
    } catch (error) {
      showVerifyOverlay('error', 'Something went wrong', 'We could not unlock your vault. Please check your master password and try again.');
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
    setSuppressUnlockAutofocus(true);
    setLocked(true);
    setItems([]);
    setShowSecrets({});
    setMasterPassword('');
    setConfirmMasterPassword('');
    showMessage(note, 'success');
    window.setTimeout(() => {
      showVerifyOverlay('success', 'Vault locked', 'Your passwords are securely encrypted and locked.');
    }, 80);
  }



  function resetLocalVaultOnDevice() {
    const confirmed = window.confirm('This clears only the vault copy saved on this device. It does not delete your cloud backup. Continue?');
    if (!confirmed) return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(SALT_KEY);
    localStorage.removeItem(LEGACY_SALT_KEY);
    setHasLocalVault(false);
    setCreateMode(true);
    setMasterPassword('');
    setConfirmMasterPassword('');
    showMessage('The local vault copy was cleared from this device only. Your cloud backup was not deleted.');
  }

  function emptyForm(categoryToKeep = form.category) {
    return { title: '', category: categoryToKeep || 'Passwords', url: '', username: '', password: '', notes: '', favourite: false, file: null };
  }

  async function uploadEncryptedDocumentBlob(fileInfo, documentId) {
    if (!fileInfo?.dataUrl) return fileInfo;
    if (!bootstrap.tenantId || !bootstrap.userId) {
      throw new Error('Save your account details before storing documents.');
    }
    const encryptedFile = await encryptDocumentData(fileInfo.dataUrl, masterPassword);
    const result = await postJson('/.netlify/functions/document-blob', {
      tenantId: bootstrap.tenantId,
      userId: bootstrap.userId,
      documentId,
      fileName: fileInfo.name,
      fileType: fileInfo.type || 'application/octet-stream',
      fileExtension: fileInfo.extension || getFileExtension(fileInfo.name),
      fileSize: fileInfo.size || 0,
      encryptedBlob: encryptedFile.encryptedBlob,
      localSalt: encryptedFile.localSalt,
      localIv: encryptedFile.localIv,
      clientUpdatedAt: new Date().toISOString()
    });
    if (!result.ok) {
      throw new Error(result.message || 'Document file could not be stored separately.');
    }
    return {
      name: fileInfo.name,
      type: fileInfo.type || 'application/octet-stream',
      size: fileInfo.size || 0,
      extension: fileInfo.extension || getFileExtension(fileInfo.name),
      storageMode: 'external_encrypted_blob',
      externalDocumentId: documentId,
      storedExternally: true,
      storedAt: new Date().toISOString()
    };
  }

  async function downloadStoredDocument(item) {
    const file = item?.payload?.file;
    if (!file) return showMessage('No document file is attached to this item.', 'warning');
    if (file.dataUrl) {
      triggerDocumentDownload(item, file.dataUrl);
      return;
    }
    const documentId = file.externalDocumentId || item.id;
    if (!file.storedExternally || !documentId) {
      showMessage('This document file is not available for download.', 'warning');
      return;
    }
    if (!bootstrap.tenantId || !bootstrap.userId) {
      showMessage('Save your account details before downloading stored documents.', 'warning');
      return;
    }
    setDownloadingDocId(item.id);
    try {
      const response = await fetch(`/.netlify/functions/document-blob?tenantId=${encodeURIComponent(bootstrap.tenantId)}&userId=${encodeURIComponent(bootstrap.userId)}&documentId=${encodeURIComponent(documentId)}`);
      const result = await response.json();
      if (!response.ok || !result.ok || !result.document) {
        throw new Error(result.message || 'Document could not be loaded.');
      }
      const dataUrl = await decryptDocumentData(result.document, masterPassword);
      triggerDocumentDownload(item, dataUrl);
      showMessage('Document downloaded securely.', 'success');
    } catch (error) {
      showMessage(error.message || 'Document could not be downloaded. Please try again.', 'error');
    } finally {
      setDownloadingDocId('');
    }
  }

  async function saveItem(event) {
    event.preventDefault();
    if (isSavingItem) return;
    if (!form.title.trim()) return showMessage(editingItemId ? 'Add a title before updating this item.' : 'Add a title first.');

    setIsSavingItem(true);
    try {
      const isDocument = form.category === DOCUMENTS_CATEGORY;
      if (isDocument && !editingItemId && !form.file?.dataUrl) {
        showMessage('Choose a document to store first.', 'warning');
        return;
      }
      if (isDocument && !form.file) {
        showMessage('Choose a document to store first.', 'warning');
        return;
      }
      const itemIdForSave = editingItemId || crypto.randomUUID();
      const storedDocumentFile = isDocument ? await uploadEncryptedDocumentBlob(form.file, itemIdForSave) : null;
      const notesValue = form.category === 'Checklists' ? normaliseChecklistNotes(form.notes) : form.notes.trim();
      const itemPayload = {
        title: form.title.trim(),
        category: form.category,
        favourite: !!form.favourite,
        payload: {
          url: form.category === 'Checklists' ? '' : form.url.trim(),
          username: ['Notes', 'Checklists', DOCUMENTS_CATEGORY].includes(form.category) ? '' : form.username.trim(),
          password: ['Notes', 'Checklists', DOCUMENTS_CATEGORY].includes(form.category) ? '' : form.password,
          notes: notesValue,
          file: storedDocumentFile
        },
        updatedAt: new Date().toISOString()
      };

      if (editingItemId) {
        const itemIdBeingEdited = editingItemId;
        const exists = items.some((item) => item.id === itemIdBeingEdited);
        if (!exists) {
          setEditingItemId('');
          showMessage('That item is no longer available to edit. Nothing was changed.');
          return;
        }
        const next = items.map((item) => item.id === itemIdBeingEdited ? { ...item, ...itemPayload } : item);
        await saveItems(next, { autoSync: true, silentAutoSync: true });
        const editedCategory = form.category;
        setEditingItemId('');
        setForm(emptyForm(editedCategory));
        setShowFormSecret(false);
        setIsItemPopupOpen(false);
        setViewItemId(itemIdBeingEdited);
        showMessage('Item updated successfully.', 'success');
        return;
      }

      const newItem = {
        id: itemIdForSave,
        ...itemPayload
      };
      const next = [newItem, ...items];
      await saveItems(next, { autoSync: true, silentAutoSync: true });
      setForm(emptyForm(form.category));
      setShowFormSecret(false);
      setIsItemPopupOpen(false);
      setViewItemId(newItem.id);
      showMessage('Item saved successfully.', 'success');
    } catch (error) {
      showMessage(error.message || 'Item could not be saved. Please try again.', 'error');
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
      file: item.payload?.file || null
    });
    setShowFormSecret(false);
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
    setIsItemPopupOpen(false);
  }

  async function deleteItem(id) {
    if (viewItemId === id) setViewItemId('');
    await saveItems(items.filter((item) => item.id !== id), { autoSync: true });
    showMessage(bootstrap.tenantId && bootstrap.userId ? 'Item deleted and backup requested.' : 'Item deleted. Save your account details to enable cloud backup.');
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
      const result = await postJson('/.netlify/functions/bootstrap-admin', { ...bootstrap, email, phoneCountryCode: checked.phoneCountryCode, phoneNumber: checked.phoneNumber, phoneE164: checked.phoneE164, accountLoginFoundation: true, saasAccountFoundation: true, accountName: bootstrap.accountName || bootstrap.tenantName || 'Private Vault', planCode: bootstrap.planCode || 'personal_free', planStatus: bootstrap.planStatus || 'trial_pending', accountStatus: bootstrap.accountStatus || 'active', tenantRole: bootstrap.tenantRole || 'primary_owner' });
      if (result.ok) {
        const next = { ...bootstrap, email, phoneCountryCode: checked.phoneCountryCode, phoneNumber: checked.phoneNumber, phoneE164: result.phoneE164 || checked.phoneE164, tenantId: result.tenantId, userId: result.userId, accountVerified: true, otpStatus: 'Recovery verification ready', accountName: result.accountName || bootstrap.accountName || bootstrap.tenantName, planCode: result.planCode || bootstrap.planCode || 'personal_free', planStatus: result.planStatus || bootstrap.planStatus || 'trial_pending', accountStatus: result.accountStatus || bootstrap.accountStatus || 'active', tenantRole: result.tenantRole || bootstrap.tenantRole || 'primary_owner' };
        setBootstrap(next);
        showMessage(result.message || 'Account details saved.');
        if (masterPassword) {
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
    if (!bootstrap.tenantId || !bootstrap.userId) {
      const note = 'Save your account details first so backup history can be loaded.';
      setSnapshotHistory((current) => ({ ...current, loaded: true, loading: false, message: note }));
      if (shouldShowMessage) showMessage(note);
      return null;
    }
    setSnapshotHistory((current) => ({ ...current, loading: true, message: 'Loading backup history...' }));
    try {
      const result = await fetch(`/.netlify/functions/sync-vault?tenantId=${encodeURIComponent(bootstrap.tenantId)}&userId=${encodeURIComponent(bootstrap.userId)}&history=1`).then((res) => res.json());
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
    const effectiveItems = options.nextItems || items;
    const envelope = options.envelope || getLocalEnvelope();
    const silent = Boolean(options.silent);
    if (!envelope) {
      const note = 'No local encrypted vault envelope found yet.';
      setSyncStatus({ state: 'error', message: note, lastSyncAt: '', lastSnapshotId: '', itemCount: getVisibleVaultItems(effectiveItems).length, snapshotCount: snapshotHistory.total });
      if (!silent) showMessage(note);
      return { ok: false, message: note };
    }
    if (!bootstrap.tenantId || !bootstrap.userId) {
      const note = 'Save your account details first so cloud backup can run.';
      setSyncStatus({ state: 'warning', message: note, lastSyncAt: syncStatus.lastSyncAt, lastSnapshotId: syncStatus.lastSnapshotId, itemCount: getVisibleVaultItems(effectiveItems).length, snapshotCount: snapshotHistory.total });
      if (!silent) showMessage(note);
      return { ok: false, message: note };
    }
    setSyncing(true);
    setSyncStatus({ state: 'syncing', message: silent ? 'Saving your cloud backup...' : 'Saving your cloud backup...', lastSyncAt: syncStatus.lastSyncAt, lastSnapshotId: syncStatus.lastSnapshotId, itemCount: getVisibleVaultItems(effectiveItems).length, snapshotCount: snapshotHistory.total });
    try {
      const result = await postJson('/.netlify/functions/sync-vault', {
        tenantId: bootstrap.tenantId,
        userId: bootstrap.userId,
        encryptedBlob: envelope.encrypted,
        localSalt: envelope.salt,
        localIv: envelope.iv,
        itemCount: getVisibleVaultItems(effectiveItems).length,
        clientUpdatedAt: envelope.updatedAt
      });
      if (!result.ok) {
        const note = `${result.message || 'Encrypted vault did not sync.'}${result.error ? ` Error: ${result.error}` : ''}`;
        setSyncStatus({ state: 'error', message: note, lastSyncAt: '', lastSnapshotId: '', itemCount: getVisibleVaultItems(effectiveItems).length, snapshotCount: snapshotHistory.total });
        if (!silent) showMessage(note);
        return result;
      }
      const verified = await fetch(`/.netlify/functions/sync-vault?tenantId=${encodeURIComponent(bootstrap.tenantId)}&userId=${encodeURIComponent(bootstrap.userId)}`).then((res) => res.json());
      const verifiedSnapshot = verified?.snapshot || null;
      const history = await loadSnapshotHistory(false);
      const lastSyncAt = new Date().toISOString();
      const snapshotCount = history?.total || snapshotHistory.total || (verified?.hasSnapshot ? 1 : 0);
      const note = verified?.hasSnapshot
        ? `${silent ? 'Backup complete.' : 'Vault backup saved.'} ${snapshotCount} backup(s) saved. Latest backup contains ${verifiedSnapshot?.item_count ?? getVisibleVaultItems(effectiveItems).length} item(s).`
        : 'Vault backup was saved. Latest backup details are still updating.';
      setSyncStatus({
        state: verified?.hasSnapshot ? 'success' : 'warning',
        message: note,
        lastSyncAt,
        lastSnapshotId: verifiedSnapshot?.id || result.snapshotId || '',
        itemCount: Number(verifiedSnapshot?.item_count ?? getVisibleVaultItems(effectiveItems).length),
        snapshotCount
      });
      if (!silent) showMessage(note);
      return { ...result, verified };
    } catch (error) {
      const note = `Could not complete cloud backup. ${error.message || 'Please try again.'}`;
      setSyncStatus({ state: 'error', message: note, lastSyncAt: '', lastSnapshotId: '', itemCount: getVisibleVaultItems(effectiveItems).length, snapshotCount: snapshotHistory.total });
      if (!silent) showMessage(note);
      return { ok: false, message: note };
    } finally {
      setSyncing(false);
    }
  }

  async function restoreCloudToThisDevice() {
    if (!masterPassword) return showMessage('Unlock the vault first so the app can restore your cloud backup.');
    const confirmed = window.confirm('This will restore your latest cloud backup to this device. If your master password cannot open it, your current vault will not be changed. Continue?');
    if (!confirmed) return;
    try {
      const result = await restoreLatestCloudVault(masterPassword, { showSuccess: true, reason: 'manual' });
      if (!result.restored) showMessage(result.latest?.message || 'No cloud backup found yet. Your local vault was not changed.');
    } catch (error) {
      showMessage('That master password could not open your cloud backup. Your local vault was not changed.');
    }
  }

  const visibleItems = useMemo(() => getVisibleVaultItems(items), [items]);
  const customFolders = useMemo(() => getCustomFolders(items), [items]);
  const savedFolderOrder = useMemo(() => getFolderOrder(items), [items]);
  const selectableFolders = useMemo(() => [...BUILT_IN_CATEGORIES, ...customFolders], [customFolders]);

  const filteredItems = useMemo(() => {
    const activeSearch = query.trim().toLowerCase();
    const hasFolder = Boolean(category);
    if (!activeSearch && !hasFolder) return [];
    return visibleItems.filter((item) => {
      const text = `${item.title} ${item.category} ${item.payload?.url || ''} ${item.payload?.username || ''} ${item.payload?.notes || ''}`.toLowerCase();
      const matchesSearch = activeSearch ? text.includes(activeSearch) : true;
      const matchesFolder = activeSearch ? true : (!category ? true : category === 'All' ? true : category === 'Favourites' ? item.favourite : item.category === category);
      return matchesSearch && matchesFolder;
    }).sort((a, b) => Number(b.favourite) - Number(a.favourite) || new Date(b.updatedAt) - new Date(a.updatedAt));
  }, [visibleItems, query, category]);

  const folderChips = useMemo(() => {
    const baseFolders = [
      { name: 'All', count: visibleItems.length, favourite: false, custom: false, fixed: true },
      { name: 'Favourites', count: visibleItems.filter((item) => item.favourite).length, favourite: true, custom: false, fixed: false },
      ...BUILT_IN_CATEGORIES.map((cat) => ({ name: cat, count: visibleItems.filter((item) => item.category === cat).length, favourite: false, custom: false, fixed: false })),
      ...customFolders.map((cat) => ({ name: cat, count: visibleItems.filter((item) => item.category === cat).length, favourite: false, custom: true, fixed: false }))
    ];
    const first = baseFolders.find((folder) => folder.name === 'All');
    const rest = baseFolders.filter((folder) => folder.name !== 'All');
    const order = savedFolderOrder.filter((name) => rest.some((folder) => folder.name === name));
    const orderedRest = [
      ...order.map((name) => rest.find((folder) => folder.name === name)).filter(Boolean),
      ...rest.filter((folder) => !order.includes(folder.name))
    ];
    return [first, ...orderedRest].filter(Boolean);
  }, [visibleItems, customFolders, savedFolderOrder]);

  const hasActiveVaultFilter = Boolean(query.trim() || category);
  const viewedItem = viewItemId ? visibleItems.find((item) => item.id === viewItemId) : null;
  const routePath = typeof window !== 'undefined' ? window.location.pathname : '/vault';
  const isVaultRoute = ['/vault', '/app', '/login'].includes(routePath);
  const isPublicLandingRoute = !isVaultRoute;

  function openVaultApp() {
    window.location.assign('/vault');
  }

  function openCreateAccountPopup() {
    setLandingOnboardingStep(1);
    setLandingAccountDraft((current) => ({
      ...current,
      displayName: current.displayName || bootstrap.displayName || '',
      email: current.email || bootstrap.email || '',
      phoneCountryCode: current.phoneCountryCode || bootstrap.phoneCountryCode || '+254',
      phoneCountryIso: current.phoneCountryIso || bootstrap.phoneCountryIso || 'ke',
      phoneNumber: current.phoneNumber || bootstrap.phoneNumber || '',
      phoneE164: current.phoneE164 || bootstrap.phoneE164 || '',
      accountName: current.accountName || bootstrap.accountName || bootstrap.tenantName || 'My Private Vault',
      planCode: current.planCode || bootstrap.planCode || 'personal_free'
    }));
    setIsCreateAccountPopupOpen(true);
  }

  function closeCreateAccountPopup() {
    setIsCreateAccountPopupOpen(false);
    setLandingOnboardingStep(1);
  }

  function updateLandingDraft(patch) {
    setLandingAccountDraft((current) => {
      const next = { ...current, ...patch };
      next.phoneE164 = buildPhoneE164(next.phoneCountryCode || '+254', next.phoneNumber || '');
      return next;
    });
  }

  function continueLandingOnboarding() {
    const draft = {
      ...landingAccountDraft,
      phoneCountryCode: normaliseCountryCode(landingAccountDraft.phoneCountryCode || '+254') || '+254',
      phoneNumber: String(landingAccountDraft.phoneNumber || '').trim(),
      phoneE164: buildPhoneE164(landingAccountDraft.phoneCountryCode || '+254', landingAccountDraft.phoneNumber || ''),
      email: String(landingAccountDraft.email || '').trim().toLowerCase(),
      displayName: String(landingAccountDraft.displayName || '').trim(),
      accountName: String(landingAccountDraft.accountName || 'My Private Vault').trim(),
      tenantName: String(landingAccountDraft.accountName || 'My Private Vault').trim(),
      planCode: landingAccountDraft.planCode || 'personal_free',
      planStatus: landingAccountDraft.planCode === 'founder_private' ? 'founder_active' : 'trial_pending',
      accountStatus: 'active',
      tenantRole: 'primary_owner',
      onboardingStatus: 'landing_onboarding_started'
    };

    if (!draft.phoneE164) {
      setLandingOnboardingStep(1);
      showMessage('Please enter a mobile number so the secure setup can continue.', 'warning');
      return;
    }
    if (!draft.email || !draft.email.includes('@')) {
      setLandingOnboardingStep(1);
      showMessage('Please enter a valid email address for OTP recovery.', 'warning');
      return;
    }
    if (!draft.accountName) {
      setLandingOnboardingStep(1);
      showMessage('Please enter an account or vault name.', 'warning');
      return;
    }

    const nextAccount = { ...bootstrap, ...draft };
    localStorage.setItem(BOOTSTRAP_KEY, JSON.stringify(nextAccount));
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(nextAccount));
    setBootstrap(nextAccount);
    window.location.assign('/vault');
  }


  function openVaultSection(cat) {
    setCategory(cat);
    setActivePage('home');
  }

  function openAddItem() {
    const preferredCategory = category && !['All', 'Favourites'].includes(category) ? category : 'Passwords';
    setEditingItemId('');
    setForm(emptyForm(preferredCategory));
    setShowFormSecret(false);
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
    const next = upsertFolderMetaItem(items, customFolders, cleanOrder);
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

  function startTouchFolderReorder(folderName) {
    if (!folderName || folderName === 'All') return;
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

  function closeItemPopup() {
    if (editingItemId) cancelEdit();
    else {
      setForm(emptyForm(form.category));
      setShowFormSecret(false);
      setIsItemPopupOpen(false);
    }
  }

  function openViewItem(item) {
    setViewItemId(item.id);
    setShowSecrets((current) => ({ ...current, [item.id]: false }));
  }

  function closeViewItem() {
    setViewItemId('');
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

  if (isPublicLandingRoute) {
    return (
      <main className="public-landing-page">
        <header className="public-landing-topbar">
          <div className="public-brand"><Lock size={22} /><span>My Passwords</span></div>
          <button type="button" className="secondary-button public-open-button" onClick={openVaultApp}><Unlock size={17} /> Open My Vault</button>
        </header>

        <section className="landing-hero-shell" aria-label="My Passwords introduction">
          <div className="landing-hero-copy">
            <div className="landing-pill"><Sparkles size={16} /> Private vault for passwords, notes and documents</div>
            <h1>Keep your important private details in one secure place.</h1>
            <p className="landing-intro">My Passwords is a clean encrypted vault for logins, secret notes, checklists and important documents. It is designed for everyday personal use now, with room to grow into family and business vaults later.</p>
            <div className="landing-cta-row">
              <button type="button" className="primary-button landing-primary-cta" onClick={openCreateAccountPopup}><UserRoundCheck size={18} /> Create Account</button>
              <button type="button" className="secondary-button landing-secondary-cta" onClick={openVaultApp}><Unlock size={18} /> Open My Vault</button>
            </div>
            <div className="landing-trust-strip" aria-label="Security highlights">
              <span><ShieldCheck size={16} /> Browser-side encryption</span>
              <span><Cloud size={16} /> Encrypted cloud backup</span>
              <span><MonitorSmartphone size={16} /> Installable PWA</span>
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
              <h2>Passwords, documents and private notes</h2>
              <div className="preview-search-row"><Search size={16} /> Search your vault</div>
            </div>
            <div className="preview-card-grid">
              <article><KeyRound size={18} /><strong>Passwords</strong><span>Logins and access details</span></article>
              <article><FileText size={18} /><strong>Documents</strong><span>PDF, Word, Excel and text files</span></article>
              <article><Star size={18} /><strong>Favourites</strong><span>Fast access to essentials</span></article>
              <article><RefreshCw size={18} /><strong>Sync</strong><span>Encrypted backup snapshots</span></article>
            </div>
          </div>
        </section>

        <section className="landing-section landing-feature-section" aria-label="Features">
          <div className="landing-section-heading">
            <p className="eyebrow">Everything important, neatly organised</p>
            <h2>A vault that feels simple, even when life is not.</h2>
            <p>Store the details you always need, protect the details you never want exposed, and keep your most important records close at hand.</p>
          </div>
          <div className="landing-feature-grid">
            <article><ShieldCheck size={24} /><h3>Private by design</h3><p>Your vault is encrypted in the browser before it is stored locally, backed up, or uploaded as a document.</p></article>
            <article><FileText size={24} /><h3>Documents included</h3><p>Store important PDFs, Word files, Excel files, text notes and records alongside your private vault items.</p></article>
            <article><Search size={24} /><h3>Find things quickly</h3><p>Search across folders, favourites and saved records without turning your vault into a cluttered filing cabinet.</p></article>
            <article><MonitorSmartphone size={24} /><h3>Made for daily use</h3><p>Install it as a PWA and open your private vault directly from your phone, laptop or desktop.</p></article>
          </div>
        </section>

        <section className="landing-section landing-how-section" aria-label="How setup works">
          <div className="landing-section-heading compact">
            <p className="eyebrow">Simple setup</p>
            <h2>Create your account, then create your private vault.</h2>
          </div>
          <div className="landing-step-grid">
            <article><span>1</span><strong>Create your account</strong><p>Add your name, email and mobile details for account setup and recovery.</p></article>
            <article><span>2</span><strong>Verify securely</strong><p>Use email verification before creating or restoring a vault on a new device.</p></article>
            <article><span>3</span><strong>Choose your master password</strong><p>Your master password protects the encrypted vault and is never stored by the app.</p></article>
            <article><span>4</span><strong>Start saving safely</strong><p>Add passwords, notes, checklists and documents to your encrypted private vault.</p></article>
          </div>
        </section>

        <section className="landing-section landing-plan-section" aria-label="Plans">
          <div>
            <p className="eyebrow">Ready to grow</p>
            <h2>Personal now. Family and business options later.</h2>
            <p>Start with a private personal vault, then grow into family or business options as they become available. Existing vaults stay private, encrypted and separate.</p>
          </div>
          <div className="landing-mini-plans">
            <article><strong>Personal</strong><span>Private vault for one user</span></article>
            <article><strong>Family</strong><span>Prepared for shared household access</span></article>
            <article><strong>Business</strong><span>Prepared for client and team accounts</span></article>
          </div>
        </section>



        <section className="landing-section landing-security-section" aria-label="Privacy and security">
          <div className="landing-section-heading">
            <p className="eyebrow">Privacy and security</p>
            <h2>Built around the idea that private details should stay private.</h2>
            <p>My Passwords keeps the public website separate from your private vault. Your master password is created on the vault page and your saved data is encrypted before it is stored.</p>
          </div>
          <div className="landing-security-grid">
            <article><ShieldCheck size={23} /><strong>Master password stays private</strong><p>Your master vault password is not stored by the app. It is the key to decrypting your private vault.</p></article>
            <article><Lock size={23} /><strong>Encrypted before backup</strong><p>Vault records and uploaded documents are encrypted before they are saved locally or sent to cloud storage.</p></article>
            <article><MonitorSmartphone size={23} /><strong>Private vault route</strong><p>The installed app opens the secure vault page directly, while the public landing page remains separate.</p></article>
          </div>
        </section>

        <section className="landing-section landing-faq-section" aria-label="Frequently asked questions">
          <div className="landing-section-heading compact">
            <p className="eyebrow">Questions answered</p>
            <h2>Frequently asked questions.</h2>
          </div>
          <div className="landing-faq-grid">
            <article><h3>Can My Passwords recover my master password?</h3><p>No. Your master password is what unlocks the encrypted vault. If it is forgotten, the encrypted vault cannot be decrypted.</p></article>
            <article><h3>Where does the vault open?</h3><p>The public website opens at the main domain. Your private vault and installed PWA open at the dedicated vault page.</p></article>
            <article><h3>Can I store documents too?</h3><p>Yes. The vault supports encrypted document storage for PDF, Word, Excel, text and related files.</p></article>
            <article><h3>Is this only for one person?</h3><p>The current foundation supports personal use first, with family and business options planned for future SaaS stages.</p></article>
          </div>
        </section>

        <section className="landing-section landing-contact-section" aria-label="Contact and support">
          <div className="landing-contact-copy">
            <p className="eyebrow">Need help?</p>
            <h2>Support for setup, access and account questions.</h2>
            <p>Use the support options for help with getting started, opening your vault on a new device, or asking about future family and business accounts.</p>
          </div>
          <div className="landing-contact-card">
            <div><Mail size={20} /><span><strong>Email support</strong><small>Use your account email when asking for help.</small></span></div>
            <a href="mailto:info@zippyweb.uk">info@zippyweb.uk</a>
            <button type="button" className="primary-button" onClick={openCreateAccountPopup}><UserRoundCheck size={18} /> Create Account</button>
            <button type="button" className="secondary-button" onClick={openVaultApp}><Unlock size={18} /> Open My Vault</button>
          </div>
        </section>

        <section className="landing-final-cta" aria-label="Create account">
          <div>
            <p className="eyebrow">Start securely</p>
            <h2>Create your encrypted vault account.</h2>
            <p>Set up your account from the landing page, then continue to the private vault screen to create your secure master password.</p>
          </div>
          <button type="button" className="primary-button landing-primary-cta" onClick={openCreateAccountPopup}><UserRoundCheck size={18} /> Create Account</button>
        </section>

        <footer className="landing-footer">
          <div className="landing-footer-copy">
            <span>© 2026 My Passwords</span>
            <small>A ZippyWeb project, built to keep everyday private details safer and easier to manage.</small>
          </div>
          <button type="button" onClick={openVaultApp}>Open My Vault</button>
        </footer>

        {isCreateAccountPopupOpen && (
          <div className="item-popup-layer create-account-popup-layer" role="dialog" aria-modal="true" aria-label="Create My Passwords account">
            <div className="item-popup-backdrop" onClick={closeCreateAccountPopup} />
            <section className="item-popup-card create-account-popup-card">
              <header className="item-popup-header">
                <div>
                  <p className="eyebrow">Create Account</p>
                  <h2><UserRoundCheck size={20} /> Set up your secure vault</h2>
                </div>
                <button type="button" className="icon-button" onClick={closeCreateAccountPopup} aria-label="Close create account popup"><X size={18} /></button>
              </header>
              <div className="item-popup-body create-account-popup-body">
                <div className="onboarding-progress" aria-label="Onboarding progress">
                  {[1, 2, 3].map((step) => <span key={step} className={landingOnboardingStep === step ? 'active' : landingOnboardingStep > step ? 'complete' : ''}>{step}</span>)}
                </div>

                {landingOnboardingStep === 1 && (
                  <div className="create-account-step">
                    <h3>Your account details</h3>
                    <p>These details prepare your SaaS account record and help you recover your vault on a new device. They do not replace your master vault password.</p>
                    <label>Display name<input value={landingAccountDraft.displayName} onChange={(e) => updateLandingDraft({ displayName: e.target.value })} placeholder="Your name" /></label>
                    <label>Email for OTP recovery<input type="email" value={landingAccountDraft.email} onChange={(e) => updateLandingDraft({ email: e.target.value })} placeholder="you@example.com" /></label>
                    <label>Mobile number</label>
                    <div className="phone-combo-field">
                      <CountryPicker countryCode={landingAccountDraft.phoneCountryCode || '+254'} countryIso={landingAccountDraft.phoneCountryIso || 'ke'} onChange={(country) => updateLandingDraft({ phoneCountryCode: country.code, phoneCountryIso: country.iso })} />
                      <input inputMode="tel" value={landingAccountDraft.phoneNumber || ''} onChange={(e) => updateLandingDraft({ phoneNumber: e.target.value })} placeholder="712345678" />
                    </div>
                    <label>Account / vault name<input value={landingAccountDraft.accountName} onChange={(e) => updateLandingDraft({ accountName: e.target.value })} placeholder="My Private Vault" /></label>
                  </div>
                )}

                {landingOnboardingStep === 2 && (
                  <div className="create-account-step">
                    <h3>Choose your starting plan</h3>
                    <p>Choose the option that best matches how you expect to use My Passwords.</p>
                    <div className="plan-choice-grid">
                      <button type="button" className={landingAccountDraft.planCode === 'personal_free' ? 'active' : ''} onClick={() => updateLandingDraft({ planCode: 'personal_free' })}><strong>Personal</strong><span>A private vault for one person.</span></button>
                      <button type="button" className={landingAccountDraft.planCode === 'family_foundation' ? 'active' : ''} onClick={() => updateLandingDraft({ planCode: 'family_foundation' })}><strong>Family</strong><span>For household vault sharing when available.</span></button>
                      <button type="button" className={landingAccountDraft.planCode === 'business_foundation' ? 'active' : ''} onClick={() => updateLandingDraft({ planCode: 'business_foundation' })}><strong>Business</strong><span>For team and client vaults when available.</span></button>
                    </div>
                    <div className="saas-inline-note"><ShieldCheck size={16} /><span>Your existing vault remains protected. This step does not change your saved passwords, documents or encrypted backups.</span></div>
                  </div>
                )}

                {landingOnboardingStep === 3 && (
                  <div className="create-account-step">
                    <h3>Security confirmation</h3>
                    <p>Next you will continue to the private vault setup page, where email OTP and the master vault password are handled securely.</p>
                    <div className="security-check-list">
                      <span><ShieldCheck size={17} /> Your master vault password is never stored by the app.</span>
                      <span><ShieldCheck size={17} /> If the master password is forgotten, the encrypted vault cannot be recovered.</span>
                      <span><ShieldCheck size={17} /> Existing vault data is not overwritten by this landing-page flow.</span>
                    </div>
                    <div className="account-summary-card">
                      <span><strong>Account</strong>{landingAccountDraft.accountName || 'My Private Vault'}</span>
                      <span><strong>Email</strong>{landingAccountDraft.email || 'not set'}</span>
                      <span><strong>Phone</strong>{landingAccountDraft.phoneE164 || buildPhoneE164(landingAccountDraft.phoneCountryCode, landingAccountDraft.phoneNumber) || 'not set'}</span>
                      <span><strong>Plan</strong>{landingAccountDraft.planCode || 'personal_free'}</span>
                    </div>
                  </div>
                )}
              </div>
              <footer className="item-popup-footer create-account-popup-footer">
                <button type="button" className="secondary-button" onClick={landingOnboardingStep === 1 ? closeCreateAccountPopup : () => setLandingOnboardingStep((step) => Math.max(1, step - 1))}>{landingOnboardingStep === 1 ? 'Cancel' : 'Back'}</button>
                {landingOnboardingStep < 3 ? (
                  <button type="button" className="primary-button" onClick={() => setLandingOnboardingStep((step) => Math.min(3, step + 1))}>Continue</button>
                ) : (
                  <button type="button" className="primary-button" onClick={continueLandingOnboarding}><Unlock size={18} /> Continue to secure setup</button>
                )}
              </footer>
            </section>
          </div>
        )}
        <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      </main>
    );
  }

  if (locked) {
    return (
      <main className="lock-screen">
        <section className="lock-card" id="vault-access-card">
          <div className="brand-mark"><Lock size={38} /></div>
          <p className="eyebrow">Secure private vault</p>
          <h1>My Passwords</h1>
          {hasLocalVault ? (
            <>
              <p className="intro">Unlock your private vault with your master password.</p>
              <form onSubmit={unlockVault} className="unlock-form">
                <label>Master vault password</label>
                <input id="master-password-input" type="password" value={masterPassword} onChange={(e) => setMasterPassword(e.target.value)} placeholder="Enter your master password" autoFocus={hasLocalVault && !suppressUnlockAutofocus} />
                <button type="submit"><Unlock size={18} /> Unlock Local Vault</button>
              </form>
              <button type="button" className="link-danger" onClick={resetLocalVaultOnDevice}>Clear local vault on this device</button>
            </>
          ) : (
            <>
              <p className="intro">Create your encrypted vault on this device, or verify your account to open an existing secure backup.</p>
              <div className="create-vault-entry-actions">
                <button type="button" className="primary-button" onClick={() => { setCreateMode(true); setIsCreateVaultPopupOpen(true); }}><Plus size={18} /> Create Vault</button>
                <button type="button" className="secondary-button" onClick={() => { setCreateMode(false); setIsCreateVaultPopupOpen(true); }}><RefreshCw size={17} /> Open Existing Vault</button>
              </div>
            </>
          )}
          {message && <p className="message">{message}</p>}
          <div className="security-note"><ShieldCheck size={18} /> Your master password opens your vault. Your phone and email help verify your account.</div>
          <p className="version">{VERSION}</p>
        </section>

        {isCreateVaultPopupOpen && !hasLocalVault && (
          <div className="item-popup-layer create-vault-popup-layer" role="presentation">
            <div className="item-popup-backdrop" onClick={() => setIsCreateVaultPopupOpen(false)} />
            <section className="item-popup-card create-account-popup-card create-vault-popup-card" role="dialog" aria-modal="true" aria-labelledby="create-vault-title">
              <header className="item-popup-header">
                <div>
                  <p className="eyebrow">Secure setup</p>
                  <h2 id="create-vault-title"><ShieldCheck size={21} /> Create your vault</h2>
                </div>
                <button type="button" className="icon-button" onClick={() => setIsCreateVaultPopupOpen(false)} aria-label="Close create vault popup"><X size={18} /></button>
              </header>

              <form onSubmit={unlockVault} className="item-popup-body create-account-popup-body create-vault-popup-body">
                <div className="create-account-step">
                  <h3>Account details</h3>
                  <p>Your email and mobile number help verify this device. Your master password is still the only key that opens the vault.</p>
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
                  <p>Request a one-time email code, then enter it below before creating or opening the vault on this device.</p>
                  <div className={`otp-test-panel ${otpTest.status}`}>
                    <div className="otp-test-title"><ShieldCheck size={16} /><strong>One-time code</strong></div>
                    <div className={`otp-channel-toggle premium-toggle ${otpChannel}`} role="tablist" aria-label="Choose OTP delivery method">
                      <button type="button" className={otpChannel === 'email' ? 'active' : ''} onClick={() => setOtpChannel('email')}><Mail size={15} /> Email</button>
                      <button type="button" className={otpChannel === 'sms' ? 'active' : ''} onClick={() => setOtpChannel('sms')}><Phone size={15} /> SMS</button>
                    </div>
                    {otpTest.message && <div className={`otp-status-line ${otpTest.verified ? 'verified' : ''}`}>{otpTest.message}</div>}
                    {otpTest.code && <div className="test-code-box"><span>Recovery code</span><code>{otpTest.code}</code></div>}
                    <div className="otp-flow-row create-vault-otp-row">
                      <button type="button" className="secondary-button otp-send-button" onClick={requestSelectedOtp} disabled={otpTest.status === 'requesting' || otpChannel === 'sms'}>{otpTest.status === 'requesting' ? 'Sending...' : (otpChannel === 'email' ? 'Send email OTP' : 'SMS coming soon')}</button>
                      <input inputMode="numeric" value={otpTest.input} onChange={(e) => setOtpTest({ ...otpTest, input: e.target.value })} placeholder="Enter 6-digit OTP" />
                      <button type="button" className="secondary-button otp-verify-button" onClick={verifyTestOtp} disabled={otpTest.status === 'verifying'}>Verify OTP</button>
                    </div>
                    {otpTest.verified && <div className="otp-next-step"><ShieldCheck size={16} /><span>Account verified. Now set your master password.</span><button type="button" className="mini-inline-button" onClick={focusMasterPassword}>Master password</button></div>}
                  </div>
                </div>

                <div className="create-account-step">
                  <h3>Master password</h3>
                  <p>Choose a strong master password you can remember. It is not stored by the app and cannot be recovered if forgotten.</p>
                  <label>Master vault password<input id="master-password-input" type="password" value={masterPassword} onChange={(e) => setMasterPassword(e.target.value)} placeholder="Enter your master password" /></label>
                  {createMode && (
                    <>
                      <label>Confirm master vault password<input type="password" value={confirmMasterPassword} onChange={(e) => setConfirmMasterPassword(e.target.value)} placeholder="Type the same password again" /></label>
                      <p className="create-warning">New vault creation only continues when both password entries match.</p>
                    </>
                  )}
                </div>
              </form>

              <footer className="item-popup-footer create-account-popup-footer">
                <button type="button" className="secondary-button" onClick={() => setIsCreateVaultPopupOpen(false)}>Cancel</button>
                <button type="submit" className="primary-button" onClick={(event) => unlockVault(event)}><Unlock size={18} /> {createMode ? 'Create Secure Vault' : 'Open Secure Vault'}</button>
              </footer>
            </section>
          </div>
        )}
        <VerificationOverlay state={verifyOverlay} onClose={hideVerifyOverlay} onFocusMasterPassword={focusMasterPassword} />
        <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar app-home-topbar">
        <div className="topbar-title-block">
          <p className="eyebrow">Secure private vault</p>
          <h1>My Passwords</h1>
        </div>
        <button className="lock-button mobile-top-lock" onClick={() => lockVault()} aria-label="Lock vault"><Lock size={18} /> <span>Lock</span></button>
        <div className="topbar-actions">
          <button type="button" className={activePage === 'home' ? 'nav-pill active' : 'nav-pill'} onClick={() => setActivePage('home')}><KeyRound size={17} /> Vault</button>
          <button type="button" className={activePage === 'settings' ? 'nav-pill active' : 'nav-pill'} onClick={() => setActivePage('settings')}><Settings size={17} /> Settings</button>
          <button className="lock-button desktop-lock-button" onClick={() => lockVault()}><Lock size={18} /> Lock</button>
        </div>
      </header>

      {activePage === 'home' ? (
        <>
          <section className="home-search-panel">
            <div className="search-box hero-search"><Search size={19} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your vault" /></div>
            <div className="chip-row vault-folder-row" id="vault-list-section">
              {folderChips.map((folder) => {
                const isDragging = draggedFolderName === folder.name || touchReorderFolder === folder.name;
                const isDropTarget = touchDropTargetFolder === folder.name && touchReorderFolder && touchReorderFolder !== folder.name;
                return (
                  <button
                    key={folder.name}
                    type="button"
                    data-folder-name={folder.name}
                    draggable={!folder.fixed}
                    className={`${folder.name === category ? 'chip active' : 'chip'}${folder.fixed ? ' fixed-folder-chip' : ''}${isDragging ? ' folder-dragging' : ''}${isDropTarget ? ' folder-drop-target' : ''}`}
                    onClick={() => !touchReorderFolder && openVaultSection(folder.name)}
                    onDragStart={(event) => { if (folder.fixed) return; setDraggedFolderName(folder.name); event.dataTransfer.effectAllowed = 'move'; }}
                    onDragOver={(event) => { if (draggedFolderName && !folder.fixed) event.preventDefault(); }}
                    onDrop={async (event) => { event.preventDefault(); const source = draggedFolderName; setDraggedFolderName(''); await reorderFolder(source, folder.name); }}
                    onDragEnd={() => setDraggedFolderName('')}
                    onTouchStart={() => startTouchFolderReorder(folder.name)}
                    onTouchMove={moveTouchFolderReorder}
                    onTouchEnd={endTouchFolderReorder}
                    onTouchCancel={endTouchFolderReorder}
                  >
                    {folder.favourite && <Star size={15} fill="currentColor" />} {folder.name}
                    {folder.custom && <span className="custom-folder-dot" title="Custom folder" aria-hidden="true" />}
                    <span className="chip-count">{folder.count}</span>
                  </button>
                );
              })}
            </div>
            <div className="home-quick-summary">
              <span><strong>{visibleItems.length}</strong> Item{visibleItems.length === 1 ? '' : 's'}</span>
              <span><strong>{visibleItems.filter((item) => item.favourite).length}</strong> favourite{visibleItems.filter((item) => item.favourite).length === 1 ? '' : 's'}</span>
              <button type="button" className="summary-action add-folder-chip" onClick={() => setIsFolderPopupOpen(true)}><Plus size={14} /> New folder</button>
            </div>
          </section>

          <button type="button" className="floating-add-button" onClick={openAddItem} aria-label="Add item" title="Add item"><Plus size={28} /></button>

          {isItemPopupOpen && (
            <div className="item-popup-layer" role="dialog" aria-modal="true" aria-label={editingItemId ? 'Edit item' : 'Add item'}>
              <button type="button" className="item-popup-backdrop" onClick={closeItemPopup} aria-label="Close add item popup" />
              <form className={editingItemId ? "item-form item-popup-card edit-mode" : "item-form item-popup-card"} onSubmit={saveItem}>
                <div className="item-popup-header">
                  <h2>{editingItemId ? <Pencil size={20} /> : <Plus size={20} />} {editingItemId ? 'Edit item' : 'Add item'}</h2>
                  <button type="button" className="icon-button" onClick={closeItemPopup} aria-label="Close"><X size={18} /></button>
                </div>
                <div className="item-popup-body">
                  <p className="form-helper">{editingItemId ? 'Update the saved details, then save your changes.' : 'Save a new secure item in your vault.'}</p>
                  {editingItemId && <div className="edit-banner"><Pencil size={16} /><span>Editing existing item. Save updates or cancel without changing the vault.</span></div>}
                <label>Folder<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value, username: ['Notes', 'Checklists', DOCUMENTS_CATEGORY].includes(e.target.value) ? '' : form.username, password: ['Notes', 'Checklists', DOCUMENTS_CATEGORY].includes(e.target.value) ? '' : form.password })}>{selectableFolders.map((cat) => <option key={cat}>{cat}</option>)}</select></label>
                <label>Title<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={activeHint.title} /></label>
                {!['Checklists', DOCUMENTS_CATEGORY].includes(form.category) && <label>URL / Link<input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder={activeHint.url} /></label>}
                {!['Notes', 'Checklists', DOCUMENTS_CATEGORY].includes(form.category) && (
                  <>
                    <label>Username / Reference<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder={activeHint.username} /></label>
                    <label>Password / Secret
                      <div className="secret-input-row">
                        <input type={showFormSecret ? 'text' : 'password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={activeHint.secret} />
                        <button type="button" className="mini-button" onClick={() => setShowFormSecret(!showFormSecret)}>{showFormSecret ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                      </div>
                    </label>
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
                <label>{form.category === 'Checklists' ? 'Checklist items' : form.category === DOCUMENTS_CATEGORY ? 'Document notes' : 'Notes'}<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={activeHint.notes} rows="6" /></label>
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
                  <label>Folder name<input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="e.g. Family, Travel, Clients" autoFocus /></label>
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
                    <span className="vault-result-name">{item.title}</span>
                    <span className="vault-result-open" aria-hidden="true"><ExternalLink size={17} /></span>
                  </button>
                ))}
              </div>
            )}
            {hasActiveVaultFilter && !filteredItems.length && <div className="empty-state">No vault items match that search or folder.</div>}
          </section>
        </>
      ) : (
        <section className="settings-page">
          <div className="settings-header-card">
            <p className="eyebrow">Settings</p>
            <h2><Settings size={22} /> Vault Info & Account</h2>
            <p>Backup, restore, account recovery and technical details live here so the vault home stays clean.</p>
          </div>

          <section className="status-grid settings-status-grid">
            <article><KeyRound /><strong>{visibleItems.length}</strong><span>Items</span></article>
            <article><Database /><strong>{dbStatus.connected ? 'Ready' : 'Checking'}</strong><span>Cloud backup</span></article>
            <article><Cloud /><strong>{snapshotHistory.total || syncStatus.snapshotCount || 0}</strong><span>Backups</span></article>
            <article><UserRoundCheck /><strong>{bootstrap.userId ? 'Ready' : 'Setup'}</strong><span>Account</span></article>
          </section>

          <section className="saas-account-card">
            <div>
              <p className="eyebrow">SaaS account foundation</p>
              <h2><UsersRound size={21} /> Tenant and plan status</h2>
              <p>This section prepares the vault for future SaaS clients while keeping your current live vault local-first and safely encrypted.</p>
            </div>
            <div className="saas-account-grid">
              <span><strong>Account</strong>{bootstrap.accountName || bootstrap.tenantName || 'Private Vault'}</span>
              <span><strong>Plan</strong>{bootstrap.planCode || 'personal_free'}</span>
              <span><strong>Status</strong>{bootstrap.planStatus || bootstrap.accountStatus || 'active'}</span>
              <span><strong>Role</strong>{bootstrap.tenantRole || 'primary_owner'}</span>
            </div>
          </section>

          <section className="sync-panel">
            <div className="sync-title">
              <div><p className="eyebrow">Account and recovery</p><h2><Cloud size={21} /> Vault backup and restore</h2></div>
              <div className="sync-actions">
                <button type="button" className="secondary-button" onClick={checkDbHealth}><RefreshCw size={16} /> Check connection</button>
                <button type="button" className="secondary-button" disabled={snapshotHistory.loading} onClick={() => loadSnapshotHistory(true)}><Database size={16} /> Backup history</button>
                <button type="button" className="secondary-button" disabled={syncing} onClick={restoreCloudToThisDevice}><RefreshCw size={16} /> Restore backup</button>
              </div>
            </div>
            <p className={dbStatus.connected ? 'db-ok' : 'db-wait'}>{dbStatus.message}</p>
            <div className={`account-status-card ${accountStatus.state}`}>
              <div className="account-status-heading"><Phone size={18} /><strong>Account details</strong></div>
              <span>{accountStatus.message}</span>
              <small>Phone: {maskPhone(bootstrap.phoneE164 || buildPhoneE164(bootstrap.phoneCountryCode, bootstrap.phoneNumber)) || 'not set'}{bootstrap.email ? ` · Email: ${maskEmail(bootstrap.email)}` : ''}</small>
            </div>
            <div className={`sync-status-card ${syncStatus.state}`}> 
              <strong>{syncStatus.state === 'success' ? 'Cloud backup saved' : syncStatus.state === 'syncing' ? 'Backup in progress' : syncStatus.state === 'error' ? 'Backup needs attention' : syncStatus.state === 'warning' ? 'Backup warning' : 'Cloud backup status'}</strong>
              <span>{syncStatus.message}</span>
              {(syncStatus.lastSyncAt || syncStatus.snapshotCount) && <small>Last backup: {syncStatus.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleString() : 'Not backed up in this session'} · Items: {syncStatus.itemCount}</small>}
            </div>
            <div className={`device-status-card ${deviceStatus.state}`}>
              <div className="device-status-heading"><MonitorSmartphone size={18} /><strong>This device</strong></div>
              <span>{deviceStatus.label}</span>
              <small>{deviceStatus.lastCloudCheckAt ? `Last checked: ${new Date(deviceStatus.lastCloudCheckAt).toLocaleString()}` : 'Not checked yet'}{deviceStatus.lastRestoreAt ? ` · Restored: ${new Date(deviceStatus.lastRestoreAt).toLocaleString()}` : ''}</small>
            </div>
            <div className="vault-security-info-card">
              <div className="vault-security-info-heading"><ShieldCheck size={18} /><strong>Vault security and recovery</strong></div>
              <div className="security-points">
                <span>Local vault: secure copy saved on this device for fast daily unlock.</span>
                <span>Cloud backup: secure backup for restore and device sync.</span>
                <span>Phone/email: verifies your account on a new device.</span>
                <span>Master password: opens your vault and is not saved by the app.</span>
              </div>
            </div>
            <div className={`otp-foundation-card ${otpTest.status}`}>
              <div className="vault-security-info-heading"><ShieldCheck size={18} /><strong>OTP recovery method</strong></div>
              <p className="otp-guidance-note">{otpChannel === 'email' ? 'Choose how you would like to receive your one-time code. We will send a one-time code to your email.' : 'Choose how you would like to receive your one-time code. SMS verification is coming soon.'}</p>
              <div className={`otp-channel-toggle premium-toggle ${otpChannel}`} role="tablist" aria-label="Choose OTP delivery method">
                <button type="button" className={otpChannel === 'email' ? 'active' : ''} onClick={() => setOtpChannel('email')}><Mail size={15} /> Email</button>
                <button type="button" className={otpChannel === 'sms' ? 'active' : ''} onClick={() => setOtpChannel('sms')}><Phone size={15} /> SMS</button>
              </div>
              {otpTest.message && <div className={`otp-status-line ${otpTest.verified ? 'verified' : ''}`}>{otpTest.message}</div>}
              {otpTest.code && <div className="test-code-box"><span>Recovery code</span><code>{otpTest.code}</code></div>}
              <div className="otp-flow-row">
                <button type="button" className="secondary-button otp-send-button" onClick={requestSelectedOtp} disabled={otpTest.status === 'requesting' || otpChannel === 'sms'}>{otpTest.status === 'requesting' ? 'Sending...' : (otpChannel === 'email' ? 'Send email OTP' : 'SMS coming soon')}</button>
                <input inputMode="numeric" value={otpTest.input} onChange={(e) => setOtpTest({ ...otpTest, input: e.target.value })} placeholder="Enter 6-digit OTP" />
                <button type="button" className="secondary-button otp-verify-button" onClick={verifyTestOtp} disabled={otpTest.status === 'verifying'}>Verify OTP</button>
              </div>
              {otpTest.verified && <div className="otp-next-step"><ShieldCheck size={16} /><span>Account verified. Enter your master password to complete login or restore.</span><button type="button" className="mini-inline-button" onClick={focusMasterPassword}>Enter master password</button></div>}
            </div>
            <div className="snapshot-history-card">
              <div className="snapshot-history-title"><strong>Backup history</strong><span>{snapshotHistory.loading ? 'Loading...' : snapshotHistory.message}</span></div>
              {!!snapshotHistory.snapshots.length && (
                <div className="snapshot-list">
                  {snapshotHistory.snapshots.map((snap) => (
                    <div className="snapshot-row" key={snap.id}>
                      <span>{snap.item_count} item(s)</span>
                      <small>{new Date(snap.created_at).toLocaleString()}</small>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {message && <p className="message sync-message">{message}</p>}
            <form className="bootstrap-grid" onSubmit={bootstrapAdmin}>
              <label className="combined-phone-label">Mobile number
                <div className="phone-combo-field">
                  <CountryPicker countryCode={bootstrap.phoneCountryCode || '+254'} countryIso={bootstrap.phoneCountryIso || 'ke'} onChange={(country) => setBootstrap({ ...bootstrap, phoneCountryCode: country.code, phoneCountryIso: country.iso, phoneE164: buildPhoneE164(country.code, bootstrap.phoneNumber) })} />
                  <input inputMode="tel" value={bootstrap.phoneNumber || ''} onChange={(e) => setBootstrap({ ...bootstrap, phoneNumber: e.target.value, phoneE164: buildPhoneE164(bootstrap.phoneCountryCode, e.target.value) })} placeholder="712345678" />
                </div>
              </label>
              <label>Email<input type="email" value={bootstrap.email} onChange={(e) => setBootstrap({ ...bootstrap, email: e.target.value })} placeholder="you@example.com" /></label>
              <label>Display name<input value={bootstrap.displayName} onChange={(e) => setBootstrap({ ...bootstrap, displayName: e.target.value })} /></label>
              <label>Account name<input value={bootstrap.accountName || bootstrap.tenantName || ''} onChange={(e) => setBootstrap({ ...bootstrap, accountName: e.target.value, tenantName: e.target.value })} /></label>
              <label>Plan foundation<select value={bootstrap.planCode || 'personal_free'} onChange={(e) => setBootstrap({ ...bootstrap, planCode: e.target.value, planStatus: e.target.value === 'founder_private' ? 'founder_active' : 'trial_pending' })}>
                <option value="founder_private">Founder private</option>
                <option value="personal_free">Personal free</option>
                <option value="personal_trial">Personal trial</option>
                <option value="family_trial">Family trial</option>
                <option value="business_trial">Business trial</option>
              </select></label>
              <div className="button-stack">
                <button type="submit" className="primary-button" disabled={syncing}><UserRoundCheck size={18} /> Save account details</button>
                <button type="button" className="secondary-button" disabled={syncing} onClick={syncEncryptedVault}><Cloud size={18} /> {syncing ? 'Backing up...' : 'Back up vault'}</button>
              </div>
            </form>
          </section>
        </section>
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
                {viewedItem.favourite && <span className="category-pill favourite-mini"><Star size={14} fill="currentColor" /> Favourite</span>}
              </div>
              {(() => {
                const visible = !!showSecrets[viewedItem.id];
                const isNote = viewedItem.category === 'Notes';
                const isChecklist = viewedItem.category === 'Checklists';
                const isDocument = viewedItem.category === DOCUMENTS_CATEGORY;
                const storedDocument = viewedItem.payload?.file;
                const checklistRows = isChecklist ? parseChecklistNotes(viewedItem.payload?.notes) : [];
                return (
                  <>
                    {viewedItem.payload?.url && !isChecklist && !isDocument && (
                      <div className="app-field-block">
                        <span className="app-field-label">Website / Link</span>
                        <div className="app-value-field link-field">
                          <a href={viewedItem.payload.url} target="_blank" rel="noreferrer">{viewedItem.payload.url}</a>
                          <button type="button" className="field-action" onClick={() => copyText('URL', viewedItem.payload.url)} aria-label="Copy URL" title="Copy URL"><Copy size={18} /></button>
                        </div>
                      </div>
                    )}
                    {!isNote && !isChecklist && !isDocument && (
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
                    {isDocument && (
                      <div className="app-field-block">
                        <span className="app-field-label">Stored document</span>
                        <div className="document-download-card">
                          <FileText size={24} />
                          <div>
                            <strong>{storedDocument?.name || viewedItem.title}</strong>
                            <small>{storedDocument?.extension?.toUpperCase() || 'FILE'} · {formatFileSize(storedDocument?.size)} · {storedDocument?.storedExternally ? 'Encrypted file storage' : 'Vault storage'}</small>
                          </div>
                          <button type="button" className="secondary-button document-download-button" onClick={() => downloadStoredDocument(viewedItem)} disabled={downloadingDocId === viewedItem.id || (!storedDocument?.dataUrl && !storedDocument?.externalDocumentId)}><Download size={16} /> {downloadingDocId === viewedItem.id ? 'Preparing...' : 'Download'}</button>
                        </div>
                      </div>
                    )}
                    {isChecklist ? (
                      <div className="app-field-block">
                        <span className="app-field-label">Checklist</span>
                        <div className="checklist-display">
                          {checklistRows.length ? checklistRows.map((row) => (
                            <button type="button" key={`${viewedItem.id}-${row.index}-${row.text}`} className={row.done ? 'checklist-line done' : 'checklist-line'} onClick={() => toggleChecklistLine(viewedItem, row.index)}>
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
                    <p className="updated">Updated {new Date(viewedItem.updatedAt).toLocaleString()}</p>
                  </>
                );
              })()}
            </div>
            <div className="item-popup-footer view-item-footer">
              <div className="view-action-row">
                <button type="button" className="secondary-button view-action-button" onClick={() => editViewedItem(viewedItem)} aria-label="Edit item"><Pencil size={16} /> <span>Edit</span></button>
                <button type="button" className="secondary-button view-action-button" onClick={() => toggleFavourite(viewedItem.id)} aria-label={viewedItem.favourite ? 'Unfavourite item' : 'Favourite item'}><Star size={16} fill={viewedItem.favourite ? 'currentColor' : 'none'} /> <span>{viewedItem.favourite ? 'Unfavourite' : 'Favourite'}</span></button>
                <button type="button" className="secondary-button danger-soft view-action-button" onClick={() => deleteItem(viewedItem.id)} aria-label="Delete item"><Trash2 size={16} /> <span>Delete</span></button>
              </div>
              <button type="button" className="primary-button view-done-button" onClick={closeViewItem}>Done</button>
            </div>
          </article>
        </div>
      )}

      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
      <footer>{VERSION} · secure private vault</footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
