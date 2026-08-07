import { createHmac, timingSafeEqual } from 'node:crypto';
import { updateRow } from './_db.js';

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const WEBHOOK_TOLERANCE_SECONDS = 300;

export function stripeConfigured() {
  return Boolean(String(process.env.STRIPE_SECRET_KEY || '').trim());
}

export function stripeWebhookConfigured() {
  return Boolean(String(process.env.STRIPE_WEBHOOK_SECRET || '').trim());
}

export function stripeAutomaticTaxEnabled() {
  return /^(1|true|yes|on)$/i.test(String(process.env.STRIPE_AUTOMATIC_TAX || '').trim());
}

function appendFormValue(params, key, value) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => appendFormValue(params, `${key}[${index}]`, item));
    return;
  }
  if (typeof value === 'object' && !(value instanceof Date)) {
    Object.entries(value).forEach(([childKey, childValue]) => appendFormValue(params, key ? `${key}[${childKey}]` : childKey, childValue));
    return;
  }
  params.append(key, value instanceof Date ? value.toISOString() : String(value));
}

function toFormData(values = {}) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => appendFormValue(params, key, value));
  return params;
}

export async function stripeRequest(path, { method = 'POST', params = {}, idempotencyKey = '' } = {}) {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secretKey) {
    const error = new Error('Stripe Billing is not configured yet.');
    error.code = 'STRIPE_NOT_CONFIGURED';
    throw error;
  }

  const isGet = method.toUpperCase() === 'GET';
  const form = toFormData(params);
  const url = `${STRIPE_API_BASE}/${String(path || '').replace(/^\/+/, '')}${isGet && String(form) ? `?${form}` : ''}`;
  const headers = {
    authorization: `Bearer ${secretKey}`,
    accept: 'application/json'
  };
  if (!isGet) headers['content-type'] = 'application/x-www-form-urlencoded';
  if (idempotencyKey) headers['idempotency-key'] = String(idempotencyKey).slice(0, 255);

  const response = await fetch(url, {
    method: method.toUpperCase(),
    headers,
    body: isGet ? undefined : form.toString()
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || `Stripe request failed with HTTP ${response.status}.`);
    error.code = data?.error?.code || 'STRIPE_REQUEST_FAILED';
    error.type = data?.error?.type || '';
    error.status = response.status;
    error.details = data?.error || data;
    throw error;
  }
  return data;
}

export function publicSiteUrl(event) {
  const configured = String(process.env.URL || process.env.DEPLOY_PRIME_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  const host = event?.headers?.host || event?.headers?.Host || 'localhost:8888';
  const forwarded = event?.headers?.['x-forwarded-proto'] || event?.headers?.['X-Forwarded-Proto'];
  const protocol = forwarded || (String(host).includes('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

export function billingIntervalDefinition(interval) {
  const value = String(interval || '').trim().toLowerCase();
  if (value === 'monthly') return { key: 'monthly', amountColumn: 'monthly_price_minor', priceColumn: 'stripe_monthly_price_id', stripeInterval: 'month', intervalCount: 1, label: 'Monthly' };
  if (value === 'quarterly') return { key: 'quarterly', amountColumn: 'quarterly_price_minor', priceColumn: 'stripe_quarterly_price_id', stripeInterval: 'month', intervalCount: 3, label: 'Quarterly' };
  if (value === 'annual' || value === 'yearly') return { key: 'annual', amountColumn: 'annual_price_minor', priceColumn: 'stripe_annual_price_id', stripeInterval: 'year', intervalCount: 1, label: 'Annual' };
  return null;
}

function sameStripePrice(price, plan, definition) {
  return Boolean(price?.id)
    && price.active !== false
    && String(price.currency || '').toLowerCase() === String(plan.currency || 'GBP').toLowerCase()
    && Number(price.unit_amount || 0) === Number(plan[definition.amountColumn] || 0)
    && String(price.recurring?.interval || '') === definition.stripeInterval
    && Number(price.recurring?.interval_count || 1) === definition.intervalCount;
}

async function ensureStripeProduct(plan) {
  let product = null;
  if (plan.stripe_product_id) {
    product = await stripeRequest(`products/${encodeURIComponent(plan.stripe_product_id)}`, { method: 'GET' }).catch(() => null);
  }
  const values = {
    name: plan.display_name,
    description: plan.description || undefined,
    active: plan.is_active !== false,
    metadata: {
      my_passwords_plan_code: plan.code,
      my_passwords_plan_id: plan.id
    }
  };
  if (product?.id) return stripeRequest(`products/${encodeURIComponent(product.id)}`, { params: values });
  return stripeRequest('products', { params: values, idempotencyKey: `mp-product-${plan.id}` });
}

async function ensureStripePrice(plan, productId, definition) {
  const amount = Number(plan[definition.amountColumn] || 0);
  const existingId = String(plan[definition.priceColumn] || '').trim();
  if (amount <= 0) {
    if (existingId) await stripeRequest(`prices/${encodeURIComponent(existingId)}`, { params: { active: false } }).catch(() => null);
    return '';
  }

  const existing = existingId
    ? await stripeRequest(`prices/${encodeURIComponent(existingId)}`, { method: 'GET' }).catch(() => null)
    : null;
  if (sameStripePrice(existing, plan, definition)) return existing.id;

  const price = await stripeRequest('prices', {
    idempotencyKey: `mp-price-${plan.id}-${definition.key}-${amount}-${String(plan.currency || 'GBP').toLowerCase()}-${String(plan.updated_at || plan.stripe_synced_at || Date.now()).replace(/[^0-9A-Za-z_-]/g, '').slice(-48)}`,
    params: {
      product: productId,
      currency: String(plan.currency || 'GBP').toLowerCase(),
      unit_amount: amount,
      recurring: {
        interval: definition.stripeInterval,
        interval_count: definition.intervalCount
      },
      nickname: `${plan.display_name} ${definition.label}`,
      metadata: {
        my_passwords_plan_code: plan.code,
        my_passwords_billing_interval: definition.key,
        my_passwords_amount_minor: String(amount)
      }
    }
  });
  if (existing?.id && existing.id !== price.id) {
    await stripeRequest(`prices/${encodeURIComponent(existing.id)}`, { params: { active: false } }).catch(() => null);
  }
  return price.id;
}

export async function archiveStripePlan(plan) {
  if (!plan) return { ok: true, configured: stripeConfigured(), message: 'Plan has no Stripe objects to archive.' };
  const ids = [plan.stripe_monthly_price_id, plan.stripe_quarterly_price_id, plan.stripe_annual_price_id].filter(Boolean);
  const hasStripeObjects = Boolean(plan.stripe_product_id || ids.length);
  if (!hasStripeObjects) return { ok: true, configured: stripeConfigured(), message: 'Plan deleted. No Stripe objects required archiving.' };
  if (!stripeConfigured()) return { ok: false, configured: false, message: 'Stripe Billing must be configured before a synced plan can be deleted safely.' };
  for (const priceId of ids) {
    await stripeRequest(`prices/${encodeURIComponent(priceId)}`, { params: { active: false } });
  }
  if (plan.stripe_product_id) {
    await stripeRequest(`products/${encodeURIComponent(plan.stripe_product_id)}`, { params: { active: false } });
  }
  return { ok: true, configured: true, message: 'Stripe Product and Prices were archived.' };
}

export async function syncStripePlan(plan) {
  if (!stripeConfigured()) {
    const updated = await updateRow('subscription_plans', `id=eq.${encodeURIComponent(plan.id)}`, {
      stripe_sync_status: 'not_configured',
      stripe_sync_message: 'Add STRIPE_SECRET_KEY in Netlify to sync this plan.',
      updated_at: new Date().toISOString()
    }).catch(() => null);
    return { ok: false, configured: false, plan: updated || plan, message: 'Plan saved. Stripe Billing is not configured yet.' };
  }

  try {
    const product = await ensureStripeProduct(plan);
    const monthly = await ensureStripePrice(plan, product.id, billingIntervalDefinition('monthly'));
    const quarterly = await ensureStripePrice(plan, product.id, billingIntervalDefinition('quarterly'));
    const annual = await ensureStripePrice(plan, product.id, billingIntervalDefinition('annual'));
    const hasAnyPrice = Boolean(monthly || quarterly || annual);
    const now = new Date().toISOString();
    const updated = await updateRow('subscription_plans', `id=eq.${encodeURIComponent(plan.id)}`, {
      stripe_product_id: product.id,
      stripe_monthly_price_id: monthly || null,
      stripe_quarterly_price_id: quarterly || null,
      stripe_annual_price_id: annual || null,
      stripe_sync_status: hasAnyPrice ? 'ready' : 'prices_required',
      stripe_sync_message: hasAnyPrice ? 'Stripe Product and recurring Prices are ready.' : 'Add at least one price greater than £0.00.',
      stripe_synced_at: now,
      updated_at: now
    });
    return { ok: hasAnyPrice, configured: true, plan: updated, productId: product.id, message: hasAnyPrice ? 'Plan saved and synced to Stripe Billing.' : 'Plan saved. Add a paid price before checkout can be used.' };
  } catch (error) {
    const now = new Date().toISOString();
    const updated = await updateRow('subscription_plans', `id=eq.${encodeURIComponent(plan.id)}`, {
      stripe_sync_status: 'error',
      stripe_sync_message: String(error.message || 'Stripe sync failed.').slice(0, 500),
      stripe_synced_at: now,
      updated_at: now
    }).catch(() => null);
    return { ok: false, configured: true, plan: updated || plan, message: `Plan saved, but Stripe sync failed: ${error.message}`, error };
  }
}

function parseStripeSignature(signatureHeader) {
  return String(signatureHeader || '').split(',').reduce((result, part) => {
    const [key, value] = part.split('=');
    if (!key || !value) return result;
    if (!result[key]) result[key] = [];
    result[key].push(value);
    return result;
  }, {});
}

function safeSignatureMatch(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export function verifyStripeWebhook(rawBody, signatureHeader) {
  const secret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured.');
  const parts = parseStripeSignature(signatureHeader);
  const timestamp = Number(parts.t?.[0] || 0);
  const signatures = parts.v1 || [];
  if (!timestamp || !signatures.length) throw new Error('Stripe signature header is invalid.');
  if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > WEBHOOK_TOLERANCE_SECONDS) throw new Error('Stripe webhook timestamp is outside the allowed tolerance.');
  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  if (!signatures.some((signature) => safeSignatureMatch(signature, expected))) throw new Error('Stripe webhook signature verification failed.');
  return JSON.parse(rawBody);
}

export function stripeTimestampToIso(value) {
  const timestamp = Number(value || 0);
  return timestamp > 0 ? new Date(timestamp * 1000).toISOString() : null;
}

export function stripeObjectId(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return String(value.id || '');
}
