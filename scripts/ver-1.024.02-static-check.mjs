import fs from 'node:fs';
const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const post = fs.readFileSync(new URL('../netlify/functions/post-verification-notifications.js', import.meta.url), 'utf8');
const customerEmail = fs.readFileSync(new URL('../netlify/functions/_customer-email.js', import.meta.url), 'utf8');
const verify = fs.readFileSync(new URL('../netlify/functions/verify-otp-test.js', import.meta.url), 'utf8');
const checks = [
 ['version bumped', main.includes("Password-Encrypt Ver-1.024.02")],
 ['sms still routes to code entry step 7', main.includes("setLandingOnboardingStep(channel === 'sms' ? 7 : 9)")],
 ['new signup routing fix retained', main.includes("const verifiedNewSignup = result.onboardingMode === 'new_signup'") && main.includes('existingAccount: !verifiedNewSignup')],
 ['master password setup state retained', verify.includes("'master_password_setup_required'") && verify.includes('onboardingSetupPending')],
 ['welcome follow-up gated by email verification channel', main.includes("sendWelcome: verifyingChannel === 'email' && Boolean(result.emailVerified)")],
 ['admin follow-up remains enabled independently', main.includes('sendAdmin: true')],
 ['post verification honours explicit welcome flag', post.includes('const sendWelcome = body.sendWelcome === true') && post.includes('if (sendWelcome && user.email_verified')],
 ['customer email helper hard-blocks welcome before verified email', customerEmail.includes("reason: 'email_not_verified'") && customerEmail.includes('welcomeType && !loaded?.user?.email_verified')],
 ['settings scroll reset is immediate', main.includes("behavior: 'auto'") && main.includes('document.documentElement.scrollTop = 0') && main.includes('document.body.scrollTop = 0')],
 ['settings section opener still resets top', main.includes("function openSettingsSection(section)") && main.includes('scrollSettingsToTop();')],
 ['nominate Emergency Access header differentiated', main.includes('<strong>Nominate a Trusted Person</strong><small>Set up Emergency Access for someone you trust.</small>')],
 ['receive Emergency Access header differentiated', main.includes('<strong>Receive an Emergency Package</strong><small>Open Emergency Access information released to you.</small>')]
];
let failed=0;
for (const [name, ok] of checks) { console.log(`${ok?'PASS':'FAIL'}  ${name}`); if(!ok) failed++; }
console.log(`\n${checks.length-failed}/${checks.length} Ver-1.024.02 checks passed.`);
if(failed) process.exit(1);
