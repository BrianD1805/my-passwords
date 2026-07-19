import { APP_VERSION, jsonResponse, selectRows } from './_db.js';

export async function handler(event) {
  if (event.httpMethod !== 'GET') return jsonResponse(405, { ok: false, version: APP_VERSION, message: 'GET required.' });
  try {
    const plans = await selectRows('subscription_plans', 'select=code,display_name,description,currency,monthly_price_minor,quarterly_price_minor,annual_price_minor,trial_days,max_users,storage_limit_mb,document_limit,features,is_featured,display_order&is_public=eq.true&is_active=eq.true&order=display_order.asc,display_name.asc');
    return jsonResponse(200, { ok: true, version: APP_VERSION, plans: plans || [] });
  } catch (error) {
    return jsonResponse(200, { ok: true, version: APP_VERSION, plans: [], message: 'Published subscription plans are not available yet.' });
  }
}
