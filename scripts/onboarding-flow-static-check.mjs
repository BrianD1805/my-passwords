import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const main = read('src/main.jsx');
const css = read('src/styles.css');
const bootstrap = read('netlify/functions/bootstrap-admin.js');
const requestSms = read('netlify/functions/request-sms-otp.js');
const requestEmail = read('netlify/functions/request-email-otp-test.js');
const verifyOtp = read('netlify/functions/verify-otp-test.js');
const sms = read('netlify/functions/_sms.js');
const pkg = JSON.parse(read('package.json'));
const sw = read('public/sw.js');
const indexHtml = read('index.html');
const manifest = JSON.parse(read('public/manifest.webmanifest'));
const netlifyToml = read('netlify.toml');
let failures = 0;

function check(label, condition) {
  if (condition) console.log(`PASS  ${label}`);
  else { console.error(`FAIL  ${label}`); failures += 1; }
}

check('Ver-1.016 app/package/service-worker versions align', pkg.version === '1.16.0' && /Password-Encrypt Ver-1\.016/.test(main) && /my-passwords-v1\.016/.test(sw));
check('Onboarding has fourteen explicit progress steps', /ONBOARDING_TOTAL_STEPS = 14/.test(main) && /step === 14/.test(main));
check('Public signup uses a dedicated card screen rather than rendering the landing page behind it', /isPublicLandingRoute && isCreateAccountPopupOpen/.test(main) && /onboarding-card-screen/.test(main));
check('Dedicated onboarding card is not marked as a dialog', !/onboarding-card-screen[^\n]{0,300}role="dialog"/.test(main));
check('Onboarding has a visible progress track', /onboarding-progress-track/.test(main) && /progress = Math\.round\(\(step \/ ONBOARDING_TOTAL_STEPS\) \* 100\)/.test(main));
check('Desktop onboarding card uses the reduced half-screen footprint', /width: min\(46\.8vw, 684px\)/.test(css) && /max-height: calc\(100dvh - 32px\)/.test(css));
check('Mobile onboarding card uses most of the viewport', /width: calc\(100vw - 20px\)/.test(css) && /height: calc\(100dvh - 24px\)/.test(css));
check('Mobile onboarding supports left-swipe advancement on safe steps', /handleOnboardingTouchStart/.test(main) && /handleOnboardingTouchEnd/.test(main) && /dx > -70/.test(main));
check('Name is isolated on step 1', /step === 1[\s\S]*What should we call you\?/.test(main));
check('Email address is isolated on step 2', /step === 2[\s\S]*Enter your email address/.test(main));
check('Vault name is isolated on step 3', /step === 3[\s\S]*Name your vault/.test(main));
check('Normal onboarding has no plan-choice card', !/onboarding-plan-step/.test(main) && !/step === 4[\s\S]{0,900}Choose your plan/.test(main));
check('Legal acceptance is isolated on step 4', /step === 4[\s\S]*Review the account terms/.test(main));
check('Mobile number is isolated on step 5', /step === 5[\s\S]*Enter your mobile number/.test(main));
check('SMS request is isolated on step 6', /step === 6[\s\S]*Send SMS code/.test(main));
check('SMS OTP entry is isolated on step 7', /step === 7[\s\S]*Enter the SMS code/.test(main));
check('Email request is isolated on step 8', /step === 8[\s\S]*Send email code/.test(main));
check('Email OTP entry is isolated on step 9', /step === 9[\s\S]*Enter the email code/.test(main));
check('Master password creation is isolated on step 10', /step === 10[\s\S]*Create your master password/.test(main));
check('Master password confirmation is isolated on step 11', /step === 11[\s\S]*Confirm your master password/.test(main));
check('Install app remains step 12 before final choices', /step === 12[\s\S]*Install Password-Encrypt/.test(main));
check('Mobile step advances to a separate SMS request screen before spending an SMS', /landingOnboardingStep === 5[\s\S]*setLandingOnboardingStep\(6\)/.test(main) && /prepareLandingOnboarding\(\{ sendInitialSms: true \}\)/.test(main));
check('Onboarding SMS is now a primary verification channel, not an email-failure fallback', /onboarding_sms_primary/.test(requestSms) && !/SMS_FALLBACK_NOT_AVAILABLE/.test(requestSms));
check('Paid onboarding SMS has a strict two-per-ten-minute limiter', /scope: 'onboarding_sms_primary'/.test(requestSms) && /limit: 2/.test(requestSms) && /windowSeconds: 10 \* 60/.test(requestSms));
check('Onboarding network requests have a hard twenty-second timeout and manual cancel path', /ONBOARDING_NETWORK_TIMEOUT_MS = 20000/.test(main) && /Cancel sending/.test(main) && /beginOnboardingNetworkRequest/.test(main));
check('SMS request keeps the customer informed while delivery is pending', /Your SMS has been requested/.test(main) && /This can take a little while/.test(main) && /SMS requested/.test(main));
check('SMS can be deferred so email verification can continue', /Do this later — verify email instead/.test(main) && /smsDeferred/.test(main) && /setLandingOnboardingStep\(8\)/.test(main));
check('Onboarding email request no longer requires prior mobile verification', !/MOBILE_VERIFICATION_REQUIRED/.test(requestEmail));
check('Either verified onboarding channel can activate the account', !/partialOnboarding: true/.test(verifyOtp) && /pendingVerificationChannel/.test(verifyOtp) && /createVerifiedCustomerSession\(event/.test(verifyOtp));
check('Successful mobile verification still presents email verification before master-password setup', /landingOtp\.channel === 'sms' && !result\.emailVerified/.test(main) && /setLandingOnboardingStep\(8\)/.test(main) && /Do this later — continue setup/.test(main));
check('Incomplete contact verification is recorded without blocking account activation', /email_verification_required/.test(verifyOtp) && /phone_verification_required/.test(verifyOtp));
check('Future authenticated sign-ins can show the missing-contact reminder', /Complete account verification/.test(main) && /CONTACT_VERIFICATION_REMINDER_KEY/.test(main) && /We will remind you again on a future sign-in/.test(main));
check('Existing account discovered during signup remains routed to existing vault access', /const target = isExistingAccount \? '\/vault\?entry=existing' : '\/vault\?entry=onboarding'/.test(main));
check('Existing activated account uses email verification rather than creating a new vault', /existingAccount \|\| mobileAlreadyVerified/.test(main) && /setLandingOnboardingStep\(8\)/.test(main));
check('Pending signup can be safely resumed rather than being misclassified as an activated existing account', /pendingSignup/.test(bootstrap) && /resumedPendingSignup: true/.test(bootstrap) && /existingAccount: false/.test(bootstrap));
check('Changing a pending unverified mobile number resets mobile verification before another SMS', /phoneChanged \? false : Boolean\(existingUser\.phone_verified\)/.test(bootstrap));
check('Onboarding state is mirrored to session and local recovery storage with an expiry', /ONBOARDING_FLOW_STATE_KEY/.test(main) && /\['sessionStorage', 'localStorage'\]/.test(main) && /writeOnboardingRecoveryRecord\(ONBOARDING_FLOW_STATE_KEY/.test(main) && /ONBOARDING_RECOVERY_MAX_AGE_MS = 2 \* 60 \* 60 \* 1000/.test(main));
check('Onboarding recovery state deliberately excludes OTP input and master password', /OTP values,[\s\S]*master passwords are intentionally never persisted/.test(main) && /otp: \{[\s\S]*challengeId:[\s\S]*smsVerified:[\s\S]*emailVerified:/.test(main));
check('Saved onboarding flow resumes only when its flow version is current', /initialOnboardingFlowRef = useRef\(readOnboardingFlowState\(\)\)/.test(main) && /ONBOARDING_FLOW_VERSION/.test(main) && /flowVersion/.test(main) && /initialOnboardingFlowRef\.current\?\.active/.test(main));
check('Firefox-style tab recreation can recover onboarding from local storage', /readFreshOnboardingRecord/.test(main) && /window\[storageName\]\.setItem/.test(main) && /sessionStorage', 'localStorage/.test(main));
check('Pending onboarding identity can recover when the flow checkpoint is missing', /recoverablePendingOnboardingIdentity/.test(main) && /Continue setup/.test(main) && /phoneVerified \? 8 : 6/.test(main));
check('OTP code itself is cleared when restoring saved onboarding state', /input: '', testCode: ''/.test(main));
check('SMS OTP field exposes the browser one-time-code autofill hint', /name="one-time-code"[\s\S]{0,250}autoComplete="one-time-code"|autoComplete="one-time-code"[\s\S]{0,250}name="one-time-code"/.test(main));
check('Email OTP field also exposes one-time-code autofill', /name="email-one-time-code"/.test(main) && /autoComplete="one-time-code"/.test(main));
check('WebOTP is requested for SMS where the browser supports it', /OTPCredential/.test(main) && /navigator\.credentials\.get\(\{ otp: \{ transport: \['sms'\] \}/.test(main));
check('WebOTP capture is armed before the SMS send request to avoid fast-message races', /if \(channel === 'sms'\) beginOnboardingSmsWebOtpCapture\(\);/.test(main) && main.indexOf("beginOnboardingSmsWebOtpCapture();", main.indexOf("async function sendLandingOnboardingOtp")) < main.indexOf("postJson('/.netlify/functions/request-sms-otp'", main.indexOf("async function sendLandingOnboardingOtp")));
check('Netlify explicitly permits same-origin otp-credentials for WebOTP', /otp-credentials=\(self\)/.test(netlifyToml));
check('Six-digit OTPs can be autofilled but require explicit verification', /autoComplete="one-time-code"/.test(main) && /Verify mobile number/.test(main) && !/window\.setTimeout\(\(\) => verifyLandingOnboardingOtp\(\), 180\)/.test(main));
check('OTP errors require a changed/re-entered code instead of entering an automatic retry loop', /status: current\.challengeId \? 'sent' : current\.status/.test(main));
check('Twilio Verify supports an optional custom template SID for domain-bound WebOTP SMS', /TWILIO_VERIFY_TEMPLATE_SID/.test(sms) && /params\.TemplateSid = config\.verifyTemplateSid/.test(sms));
check('Messaging fallback SMS includes the Password-Encrypt origin-bound WebOTP line', /@password-encrypt\.com #\$\{code\}/.test(sms));
check('Master password is never persisted as onboarding recovery state', !/saveOnboardingFlowState\([\s\S]{0,1400}masterPassword/.test(main));
check('Master password fields retain password-manager suppression hints', /onboarding-secret-mask[\s\S]{0,450}data-lpignore="true"[\s\S]{0,300}data-1p-ignore="true"/.test(main));
check('Master password onboarding fields have vault-style show and hide controls', /onboarding-password-toggle/.test(main) && /showOnboardingMasterPassword/.test(main) && /showOnboardingConfirmPassword/.test(main) && /<EyeOff/.test(main));
check('Master password mismatch is a prominent alert panel', /onboarding-password-mismatch/.test(main) && /Passwords do not match/.test(main) && /role="alert"/.test(main));
check('Vault creation requires a live verified customer session matching the onboarded account', /verifyOnboardingSessionMatchesAccount/.test(main) && /ACCOUNT_SESSION_MISMATCH/.test(main));
check('New onboarding refuses to overwrite an existing local encrypted vault', /New-account onboarding will not overwrite it/.test(main));
check('Creating the vault routes to install onboarding before vault home', /afterCreateOnboardingInstall: true/.test(main) && /entry=install/.test(main) && /setShowInstallOnboarding\(true\)/.test(main));
check('PWA install prompt is captured and invoked where supported', /beforeinstallprompt/.test(main) && /await promptEvent\.prompt\(\)/.test(main) && /await promptEvent\.userChoice/.test(main));
check('PWA install opportunity is captured before the React module loads', /__passwordEncryptInstallPrompt/.test(indexHtml) && indexHtml.indexOf('__passwordEncryptInstallPrompt') < indexHtml.indexOf('/src/main.jsx'));
check('Manifest retains stable standalone vault identity', manifest.id === '/vault' && manifest.start_url === '/vault' && manifest.display === 'standalone');
check('Install onboarding still provides a continue-without-installing fallback', /Continue without installing/.test(main) && /finishInstallOnboarding/.test(main));
check('Push activation is suppressed during install onboarding', /showInstallOnboarding \|\| onboardingInstallEntry/.test(main));
check('Completing install advances to push notifications inside onboarding', /setFinalOnboardingStep\(13\)/.test(main) && /pushActivationPromptDeferredThisDocumentRef\.current = true/.test(main));
check('Push notifications are onboarding step 13', /step === 13[\s\S]*Push notifications[\s\S]*Activate notifications/.test(main));
check('Guided tour choice is the final onboarding step 14', /step === 14[\s\S]*Welcome to Password-Encrypt[\s\S]*Start tour/.test(main) && /Your vault opens after this step/.test(main));
check('Final onboarding no longer uses push or guided-tour welcome popups', /setPushActivationPromptOpen\(false\)/.test(main) && /setGuidedTourPromptOpen\(false\)/.test(main) && /final-onboarding-card-v1016/.test(main));
check('Landing-page setup explanation reflects mobile, email, master password and install stages', /Verify your mobile/.test(main) && /Verify your email/.test(main) && /Create your master password/.test(main) && /Install the app/.test(main));

if (failures) {
  console.error(`\n${failures} onboarding static check(s) failed.`);
  process.exit(1);
}
console.log(`\nAll Ver-1.016 onboarding static checks passed.`);
