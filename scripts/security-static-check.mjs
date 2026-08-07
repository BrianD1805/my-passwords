import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];
function check(name, pass, detail = '') { checks.push({ name, pass: Boolean(pass), detail }); }

const syncVault = read('netlify/functions/sync-vault.js');
const documents = read('netlify/functions/document-blob.js');
const profile = read('netlify/functions/account-profile.js');
const billing = read('netlify/functions/_billing.js');
const emergency = read('netlify/functions/emergency-access-invite.js');
const auth = read('netlify/functions/_auth.js');
const webhook = read('netlify/functions/stripe-webhook.js');
const main = read('src/main.jsx');
const bootstrap = read('netlify/functions/bootstrap-admin.js');
const checkout = read('netlify/functions/stripe-checkout.js');
const security = read('netlify/functions/_security.js');

check('Vault server identity comes from validated session', /getCustomerAccess\(event\)/.test(syncVault) && /session\.tenantId/.test(syncVault) && /session\.userId/.test(syncVault));
check('Documents are scoped to session tenant and user', /tenant_id=eq\.\$\{safeEq\(tenantId\)\}/.test(documents) && /user_id=eq\.\$\{safeEq\(userId\)\}/.test(documents));
check('Account profile is scoped to session tenant and user', /tenant_id=\$\{eq\(session\.tenantId\)\}/.test(profile) && /id=\$\{eq\(session\.userId\)\}/.test(profile));
check('Billing context is derived from validated customer session', /validateCustomerSession\(event/.test(billing) && /session\.tenantId/.test(billing) && /session\.userId/.test(billing));
check('Emergency Access owner identity is overwritten from session', /sessionTenantId/.test(emergency) && /sessionUserId/.test(emergency));
check('Production cookies use __Host prefix and SameSite Strict', /__Host-mp_customer_session/.test(auth) && /__Host-mp_admin_session/.test(auth) && /SameSite=Strict/.test(auth));
check('Production session signing requires dedicated secrets', /if \(!production\) return process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(auth) && /if \(isSecureRequest\(event\)\) return decodeSession\(cookies\[SECURE_CUSTOMER_COOKIE\]/.test(auth));
check('Security HMAC controls require dedicated production session secret', /requireSecuritySecret/.test(security) && /CONTEXT === 'production'/.test(security));
check('Stripe webhook has atomic replay ledger claim', /claim_stripe_webhook_event/.test(webhook) && /claimWebhookEvent/.test(webhook));
check('Browser no longer sends identity in sync/document URLs', !/sync-vault\?tenantId=/.test(main) && !/document-blob\?tenantId=/.test(main));
check('Browser sensitive POST helper sends request marker and CSRF', /x-mp-request/.test(main) && /x-mp-csrf/.test(main));
check('Signup plan is validated against server-side published plan data', /loadPlan\(selectedPlanCode\)/.test(bootstrap) && /plan\.is_active === false/.test(bootstrap) && /plan\.is_public === false/.test(bootstrap));
check('Stripe checkout uses server-loaded plan and validated billing session', /getBillingContext\(event\)/.test(checkout) && /loadPlan\(planCode\)/.test(checkout) && /plan\[interval\.priceColumn\]/.test(checkout));

const failed = checks.filter((item) => !item.pass);
for (const item of checks) console.log(`${item.pass ? 'PASS' : 'FAIL'}  ${item.name}${item.detail ? ` — ${item.detail}` : ''}`);
if (failed.length) {
  console.error(`\n${failed.length} security static check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} security static checks passed.`);
