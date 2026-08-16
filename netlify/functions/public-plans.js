import { APP_VERSION, jsonResponse, selectRows } from './_db.js';
import { launchReadyPlan, normalisePlanFeatureFlags } from './_entitlements.js';

export async function handler(event) {
  if (event.httpMethod !== 'GET') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET required.' });
  try {
    const plans = await selectRows('subscription_plans', 'select=code,display_name,description,currency,monthly_price_minor,quarterly_price_minor,annual_price_minor,trial_days,max_users,item_limit,storage_limit_mb,document_limit,photo_limit,features,feature_flags,is_featured,display_order,stripe_sync_status,stripe_monthly_price_id,stripe_quarterly_price_id,stripe_annual_price_id&is_public=eq.true&is_active=eq.true&order=display_order.asc,display_name.asc');
    const launchPlans = (plans || []).filter((plan) => launchReadyPlan(plan.code)).map((plan) => ({ ...plan, feature_flags: normalisePlanFeatureFlags(plan.feature_flags || {}) }));
    return jsonResponse(200, { ok: true, version: APP_VERSION, plans: launchPlans });
  } catch (error) {
    return jsonResponse(200, { ok: true, version: APP_VERSION, plans: [], message: 'Published subscription plans are not available yet.' });
  }
}
