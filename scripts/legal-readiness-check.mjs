import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const main = read('src/main.jsx');
const legal = read('src/LegalPages.jsx');
const bootstrap = read('netlify/functions/bootstrap-admin.js');
const retention = read('netlify/functions/operational-retention-cleanup.js');
const entitlements = read('netlify/functions/_entitlements.js');
const customerEmail = read('netlify/functions/_customer-email.js');
const adminEmail = read('netlify/functions/_admin-email.js');
const stripe = read('netlify/functions/_stripe.js');
const checkout = read('netlify/functions/stripe-checkout.js');
const claims = read('docs/ENCRYPTION_AND_CLAIMS_REGISTER_VER_0.053C.md');
const processing = read('docs/DATA_PROCESSING_VER_0.053C.md');
const commercial = read('docs/COMMERCIAL_LAUNCH_CHECKLIST_VER_0.053C.md');
const support = read('docs/SUPPORT_PROCESS_VER_0.053C.md');
const pkg = JSON.parse(read('package.json'));
const sw = read('public/sw.js');
const server = read('netlify/functions/_db.js');

let failed = 0;
function check(label, ok) {
  if (ok) console.log(`PASS  ${label}`);
  else { console.error(`FAIL  ${label}`); failed += 1; }
}

check('Ver-0.055b app/server/package/service-worker versions align', pkg.version === '0.0.55-b' && /Password-Encrypt Ver-0\.055b/.test(main) && /Password-Encrypt Ver-0\.055b/.test(server) && /my-passwords-v0\.055b/.test(sw));
check('Public Terms, Privacy and Billing routes are implemented and included in the PWA shell', /'\/terms': 'terms'/.test(legal) && /'\/privacy': 'privacy'/.test(legal) && /'\/billing-terms': 'billing'/.test(legal) && /'\/terms'/.test(sw) && /'\/privacy'/.test(sw) && /'\/billing-terms'/.test(sw));
check('Public landing page links all legal policies', /href="\/terms"/.test(main) && /href="\/privacy"/.test(main) && /href="\/billing-terms"/.test(main));
check('New signup requires explicit current Terms and Privacy acceptance in browser', /legalAccepted/.test(main) && /LEGAL_VERSION/.test(main) && /Please read and agree to the Terms of Service and Privacy Policy/.test(main));
const signupStepOneStart = main.indexOf('landingOnboardingStep === 1');
const signupStepTwoStart = main.indexOf('landingOnboardingStep === 2', signupStepOneStart);
const signupStepOne = signupStepOneStart >= 0 && signupStepTwoStart > signupStepOneStart ? main.slice(signupStepOneStart, signupStepTwoStart) : '';
check('Trial signup Screen 1 requires Terms and Privacy only', /id="signup-legal-consent"/.test(signupStepOne) && /legalAccepted/.test(signupStepOne) && /Terms of Service/.test(signupStepOne) && /Privacy Policy/.test(signupStepOne) && !/Subscription, Cancellation/.test(signupStepOne));
check('Signup Terms and Privacy open in an in-app popup instead of a new browser tab', /openSignupLegalDocument\('terms'\)/.test(signupStepOne) && /openSignupLegalDocument\('privacy'\)/.test(signupStepOne) && !/openSignupLegalDocument\('billing'\)/.test(signupStepOne) && /signup-legal-popup-layer/.test(main) && !/target="_blank"/.test(signupStepOne));
check('Closing a signup legal policy returns to the preserved signup state', /Back to signup/.test(main) && /<LegalPage page=\{signupLegalModal\.page\} embedded \/>/.test(main) && /if \(embedded\) return <article/.test(legal));
check('Server independently enforces current legal acceptance for new accounts', /LEGAL_ACCEPTANCE_REQUIRED/.test(bootstrap) && /legalVersion !== LEGAL_VERSION/.test(bootstrap));
check('Trial signup audit records Terms and Privacy acceptance only', /legal_acceptance/.test(bootstrap) && /accepted_at: now/.test(bootstrap) && /terms_of_service/.test(bootstrap) && /privacy_policy/.test(bootstrap) && !/documents: \['terms_of_service', 'privacy_policy', 'subscription_cancellation_refund_policy'\]/.test(bootstrap));
check('Terms describe client-side encryption without absolute security promise', /Client-side encrypted vault/.test(legal) && /AES-GCM/.test(legal) && /PBKDF2-SHA-256/.test(legal) && /No online service can promise absolute security/.test(legal));
check('Privacy policy explicitly avoids absolute zero-knowledge claim', /avoid an absolute “zero knowledge”/.test(legal) && /master password is not intentionally sent to or stored/.test(legal));
check('Emergency Access disclosure covers waiting period, secure link and document limitation', /Emergency Access is an intentional disclosure mechanism/.test(legal) && /Anyone who gains control of that link/.test(legal) && /uploaded document files are not currently/.test(legal));
check('Trial wording states no automatic paid conversion', /Creating the trial does not start a paid subscription/.test(main) && /paid subscription begins only/.test(legal));
check('Cancellation and refund terms preserve mandatory consumer rights', /Mandatory consumer rights/.test(legal) && /If local law gives you a cooling-off/.test(legal));
check('Tax wording does not falsely claim tax-inclusive pricing', /does not by itself promise that a price is tax-inclusive/.test(legal));
check('Stripe invoice and receipt wording identifies Stripe-hosted records', /Stripe generates and hosts subscription invoices and payment receipts/.test(legal) && /Stripe hosts the official invoice and receipt records/.test(main));
check('Business and support identity are published', /ZippyWeb/.test(legal) && /info@zippyweb\.uk/.test(legal));
check('Retention cleanup covers operational, email, SMS and deletion history metadata', /customer_email_log/.test(retention) && /admin_email_log/.test(retention) && /sms_delivery_log/.test(retention) && /account_deletion_requests/.test(retention));
check('Privacy lists current infrastructure/payment/communications processors', ['Netlify','Supabase','Stripe','Resend','Twilio','Google Fonts','FlagCDN'].every((name) => legal.includes(`<strong>${name}</strong>`)));
check('Customer-facing lifecycle/admin emails link Terms, Privacy and Billing policies', [customerEmail, adminEmail].every((source) => /\/terms/.test(source) && /\/privacy/.test(source) && /\/billing-terms/.test(source)));
check('Family and Business remain reserved future plans for Personal-only launch', /\['family', 'business'\]/.test(entitlements) && /launchReadyPlan/.test(entitlements));
check('Secure device unlock is disclosed as local wrapped-master-password storage', /wrapped copy of the master password/.test(legal) && /non-exportable local device key/.test(legal) && /Secure device unlock/.test(claims));
check('Current customer-facing code avoids absolute master-password storage/access claims', !/Only your master password opens your vault/.test(main) && !/only way to decrypt your vault/.test(customerEmail + adminEmail) && !/master vault password is never stored/.test(customerEmail + adminEmail) && !/not stored by the app/.test(main));
check('Stripe Tax is opt-in and disabled unless the server setting is explicitly enabled', /stripeAutomaticTaxEnabled/.test(stripe) && /STRIPE_AUTOMATIC_TAX/.test(stripe) && /automatic_tax: \{ enabled: true \}/.test(checkout) && /customer_update: \{ address: 'auto' \}/.test(checkout));
check('Commercial, data-processing, claims and support launch documentation is present', /Stripe statement descriptor/.test(commercial) && /processor\/service-provider register/.test(processing) && /Prohibited \/ unsupported claims/.test(claims) && /Core support rule/.test(support));
check('Privacy discloses essential browser storage and external font/flag resources', /Essential cookies and browser storage/.test(legal) && /does not intentionally include advertising or behavioural-analytics trackers/.test(legal) && /Google Fonts/.test(processing) && /FlagCDN/.test(processing));

check('Password-Encrypt is the customer-facing product name across live app/legal/PWA shell', !/My Passwords/.test(main + legal + customerEmail + adminEmail) && /Password-Encrypt/.test(main) && /Password-Encrypt/.test(legal) && /Password-Encrypt/.test(read('public/manifest.webmanifest')));
check('Vault home header uses the customer vault name instead of the product name', /className="vault-home-title">\{bootstrap\.accountName \|\| bootstrap\.tenantName \|\| 'Private Vault'\}/.test(main));
check('Ubuntu is forcibly applied throughout desktop and mobile UI', !/font-family:\s*Inter/.test(read('src/styles.css')) && /#root \*/.test(read('src/styles.css')) && /fonts.googleapis.com\/css\?family=Ubuntu:300,400,500,700/.test(read('index.html')) && /font-synthesis: none/.test(read('src/styles.css')));
check('Legal document version is aligned client and server after the product rename', /LEGAL_VERSION = '2026-08-09'/.test(legal) && /LEGAL_VERSION = '2026-08-09'/.test(bootstrap) && /LEGAL_EFFECTIVE_DATE = '09\/Aug\/2026'/.test(legal));
check('Landing plan area prominently states that trial takes no credit card details', /NO CREDIT CARD DETAILS are taken during your free trial/.test(main) && !/landing-pricing-legal/.test(main));
check('Paid checkout requires explicit billing-policy acknowledgement in the browser', /billing-purchase-consent/.test(main) && /billingTermsAccepted/.test(main) && /Subscription, Cancellation &amp; Refund Policy/.test(main));
check('Stripe checkout independently enforces current billing-policy acknowledgement', /BILLING_TERMS_ACCEPTANCE_REQUIRED/.test(checkout) && /billingTermsVersion !== BILLING_TERMS_VERSION/.test(checkout));
check('Paid billing-policy acceptance is recorded in audit metadata', /paid_subscription_terms_accepted/.test(checkout) && /billing_terms_acceptance/.test(checkout));
check('Create-account progress indicators render in the sticky popup header', /item-popup-header create-account-popup-header/.test(main) && /create-account-header-content/.test(main) && /create-account-popup-header \.onboarding-progress/.test(read('src/styles.css')));

if (failed) {
  console.error(`\n${failed} legal/commercial readiness check${failed === 1 ? '' : 's'} failed.`);
  process.exit(1);
}
console.log('\nAll 35 legal/commercial readiness checks passed.');
