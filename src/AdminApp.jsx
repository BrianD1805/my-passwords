import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BadgePoundSterling, CalendarClock, ChevronRight, Cloud, CreditCard, Eye, EyeOff, FileText, LogOut, Plus, RefreshCw, Save, Search, ShieldCheck, Trash2, UserRoundCheck, UsersRound, X } from 'lucide-react';
import CustomSelect from './CustomSelect.jsx';
import AdminCustomerDetail from './AdminCustomerDetail.jsx';

async function requestJson(url, options = {}) {
  try {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    const data = await response.json().catch(() => ({ ok: false, message: 'The server returned an invalid response.' }));
    if (!response.ok) return { ...data, ok: false, httpStatus: response.status };
    return data;
  } catch {
    return {
      ok: false,
      offline: typeof navigator !== 'undefined' && navigator.onLine === false,
      message: typeof navigator !== 'undefined' && navigator.onLine === false
        ? 'No internet connection. Admin will be available when you are back online.'
        : 'The Admin service could not be reached. Please try again.'
    };
  }
}


const DEFAULT_PLAN_FEATURE_FLAGS = Object.freeze({
  documents: true,
  emergencyAccess: true,
  secureDeviceUnlock: true,
  cloudBackupSync: true,
  multiUser: false,
  sharing: false
});

function normaliseFeatureFlags(value = {}) {
  return { ...DEFAULT_PLAN_FEATURE_FLAGS, ...(value && typeof value === 'object' ? value : {}), multiUser: false, sharing: false };
}

function isReservedFuturePlan(code) {
  return ['family', 'business'].includes(String(code || '').trim().toLowerCase());
}


function emptyPlan() {
  return {
    code: '', displayName: '', description: '', currency: 'GBP', monthlyPrice: '0.00', quarterlyPrice: '0.00', annualPrice: '0.00',
    trialDays: 14, maxUsers: 1, storageLimitMb: 0, documentLimit: 0, features: '', featureFlags: { ...DEFAULT_PLAN_FEATURE_FLAGS }, isFeatured: false, isPublic: false, isActive: true, displayOrder: 10, stripeSyncStatus: 'not_synced', stripeSyncMessage: '', stripeSyncedAt: ''
  };
}

function toEditorPlan(plan) {
  return {
    code: plan.code || '',
    displayName: plan.display_name || '',
    description: plan.description || '',
    currency: 'GBP',
    monthlyPrice: (Number(plan.monthly_price_minor || 0) / 100).toFixed(2),
    quarterlyPrice: (Number(plan.quarterly_price_minor || 0) / 100).toFixed(2),
    annualPrice: (Number(plan.annual_price_minor || 0) / 100).toFixed(2),
    trialDays: Number(plan.trial_days || 0),
    maxUsers: Number(plan.max_users || 1),
    storageLimitMb: Number(plan.storage_limit_mb || 0),
    documentLimit: Number(plan.document_limit || 0),
    features: Array.isArray(plan.features) ? plan.features.join('\n') : '',
    featureFlags: normaliseFeatureFlags(plan.feature_flags || {}),
    isFeatured: Boolean(plan.is_featured),
    isPublic: Boolean(plan.is_public),
    isActive: plan.is_active !== false,
    displayOrder: Number(plan.display_order || 0),
    stripeSyncStatus: plan.stripe_sync_status || 'not_synced',
    stripeSyncMessage: plan.stripe_sync_message || '',
    stripeSyncedAt: plan.stripe_synced_at || ''
  };
}

function minor(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? Math.max(0, Math.round(number * 100)) : 0;
}

function money(minorValue) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(minorValue || 0) / 100);
}

function planDisplayName(planCode) {
  const code = String(planCode || '').trim().toLowerCase();
  if (code === 'founder_private' || code === 'private_founder') return 'Founder Plan';
  if (code === 'personal_free' || code === 'personal') return 'Personal';
  if (code === 'family') return 'Family';
  if (code === 'business') return 'Business';
  return code ? code.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Personal';
}


function dateLabel(value, includeTime = false) {
  if (!value) return '—';
  const options = includeTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat('en-GB', options).format(new Date(value));
}

function planStatusDisplayName(planStatus) {
  const status = String(planStatus || '').trim().toLowerCase();
  if (status === 'founder_active') return 'Founder Active';
  if (status === 'trial_pending') return 'Trial Pending';
  if (status === 'signup_pending') return 'Signup Pending';
  if (status === 'trial_active' || status === 'trialing') return 'Trial Active';
  if (status === 'active') return 'Subscription Active';
  if (status === 'trial_expired') return 'Trial Expired';
  if (status === 'trial_cancelled') return 'Trial Cancelled';
  if (status === 'cancellation_scheduled') return 'Cancellation Scheduled';
  if (status === 'payment_problem' || status === 'past_due' || status === 'unpaid') return 'Payment Needs Attention';
  if (status === 'suspended' || status === 'paused') return 'Suspended';
  if (status === 'subscription_cancelled' || status === 'cancelled') return 'Cancelled';
  return status ? status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Active';
}


function adminAuditSummary(entry) {
  const metadata = entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : {};
  const details = [];
  if (metadata.account_status) details.push(`Status: ${planStatusDisplayName(metadata.account_status)}`);
  if (metadata.previous_account_status) details.push(`Previous: ${planStatusDisplayName(metadata.previous_account_status)}`);
  if (metadata.days) details.push(`${metadata.days} day${Number(metadata.days) === 1 ? '' : 's'}`);
  if (metadata.plan_code) details.push(`Plan: ${planDisplayName(metadata.plan_code)}`);
  if (metadata.email_type) details.push(`Email: ${planStatusDisplayName(metadata.email_type)}`);
  if (metadata.stripe_sync_status) details.push(`Stripe: ${planStatusDisplayName(metadata.stripe_sync_status)}`);
  if (metadata.message) details.push(String(metadata.message));
  if (metadata.error) details.push(`Error: ${String(metadata.error)}`);
  return details.join(' · ') || 'Recorded Admin action';
}

function subscriptionLifecycleLabel(customer) {
  if (String(customer?.accountStatus || '').toLowerCase() === 'suspended') return 'Suspended';
  const subscription = customer?.subscription || {};
  const status = String(subscription.status || customer?.planStatus || '').toLowerCase();
  if (subscription.cancel_at_period_end && ['active', 'trialing'].includes(status)) return 'Cancellation Scheduled';
  if (status === 'trialing' || status === 'trial_active') return 'Trial Active';
  if (status === 'active') return subscription?.provider === 'stripe' ? 'Subscription Active' : 'Trial Active';
  if (['past_due', 'unpaid', 'incomplete'].includes(status)) return 'Payment Needs Attention';
  if (['cancelled', 'canceled', 'incomplete_expired'].includes(status)) return 'Cancelled';
  if (status === 'paused') return 'Suspended';
  return planStatusDisplayName(status);
}

export default function AdminApp({ version }) {
  const [auth, setAuth] = useState({ checking: true, authenticated: false, message: '' });
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [accessKey, setAccessKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState({ plans: [], customers: [], billingEvents: [], adminAuditEvents: [], summary: {}, stripeConfigured: false });
  const [activeTab, setActiveTab] = useState('overview');
  const [editor, setEditor] = useState(emptyPlan());
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  const [planEditorMode, setPlanEditorMode] = useState('new');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerFilters, setCustomerFilters] = useState({ plan: 'all', trial: 'all', payment: 'all', account: 'all' });
  const [planVisibility, setPlanVisibility] = useState('active');
  const [notice, setNotice] = useState('');

  const sortedPlans = useMemo(() => [...(data.plans || [])]
    .filter((plan) => String(plan?.code || '').trim() && String(plan?.display_name || '').trim())
    .sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0)), [data.plans]);
  const activePublishedPlans = useMemo(() => sortedPlans.filter((plan) => plan.is_active && plan.is_public), [sortedPlans]);
  const hiddenPlans = useMemo(() => sortedPlans.filter((plan) => !(plan.is_active && plan.is_public)), [sortedPlans]);
  const visiblePlans = planVisibility === 'active' ? activePublishedPlans : hiddenPlans;

  const customerPlanOptions = useMemo(() => {
    const namesByCode = new Map(sortedPlans.map((plan) => [String(plan.code || ''), plan.display_name]));
    for (const customer of data.customers || []) {
      if (customer.planCode && !namesByCode.has(String(customer.planCode))) namesByCode.set(String(customer.planCode), customer.planName || planDisplayName(customer.planCode));
    }
    return [{ value: 'all', label: 'All plans' }, ...[...namesByCode.entries()]
      .filter(([code]) => code)
      .sort((left, right) => String(left[1]).localeCompare(String(right[1]), undefined, { sensitivity: 'base', numeric: true }))
      .map(([value, label]) => ({ value, label }))];
  }, [sortedPlans, data.customers]);
  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLocaleLowerCase();
    const activeDeletionStatuses = new Set(['pending', 'requested', 'scheduled', 'processing']);
    return (data.customers || []).filter((customer) => {
      const owner = customer.primaryUser || customer.users?.[0] || {};
      const searchable = [customer.accountName, customer.id, owner.displayName, owner.email, owner.phone, owner.emailMasked, owner.phoneMasked, customer.planCode, customer.planName].join(' ').toLocaleLowerCase();
      if (query && !searchable.includes(query)) return false;
      if (customerFilters.plan !== 'all' && String(customer.planCode) !== customerFilters.plan) return false;
      const trialStatus = ['trial_active', 'trialing'].includes(String(customer.subscription?.status || customer.planStatus).toLowerCase())
        ? 'active'
        : ['trial_expired', 'expired'].includes(String(customer.planStatus || customer.subscription?.status).toLowerCase()) ? 'expired'
          : ['trial_pending', 'signup_pending'].includes(String(customer.planStatus).toLowerCase()) ? 'pending' : 'none';
      if (customerFilters.trial !== 'all' && trialStatus !== customerFilters.trial) return false;
      const subscriptionStatus = String(customer.subscription?.status || '').toLowerCase();
      const paymentStatus = ['past_due', 'unpaid', 'incomplete'].includes(subscriptionStatus) ? 'attention'
        : customer.subscription?.cancel_at_period_end ? 'cancelling'
          : ['cancelled', 'canceled', 'incomplete_expired'].includes(subscriptionStatus) ? 'cancelled'
            : customer.subscription?.provider === 'stripe' && ['active', 'trialing'].includes(subscriptionStatus) ? 'paid'
              : 'not_stripe';
      if (customerFilters.payment !== 'all' && paymentStatus !== customerFilters.payment) return false;
      const deletionActive = activeDeletionStatuses.has(String(customer.deletion?.status || '').toLowerCase());
      const accountStatus = String(customer.accountStatus || 'active').toLowerCase();
      if (customerFilters.account === 'pending_verification' && customer.verification?.status === 'verified') return false;
      if (customerFilters.account === 'deletion' && !deletionActive) return false;
      if (!['all', 'pending_verification', 'deletion'].includes(customerFilters.account) && accountStatus !== customerFilters.account) return false;
      return true;
    }).sort((left, right) => String(left.accountName || '').localeCompare(String(right.accountName || ''), undefined, { sensitivity: 'base', numeric: true }));
  }, [data.customers, customerSearch, customerFilters]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      checkAuth();
    };
    const handleOffline = () => setIsOnline(false);
    checkAuth();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!planEditorOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !busy) setPlanEditorOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [planEditorOpen, busy]);

  async function checkAuth() {
    const result = await requestJson('/.netlify/functions/admin-auth');
    const authenticated = Boolean(result.authenticated);
    setAuth({ checking: false, authenticated, message: result.message || '' });
    if (authenticated) await loadData();
  }

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    const result = await requestJson('/.netlify/functions/admin-auth', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'login', accessKey })
    });
    setBusy(false);
    if (!result.ok || !result.authenticated) {
      setNotice(result.message || 'Admin sign-in failed.');
      return;
    }
    setAccessKey('');
    setAuth({ checking: false, authenticated: true, message: result.message || 'Admin access confirmed.' });
    await loadData();
  }

  async function logout() {
    await requestJson('/.netlify/functions/admin-auth', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'logout' })
    });
    setAuth({ checking: false, authenticated: false, message: 'Admin session ended.' });
    setData({ plans: [], customers: [], billingEvents: [], adminAuditEvents: [], summary: {}, stripeConfigured: false });
    setSelectedCustomerId('');
  }

  async function loadData() {
    setBusy(true);
    const result = await requestJson('/.netlify/functions/admin-data');
    setBusy(false);
    if (!result.ok) {
      if (result.httpStatus === 401) setAuth({ checking: false, authenticated: false, message: result.message || 'Admin sign-in is required.' });
      setNotice(result.message || 'Could not load admin data.');
      return;
    }
    const customers = result.customers || [];
    setData({ plans: result.plans || [], customers, billingEvents: result.billingEvents || [], adminAuditEvents: result.adminAuditEvents || [], summary: result.summary || {}, stripeConfigured: Boolean(result.stripeConfigured) });
    setNotice('');
  }

  function editPlan(plan) {
    setEditor(toEditorPlan(plan));
    setPlanEditorMode('edit');
    setPlanEditorOpen(true);
  }

  function addPlan() {
    setEditor(emptyPlan());
    setPlanEditorMode('new');
    setPlanEditorOpen(true);
  }

  function closePlanEditor() {
    if (busy) return;
    setPlanEditorOpen(false);
  }

  async function savePlan(event) {
    event.preventDefault();
    setBusy(true);
    setNotice('Saving subscription plan...');
    const result = await requestJson('/.netlify/functions/admin-data', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        action: 'save_plan',
        plan: {
          code: editor.code,
          displayName: editor.displayName,
          description: editor.description,
          currency: 'GBP',
          monthlyPriceMinor: minor(editor.monthlyPrice),
          quarterlyPriceMinor: minor(editor.quarterlyPrice),
          annualPriceMinor: minor(editor.annualPrice),
          trialDays: Number(editor.trialDays || 0),
          maxUsers: Number(editor.maxUsers || 1),
          storageLimitMb: Number(editor.storageLimitMb || 0),
          documentLimit: Number(editor.documentLimit || 0),
          features: editor.features,
          featureFlags: normaliseFeatureFlags(editor.featureFlags),
          isFeatured: editor.isFeatured,
          isPublic: editor.isPublic,
          isActive: editor.isActive,
          displayOrder: Number(editor.displayOrder || 0)
        }
      })
    });
    setBusy(false);
    if (!result.ok) {
      setNotice(result.message || 'Plan could not be saved.');
      return;
    }
    setNotice(result.message || 'Subscription plan saved.');
    setEditor(result.plan ? toEditorPlan(result.plan) : emptyPlan());
    setPlanEditorOpen(false);
    await loadData();
  }

  async function syncPlanToStripe(planCode = editor.code) {
    if (!planCode) return;
    setBusy(true);
    setNotice('Syncing plan to Stripe Billing...');
    const result = await requestJson('/.netlify/functions/admin-data', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'sync_stripe_plan', planCode })
    });
    setBusy(false);
    setNotice(result.message || (result.ok ? 'Stripe Billing sync complete.' : 'Stripe Billing sync failed.'));
    if (result.plan) setEditor(toEditorPlan(result.plan));
    await loadData();
  }

  async function deletePlan() {
    if (!editor.code) return;
    const confirmed = window.confirm(`Delete the ${editor.displayName || editor.code} plan? This is only allowed when no customer account or subscription uses it.`);
    if (!confirmed) return;
    setBusy(true);
    setNotice('Deleting subscription plan...');
    const result = await requestJson('/.netlify/functions/admin-data', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete_plan', planCode: editor.code })
    });
    setBusy(false);
    setNotice(result.message || (result.ok ? 'Subscription plan deleted.' : 'Plan could not be deleted.'));
    if (result.ok) {
      setPlanEditorOpen(false);
      setEditor(emptyPlan());
      await loadData();
    }
  }

  if (!isOnline) {
    return (
      <main className="admin-shell admin-centred">
        <section className="admin-login-card admin-offline-card">
          <div className="admin-mark"><img className="admin-brand-image" src="/images/password-encrypt-brand.png" alt="" /></div>
          <p className="eyebrow">My Passwords Admin</p>
          <h1>No internet connection</h1>
          <p>Admin needs an internet connection to load plans, customers, billing and sync information. Reconnect, then try again.</p>
          <button type="button" className="primary-button" onClick={() => window.location.reload()}><RefreshCw size={18} /> Try again</button>
          <a className="admin-back-link" href="/vault">Return to My Vault</a>
          <small>{version}</small>
        </section>
      </main>
    );
  }

  if (auth.checking) {
    return <main className="admin-shell admin-centred"><section className="admin-login-card"><RefreshCw className="spin-icon" /><h1>Checking admin access</h1><p>{version}</p></section></main>;
  }

  if (!auth.authenticated) {
    return (
      <main className="admin-shell admin-centred">
        <section className="admin-login-card">
          <div className="admin-mark"><img className="admin-brand-image" src="/images/password-encrypt-brand.png" alt="My Passwords" /></div>
          <p className="eyebrow">My Passwords Admin</p>
          <h1>Owner administration</h1>
          <p>Manage SaaS plans and customer account status inside the same My Passwords Netlify site.</p>
          <form onSubmit={login}>
            <label>Admin access key
              <div className="admin-secret-field"><input type={showKey ? 'text' : 'password'} value={accessKey} onChange={(event) => setAccessKey(event.target.value)} autoComplete="current-password" required /><button type="button" onClick={() => setShowKey((current) => !current)} aria-label={showKey ? 'Hide admin key' : 'Show admin key'}>{showKey ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            </label>
            <button className="primary-button" type="submit" disabled={busy}><ShieldCheck size={18} /> {busy ? 'Signing in...' : 'Open Admin'}</button>
          </form>
          {notice && <div className="admin-notice error">{notice}</div>}
          <a className="admin-back-link" href="/">Return to My Passwords</a>
          <small>{version}</small>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="admin-header-brand"><img className="admin-header-brand-image" src="/images/password-encrypt-brand.png" alt="" /><div><p className="eyebrow">My Passwords</p><h1>Admin</h1><span>Single-site SaaS administration</span></div></div>
        <div className="admin-header-actions"><button type="button" className="secondary-button" onClick={loadData} disabled={busy}><RefreshCw size={17} className={busy ? 'spin-icon' : ''} /> Refresh</button><button type="button" className="secondary-button" onClick={logout}><LogOut size={17} /> Logout</button></div>
      </header>

      <nav className="admin-tabs">
        <button type="button" className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>Overview</button>
        <button type="button" className={activeTab === 'plans' ? 'active' : ''} onClick={() => setActiveTab('plans')}>Subscription Plans</button>
        <button type="button" className={activeTab === 'customers' ? 'active' : ''} onClick={() => setActiveTab('customers')}>Customers</button>
        <button type="button" className={activeTab === 'billing' ? 'active' : ''} onClick={() => setActiveTab('billing')}>Billing Events</button>
        <button type="button" className={activeTab === 'sync' ? 'active' : ''} onClick={() => setActiveTab('sync')}>Sync Health</button>
        <button type="button" className={activeTab === 'audit' ? 'active' : ''} onClick={() => setActiveTab('audit')}>Admin Audit</button>
      </nav>

      {notice && <div className="admin-notice">{notice}</div>}

      {activeTab === 'overview' && (
        <section className="admin-content">
          <div className="admin-stat-grid">
            <article><UsersRound /><strong>{data.summary?.tenants || 0}</strong><span>Total accounts</span></article>
            <article><UserRoundCheck /><strong>{data.summary?.activeAccounts || 0}</strong><span>Active accounts</span></article>
            <article><ShieldCheck /><strong>{data.summary?.trials || 0}</strong><span>Active trials</span></article><article><CalendarClock /><strong>{data.summary?.pendingSignups || 0}</strong><span>Pending signups</span></article><article><AlertTriangle /><strong>{data.summary?.expiredTrials || 0}</strong><span>Expired trials</span></article>
            <article><BadgePoundSterling /><strong>{data.summary?.publishedPlans || 0}</strong><span>Published plans</span></article>
            <article><CreditCard /><strong>{data.summary?.paidSubscriptions || 0}</strong><span>Paid subscriptions</span></article>
            <article><AlertTriangle /><strong>{data.summary?.paymentProblems || 0}</strong><span>Payment problems</span></article>
            <article><AlertTriangle /><strong>{data.summary?.syncIssues || 0}</strong><span>Sync issues</span></article>
            <article><FileText /><strong>{data.summary?.adminActions || 0}</strong><span>Recent Admin actions</span></article>
          </div>
        </section>
      )}

      {activeTab === 'plans' && (
        <section className="admin-content">
          <section className="admin-panel">
            <div className="admin-panel-heading admin-plan-directory-heading">
              <div><p className="eyebrow">Subscription Plans</p><h2>Sellable plans</h2></div>
              <div className="admin-plan-directory-actions">
                <div className="admin-plan-filter" role="group" aria-label="Filter subscription plans">
                  <button type="button" className={planVisibility === 'active' ? 'active' : ''} onClick={() => setPlanVisibility('active')}>Active <span>{activePublishedPlans.length}</span></button>
                  <button type="button" className={planVisibility === 'hidden' ? 'active' : ''} onClick={() => setPlanVisibility('hidden')}>Hidden <span>{hiddenPlans.length}</span></button>
                </div>
                <button type="button" className="primary-button" onClick={addPlan}><Plus size={18} /> Add plan</button>
              </div>
            </div>
            <div className="admin-plan-list admin-plan-directory">
              {visiblePlans.map((plan) => (
                <button type="button" className="admin-plan-card" key={plan.id || plan.code} onClick={() => editPlan(plan)} aria-label={`Open ${plan.display_name} plan`}>
                  <div><strong>{plan.display_name}</strong><code>{plan.code}</code></div>
                  <p>{plan.description}</p>
                  <div className="admin-plan-prices"><span><small>Monthly</small>{money(plan.monthly_price_minor)}</span><span><small>Quarterly</small>{money(plan.quarterly_price_minor)}</span><span><small>Annual</small>{money(plan.annual_price_minor)}</span></div>
                  <footer><span>{plan.trial_days || 0} trial days</span><span>{plan.is_public ? 'Published' : 'Hidden'}</span><span>{plan.is_active ? 'Active' : 'Inactive'}</span><span className={`stripe-plan-state ${plan.stripe_sync_status || 'not_synced'}`}>Stripe: {(plan.stripe_sync_status || 'not synced').replace(/_/g, ' ')}</span></footer>
                </button>
              ))}
              {!visiblePlans.length && <div className="admin-empty">{planVisibility === 'active' ? 'No active published plans are available.' : 'No hidden, unpublished or inactive plans are available.'}</div>}
            </div>
          </section>
        </section>
      )}

      {activeTab === 'customers' && (selectedCustomerId ? (
        <AdminCustomerDetail
          customerId={selectedCustomerId}
          onBack={() => setSelectedCustomerId('')}
          onChanged={loadData}
          onSessionExpired={(message) => { setAuth({ checking: false, authenticated: false, message: message || 'Admin sign-in is required.' }); setSelectedCustomerId(''); }}
          setGlobalNotice={setNotice}
        />
      ) : (
        <section className="admin-content">
          <section className="admin-panel">
            <div className="admin-panel-heading"><div><p className="eyebrow">Accounts</p><h2>Customers</h2></div><span>{filteredCustomers.length} of {data.customers?.length || 0} accounts</span></div>
            <div className="admin-customer-filters">
              <label className="admin-customer-search"><Search size={18} /><input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} placeholder="Search name, email, phone or account ID" /></label>
              <CustomSelect className="admin-custom-select" value={customerFilters.plan} ariaLabel="Filter customers by plan" options={customerPlanOptions} onChange={(value) => setCustomerFilters((current) => ({ ...current, plan: value }))} />
              <CustomSelect className="admin-custom-select" value={customerFilters.trial} ariaLabel="Filter customers by trial status" options={[{ value: 'all', label: 'All trial statuses' }, { value: 'active', label: 'Active trial' }, { value: 'pending', label: 'Trial pending' }, { value: 'expired', label: 'Trial expired' }, { value: 'none', label: 'No trial' }]} onChange={(value) => setCustomerFilters((current) => ({ ...current, trial: value }))} />
              <CustomSelect className="admin-custom-select" value={customerFilters.payment} ariaLabel="Filter customers by payment status" options={[{ value: 'all', label: 'All payment statuses' }, { value: 'paid', label: 'Stripe active' }, { value: 'attention', label: 'Payment attention' }, { value: 'cancelling', label: 'Cancellation scheduled' }, { value: 'cancelled', label: 'Stripe cancelled' }, { value: 'not_stripe', label: 'No Stripe subscription' }]} onChange={(value) => setCustomerFilters((current) => ({ ...current, payment: value }))} />
              <CustomSelect className="admin-custom-select" value={customerFilters.account} ariaLabel="Filter customers by account status" options={[{ value: 'all', label: 'All account statuses' }, { value: 'active', label: 'Active' }, { value: 'pending_verification', label: 'Pending verification' }, { value: 'suspended', label: 'Suspended' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'deleted', label: 'Deleted' }, { value: 'deletion', label: 'Deletion requested' }]} onChange={(value) => setCustomerFilters((current) => ({ ...current, account: value }))} />
              <button type="button" className="secondary-button" onClick={() => { setCustomerSearch(''); setCustomerFilters({ plan: 'all', trial: 'all', payment: 'all', account: 'all' }); }}>Clear filters</button>
            </div>
            <div className="admin-customer-directory">
              {filteredCustomers.map((customer) => {
                const owner = customer.primaryUser || customer.users?.[0] || {};
                const paymentStatus = ['past_due', 'unpaid', 'incomplete'].includes(String(customer.subscription?.status || '').toLowerCase()) ? 'Payment attention' : customer.subscription?.provider === 'stripe' ? subscriptionLifecycleLabel(customer) : 'No Stripe subscription';
                return (
                  <button type="button" className="admin-customer-directory-card" key={customer.id} onClick={() => setSelectedCustomerId(customer.id)}>
                    <span className="admin-customer-main">
                      <strong>{customer.accountName}</strong>
                      <span>{owner.displayName || 'Owner'} · {owner.email || owner.emailMasked || 'No email'} · {owner.phone || owner.phoneMasked || 'No mobile'}</span>
                      <small>{customer.id}</small>
                    </span>
                    <span className="admin-customer-directory-plan"><small>Plan</small><strong>{customer.planName || planDisplayName(customer.planCode)}</strong><em>{paymentStatus}</em></span>
                    <span className="admin-customer-directory-health"><small>Last sign-in</small><strong>{dateLabel(customer.lastSignInAt, true)}</strong><em>Backup {dateLabel(customer.lastSuccessfulBackupAt, true)}</em></span>
                    <span className="admin-customer-directory-status"><span className={`admin-status ${customer.accountStatus}`}>{planStatusDisplayName(customer.accountStatus)}</span><span className={`admin-status ${customer.verification?.status === 'verified' ? 'success' : 'warning'}`}>{customer.verification?.status === 'verified' ? 'Verified' : 'Verify'}</span></span>
                    <ChevronRight size={22} />
                  </button>
                );
              })}
              {!filteredCustomers.length && <div className="admin-empty">No customer accounts match the selected search and filters.</div>}
            </div>
          </section>
        </section>
      ))}


      {activeTab === 'billing' && (
        <section className="admin-content">
          <section className="admin-panel">
            <div className="admin-panel-heading"><div><p className="eyebrow">Stripe Billing</p><h2>Billing events</h2></div><span>{data.billingEvents?.length || 0} recent events</span></div>
            <p className="admin-panel-intro">Verified Stripe webhooks update subscriptions, renewals, failed payments and cancellations. No card details are stored in My Passwords.</p>
            <div className="admin-billing-event-list">
              {(data.billingEvents || []).map((event) => <article className={`admin-billing-event ${event.status || 'recorded'}`} key={event.id}><div className="admin-sync-icon"><CreditCard size={20} /></div><div><strong>{String(event.event_type || 'billing event').replace(/_/g, ' ')}</strong><span>{event.tenant_id || 'Unmatched account'}{event.amount_minor ? ` · ${money(event.amount_minor)}` : ''}</span><small>{dateLabel(event.occurred_at || event.created_at, true)} · {event.provider || 'internal'} · {event.status || 'recorded'}</small></div></article>)}
              {!data.billingEvents?.length && <div className="admin-empty">No billing events have been recorded yet.</div>}
            </div>
          </section>
        </section>
      )}

      {activeTab === 'sync' && (
        <section className="admin-content">
          <section className="admin-panel">
            <div className="admin-panel-heading"><div><p className="eyebrow">Vault operations</p><h2>Sync health</h2></div><span>Encrypted metadata only</span></div>
            <p className="admin-panel-intro">Admin can see backup dates, item counts and operational errors. Vault contents and master passwords remain unreadable.</p>
            <div className="admin-sync-list">
              {(data.customers || []).map((customer) => {
                const diagnostic = customer.syncDiagnostics || {};
                const snapshot = diagnostic.latestSnapshot || null;
                const event = diagnostic.latestEvent || null;
                const eventStatus = String(event?.status || (snapshot ? 'success' : 'warning')).toLowerCase();
                return (
                  <article className={`admin-sync-card ${eventStatus}`} key={`sync-${customer.id}`}>
                    <div className="admin-sync-icon">{eventStatus === 'success' ? <Cloud size={21} /> : <AlertTriangle size={21} />}</div>
                    <div className="admin-sync-main">
                      <strong>{customer.accountName}</strong>
                      <span>{event?.message || (snapshot ? 'Latest encrypted backup is available.' : 'No encrypted backup has been recorded yet.')}</span>
                      <small>{snapshot ? `Last backup ${new Date(snapshot.created_at).toLocaleString()} · ${snapshot.item_count || 0} item(s)` : 'No backup date'}{event?.created_at ? ` · Last event ${new Date(event.created_at).toLocaleString()}` : ''}</small>
                    </div>
                    <div className="admin-sync-meta"><span className={`admin-status ${eventStatus}`}>{eventStatus}</span><small>{diagnostic.eventCount || 0} event(s)</small></div>
                  </article>
                );
              })}
              {!data.customers?.length && <div className="admin-empty">No customer sync diagnostics were returned.</div>}
            </div>
          </section>
        </section>
      )}


      {activeTab === 'audit' && (
        <section className="admin-content">
          <section className="admin-panel">
            <div className="admin-panel-heading"><div><p className="eyebrow">Security and accountability</p><h2>Admin audit log</h2></div><span>{data.adminAuditEvents?.length || 0} recent action(s)</span></div>
            <p className="admin-panel-intro">Customer changes, plan operations, Stripe refreshes, account emails, notes, customer-detail views and Admin sign-in events are recorded here.</p>
            <div className="admin-audit-list">
              {(data.adminAuditEvents || []).map((entry) => (
                <article key={entry.id}>
                  <FileText size={18} />
                  <div><strong>{planStatusDisplayName(entry.action)}</strong><span>{entry.accountName || entry.tenant_id || 'Platform Admin'} · {adminAuditSummary(entry)}</span><small>{dateLabel(entry.created_at, true)}{entry.tenant_id ? ` · ${entry.tenant_id}` : ''}</small></div>
                  {entry.tenant_id && <button type="button" className="admin-audit-open-customer" onClick={() => { setSelectedCustomerId(entry.tenant_id); setActiveTab('customers'); }} aria-label={`Open ${entry.accountName || 'customer'} details`}><ChevronRight size={18} /></button>}
                </article>
              ))}
              {!data.adminAuditEvents?.length && <div className="admin-empty">No Admin actions have been recorded yet.</div>}
            </div>
          </section>
        </section>
      )}

      {planEditorOpen && (
        <div className="admin-modal-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePlanEditor(); }}>
          <section className="admin-plan-window" role="dialog" aria-modal="true" aria-labelledby="admin-plan-window-title">
            <header className="admin-plan-window-header">
              <div><p className="eyebrow">Subscription Plan</p><h2 id="admin-plan-window-title">{planEditorMode === 'edit' ? `Edit ${editor.displayName || editor.code}` : 'Add new plan'}</h2></div>
              <button type="button" className="admin-window-close" onClick={closePlanEditor} aria-label="Close plan window"><X size={22} /></button>
            </header>
            <form className="admin-plan-window-form" onSubmit={savePlan}>
              <div className="admin-plan-window-body">
                <div className="admin-form-grid">
                  <label>Plan code<input value={editor.code} onChange={(e) => setEditor({ ...editor, code: e.target.value })} placeholder="personal" required disabled={planEditorMode === 'edit'} /></label>
                  <label>Display name<input value={editor.displayName} onChange={(e) => setEditor({ ...editor, displayName: e.target.value })} placeholder="Personal" required /></label>
                  <label className="admin-full">Description<textarea value={editor.description} onChange={(e) => setEditor({ ...editor, description: e.target.value })} /></label>
                  <label>Currency<input value="GBP (£)" disabled aria-label="Global currency GBP" /></label>
                  <label>Trial days<input type="number" min="0" value={editor.trialDays} onChange={(e) => setEditor({ ...editor, trialDays: e.target.value })} /></label>
                  <label>Monthly price<input type="number" min="0" step="0.01" value={editor.monthlyPrice} onChange={(e) => setEditor({ ...editor, monthlyPrice: e.target.value })} /></label>
                  <label>Quarterly price<input type="number" min="0" step="0.01" value={editor.quarterlyPrice} onChange={(e) => setEditor({ ...editor, quarterlyPrice: e.target.value })} /></label>
                  <label>Annual price<input type="number" min="0" step="0.01" value={editor.annualPrice} onChange={(e) => setEditor({ ...editor, annualPrice: e.target.value })} /></label>
                  <label>Maximum users<input type="number" min="1" value={editor.maxUsers} onChange={(e) => setEditor({ ...editor, maxUsers: e.target.value })} /></label>
                  <label>Storage limit MB<input type="number" min="0" value={editor.storageLimitMb} onChange={(e) => setEditor({ ...editor, storageLimitMb: e.target.value })} /></label>
                  <label>Document limit<input type="number" min="0" value={editor.documentLimit} onChange={(e) => setEditor({ ...editor, documentLimit: e.target.value })} /></label>
                  <label>Display order<input type="number" min="0" value={editor.displayOrder} onChange={(e) => setEditor({ ...editor, displayOrder: e.target.value })} /></label>
                  <label className="admin-full">Customer-facing features, one per line<textarea rows="6" value={editor.features} onChange={(e) => setEditor({ ...editor, features: e.target.value })} /></label>
                </div>
                <fieldset className="admin-feature-flags"><legend>Enforced plan features</legend>
                  <label><input type="checkbox" checked={editor.featureFlags.documents} onChange={(e) => setEditor({ ...editor, featureFlags: { ...editor.featureFlags, documents: e.target.checked } })} /> Encrypted documents</label>
                  <label><input type="checkbox" checked={editor.featureFlags.emergencyAccess} onChange={(e) => setEditor({ ...editor, featureFlags: { ...editor.featureFlags, emergencyAccess: e.target.checked } })} /> Emergency Access</label>
                  <label><input type="checkbox" checked={editor.featureFlags.secureDeviceUnlock} onChange={(e) => setEditor({ ...editor, featureFlags: { ...editor.featureFlags, secureDeviceUnlock: e.target.checked } })} /> Secure device unlock</label>
                  <label><input type="checkbox" checked={editor.featureFlags.cloudBackupSync} onChange={(e) => setEditor({ ...editor, featureFlags: { ...editor.featureFlags, cloudBackupSync: e.target.checked } })} /> Cloud backup and sync</label>
                  <label className="not-ready"><input type="checkbox" checked={false} disabled /> Household/team users — not built</label>
                  <label className="not-ready"><input type="checkbox" checked={false} disabled /> Sharing — not built</label>
                </fieldset>
                {isReservedFuturePlan(editor.code) && <div className="admin-plan-readiness"><AlertTriangle size={18} /><span><strong>{editor.displayName || planDisplayName(editor.code)} remains hidden</strong><small>Family and Business cannot be published until member accounts and sharing have been built and tested.</small></span></div>}
                <div className="admin-toggle-grid"><label><input type="checkbox" checked={editor.isActive} onChange={(e) => setEditor({ ...editor, isActive: e.target.checked })} /> Active</label><label><input type="checkbox" checked={isReservedFuturePlan(editor.code) ? false : editor.isPublic} onChange={(e) => setEditor({ ...editor, isPublic: e.target.checked })} disabled={isReservedFuturePlan(editor.code)} /> Publish on website</label><label><input type="checkbox" checked={isReservedFuturePlan(editor.code) ? false : editor.isFeatured} onChange={(e) => setEditor({ ...editor, isFeatured: e.target.checked })} disabled={isReservedFuturePlan(editor.code)} /> Featured plan</label></div>
                <div className={`admin-stripe-status ${editor.stripeSyncStatus || 'not_synced'}`}><CreditCard size={18} /><span><strong>Stripe Billing: {data.stripeConfigured ? (editor.stripeSyncStatus || 'Not synced').replace(/_/g, ' ') : 'Not configured'}</strong><small>{editor.stripeSyncMessage || (data.stripeConfigured ? 'Save the plan to create or update its Stripe Product and recurring Prices.' : 'Add STRIPE_SECRET_KEY to the existing My Passwords Netlify site.')}</small></span></div>
              </div>
              <footer className="admin-plan-window-footer">
                <div>{planEditorMode === 'edit' && <button type="button" className="secondary-button danger-soft" onClick={deletePlan} disabled={busy}><Trash2 size={17} /> Delete plan</button>}</div>
                <div className="admin-plan-window-actions">
                  <button type="button" className="secondary-button" onClick={closePlanEditor} disabled={busy}>Cancel</button>
                  {planEditorMode === 'edit' && <button type="button" className="secondary-button" onClick={() => syncPlanToStripe(editor.code)} disabled={busy}><RefreshCw size={17} /> Sync Stripe</button>}
                  <button type="submit" className="primary-button" disabled={busy}><Save size={18} /> {busy ? 'Saving...' : 'Save and sync plan'}</button>
                </div>
              </footer>
            </form>
          </section>
        </div>
      )}

      <footer className="admin-footer">{version} · one-site admin foundation</footer>
    </main>
  );
}
