import React, { useEffect } from 'react';
import { ArrowLeft, CreditCard, Lock, Mail, ShieldCheck, UsersRound } from 'lucide-react';

export const LEGAL_VERSION = '2026-08-07';
export const LEGAL_EFFECTIVE_DATE = '7 August 2026';
export const SUPPORT_EMAIL = 'info@zippyweb.uk';
export const BUSINESS_NAME = 'ZippyWeb';

const legalRoutes = Object.freeze({
  '/terms': 'terms',
  '/privacy': 'privacy',
  '/billing-terms': 'billing'
});

export function legalPageForPath(pathname = '') {
  return legalRoutes[String(pathname || '').replace(/\/+$/, '') || '/'] || '';
}

function LegalShell({ title, eyebrow, intro, children, embedded = false }) {
  useEffect(() => {
    if (embedded) return;
    document.title = `${title} | My Passwords`;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', intro);
  }, [title, intro, embedded]);

  const documentContent = (
    <>
      <div className="legal-document-heading">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{intro}</p>
        <div className="legal-effective-row"><span>Effective {LEGAL_EFFECTIVE_DATE}</span><span>Document version {LEGAL_VERSION}</span></div>
      </div>
      {children}
      <section className="legal-contact-card">
        <Mail size={21} />
        <div><strong>Questions or privacy requests</strong><p>My Passwords is a {BUSINESS_NAME} project. Contact <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Never send your master password, vault contents, recovery codes or secret keys to support.</p></div>
      </section>
    </>
  );

  if (embedded) return <article className="legal-document legal-embedded-document">{documentContent}</article>;

  return (
    <main className="legal-page-shell">
      <header className="legal-page-header">
        <a className="legal-back-link" href="/"><ArrowLeft size={18} /> Back to My Passwords</a>
        <div className="legal-brand-lock"><Lock size={20} /></div>
        <div>
          <span className="legal-brand-name">My Passwords</span>
          <small>A {BUSINESS_NAME} project</small>
        </div>
      </header>
      <article className="legal-document">{documentContent}</article>
      <footer className="legal-page-footer">
        <span>© 2026 My Passwords · A {BUSINESS_NAME} project</span>
        <nav><a href="/terms">Terms</a><a href="/privacy">Privacy</a><a href="/billing-terms">Billing & refunds</a></nav>
      </footer>
    </main>
  );
}

function TermsPage({ embedded = false }) {
  return (
    <LegalShell
      eyebrow="Legal"
      title="Terms of Service"
      intro="These Terms explain the rules for using My Passwords, including account access, encrypted vault services, subscriptions and Emergency Access. Mandatory consumer rights that apply where you live are not excluded by these Terms."
      embedded={embedded}
    >
      <section><h2>1. Service and operator</h2><p>My Passwords is a password-vault service operated as a {BUSINESS_NAME} project. The service includes a local encrypted vault, optional encrypted cloud backup and syncing, account verification, subscription management, encrypted document storage where included in the plan, and Emergency Access where enabled.</p></section>
      <section><h2>2. Your account</h2><p>You must provide accurate account contact information and keep access to your verified email address and, where used, mobile number. You are responsible for activity performed through your verified devices and for keeping those devices reasonably secure.</p><p>The Personal plan is intended for one account owner. Family and Business functionality is not part of the initial public launch unless it is expressly shown as available in the service.</p></section>
      <section><h2>3. Master password, encryption and Secure device unlock</h2><div className="legal-highlight"><ShieldCheck size={21} /><div><strong>Client-side encrypted vault</strong><p>Vault records and uploaded document contents are encrypted in the browser before backup or upload. The current implementation uses AES-GCM with a key derived from the master password using PBKDF2-SHA-256. My Passwords does not intentionally send or store the master password on its servers.</p></div></div><p>Because My Passwords does not hold a server-side copy of the master password, support cannot recover or reset it and cannot normally decrypt stored vault snapshots or encrypted document contents. If the master password is lost, support cannot replace it. A working Secure device unlock on a device you already configured may still provide local access until its next required password check, and Emergency Access may release information that was prepared in advance; neither mechanism is a server-side master-password reset.</p><p>If you deliberately enable Secure device unlock, My Passwords keeps a wrapped copy of the master password and a non-exportable local device key in that browser/device storage so the password can be recovered locally after the platform credential check. This convenience feature changes the local-device threat model: anyone or any software that compromises the browser, device or same-origin application context may be able to attack that locally stored material. Secure device unlock can be removed from that device and periodically requires the master password again.</p><p>No online service can promise absolute security. Protection also depends on the integrity of your browser, device, operating system, network and the application code delivered to your device. You should keep devices updated and protect them against malware, unauthorised access and account compromise.</p></section>
      <section><h2>4. Free trials</h2><p>A free trial starts only after the new account successfully completes the contact-verification step. Creating a trial account does not by itself create a paid subscription and does not require a card. A paid subscription begins only when you deliberately complete Stripe Checkout.</p><p>The trial end date is shown in My Passwords. If you start a subscription during the trial, Stripe Checkout shows the applicable price and the expected first charge or renewal timing before you confirm payment. Starting a paid subscription does not guarantee an extension of an existing trial.</p></section>
      <section><h2>5. Paid subscriptions and renewals</h2><p>Subscriptions are billed in the currency and billing period shown before checkout. Unless you cancel, a subscription renews automatically at the end of each billing period using the payment method managed through Stripe.</p><p>Higher-plan upgrades may take effect immediately and Stripe may apply a prorated billing adjustment. Downgrades and billing-period changes are normally scheduled for the next renewal. Only plans actually published in My Passwords are available for purchase.</p></section>
      <section><h2>6. Cancellation</h2><p>You may schedule cancellation from Plan & Billing. Cancellation takes effect at the end of the current paid billing period unless applicable law requires a different result. Access included in the paid subscription remains available until that period ends, subject to payment status and these Terms. A scheduled cancellation can be removed before the subscription ends.</p><p>Deleting an account is a separate action. If a paid Stripe subscription is still active when an account deletion becomes due, My Passwords attempts to cancel that subscription before deleting the cloud account data.</p></section>
      <section><h2>7. Refunds</h2><p>Refunds, duplicate or mistaken charges, statutory cancellation rights and charge corrections are governed by the <a href="/billing-terms">Subscription, Cancellation & Refund Policy</a>. Nothing in these Terms removes rights that cannot lawfully be excluded.</p></section>
      <section><h2>8. Emergency Access</h2><div className="legal-highlight"><UsersRound size={21} /><div><strong>Emergency Access is an intentional disclosure mechanism</strong><p>If you enable it, you choose a trusted person, waiting period and release scope. You are notified when access is requested and can cancel during the waiting period. If you do not cancel in time, the prepared emergency package can become available through the trusted person's secure link.</p></div></div><p>Emergency Access does not send your master password. The prepared package is separately encrypted for the emergency link. Anyone who gains control of that link may be able to use it according to the Emergency Access state, so the trusted person must keep it private. Full-vault emergency packages contain the vault records deliberately prepared for that release; encrypted uploaded document files are not currently separately decrypted into that full-vault package.</p></section>
      <section><h2>9. Acceptable use</h2><p>You must not use My Passwords to attack the service, interfere with other customers, bypass plan limits or security controls, distribute malware, or store or transmit content where doing so is unlawful. We may suspend cloud account services where reasonably necessary to protect customers, investigate abuse, comply with law or address serious payment or security problems.</p></section>
      <section><h2>10. Availability and backups</h2><p>We aim to operate the service reliably, but uninterrupted availability is not guaranteed. A successful local save is not the same as a completed cloud backup. My Passwords displays sync and backup status so you can identify changes that still need protection. You remain responsible for responding to warnings and keeping devices reasonably protected.</p></section>
      <section><h2>11. Account deletion</h2><p>Account deletion requires verification and currently uses a 14-day safety period. You can cancel the deletion request during that period. When deletion completes, the My Passwords cloud account, encrypted vault snapshots and stored encrypted documents linked to the account are removed from the active application database. Limited payment, legal, security or provider records may remain where they must be kept for legitimate legal, accounting, fraud-prevention or dispute purposes.</p></section>
      <section><h2>12. Third-party services</h2><p>My Passwords relies on specialist providers for hosting, database services, payments and communications. Stripe processes payment-card information; My Passwords does not store your full card details. Provider availability and their own terms can affect related features.</p></section>
      <section><h2>13. Changes to the service or these Terms</h2><p>We may update features, plan limits, pricing or these Terms. Material changes will be communicated where reasonably required. Changes do not remove rights that already apply to a completed payment or that cannot lawfully be excluded.</p></section>
    </LegalShell>
  );
}

function PrivacyPage({ embedded = false }) {
  return (
    <LegalShell
      eyebrow="Privacy"
      title="Privacy Policy"
      intro="This Policy explains what personal data My Passwords processes, why it is needed, what is encrypted, which service providers are involved, and how to request access, correction or deletion."
      embedded={embedded}
    >
      <section><h2>1. Who handles your data</h2><p>My Passwords is a {BUSINESS_NAME} project. For account, support and service-administration data, {BUSINESS_NAME} acts as the service operator. Contact privacy and support requests at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p></section>
      <section><h2>2. Data we process</h2><div className="legal-data-grid"><div><strong>Account data</strong><p>Name, email, mobile number, account/vault name, verification state, plan and account status.</p></div><div><strong>Device and security metadata</strong><p>Verified-device identifiers, browser/platform information, session dates, security events and masked delivery destinations.</p></div><div><strong>Billing metadata</strong><p>Stripe customer/subscription identifiers, plan, billing period, amounts, invoice references and payment status. Full card details are handled by Stripe.</p></div><div><strong>Operational metadata</strong><p>Sync status, backup status, item/document counts, timestamps, error codes and service-health events designed not to contain decrypted vault contents.</p></div><div><strong>Communications</strong><p>Email/SMS delivery status and support information you choose to send. Do not send support your master password or vault contents.</p></div><div><strong>Emergency Access metadata</strong><p>Trusted-person contact details, waiting period, request/release status and the separately encrypted owner-prepared emergency package.</p></div></div></section>
      <section><h2>3. Encrypted vault data</h2><div className="legal-highlight"><Lock size={21} /><div><strong>Readable vault content is not the normal server-side data model</strong><p>Vault records and uploaded document contents are encrypted in your browser before they are sent for cloud storage. Server storage receives encrypted blobs plus the metadata needed to store, sync and enforce plan limits. The master password is not intentionally sent to or stored on My Passwords servers.</p></div></div><p>We therefore avoid an absolute “zero knowledge” or “cannot ever be decrypted” claim. Client-side encryption materially limits what routine server systems and support tooling can read, but security can still be affected by your device, browser, malicious software, compromised links, future code changes, lawful requirements, or other circumstances outside the mathematical encryption itself.</p><p>If you enable Secure device unlock, a wrapped copy of the master password and the local cryptographic key used to unwrap it remain on that browser/device. They are not part of the normal cloud account record, but they are local security-sensitive data and should be removed before disposing of or transferring a device.</p></section>
      <section><h2>4. Why we use personal data</h2><p>We process account and service data to provide the contract you request, verify devices, deliver encrypted backup/sync, administer subscriptions, provide support, prevent abuse and fraud, monitor reliability and security, comply with legal obligations, and establish or defend legal claims. Where local law requires consent for a particular communication or processing activity, we rely on consent and provide the applicable choice.</p></section>
      <section><h2>5. Service providers</h2><p>Depending on the feature you use, data may be processed by these service providers:</p><ul><li><strong>Netlify</strong> — web hosting, deployment and serverless functions.</li><li><strong>Supabase</strong> — application database and encrypted application storage.</li><li><strong>Stripe</strong> — subscription billing, payments, invoices and receipts.</li><li><strong>Resend</strong> — transactional and account email delivery.</li><li><strong>Twilio</strong> — SMS verification where SMS delivery is enabled.</li><li><strong>Google Fonts</strong> — delivery of the Ubuntu web font used by the interface.</li><li><strong>FlagCDN</strong> — delivery of country-flag images used by the phone-country selector.</li></ul><p>Loading third-party fonts or flag images causes the browser to make a network request to that provider, which can expose ordinary request metadata such as IP address and user-agent information. These providers process data under their own security, privacy and contractual arrangements. Their processing locations can differ from your country and from each other.</p></section>
      <section><h2>6. International processing</h2><p>My Passwords is intended for customers in more than one country. Hosting, payment and communications providers may process data internationally. Where data-protection law requires safeguards for an international transfer, the relevant contractual or provider transfer mechanism should be used. The exact hosting region and vendor arrangement may change as infrastructure is updated.</p></section>
      <section><h2>7. Retention</h2><p>Account information and encrypted cloud vault data are generally retained while the account remains active. A confirmed account-deletion request currently has a 14-day safety period before active cloud account data is removed.</p><ul><li>Operational events: generally up to 180 days.</li><li>Scheduled health-check history: generally up to 180 days.</li><li>Manual Stripe reconciliation history: generally up to 365 days.</li><li>Email/SMS delivery metadata: generally retained for up to 180 days where no longer needed for operational support, security or a legal requirement.</li><li>Completed/cancelled deletion-request records: generally up to 365 days from the request record, to evidence the request and outcome.</li><li>Legal-acceptance and essential security/audit records: may be kept longer where reasonably necessary to demonstrate agreement, investigate security events, comply with law or handle disputes.</li></ul><p>Payment and invoice records held by Stripe may be retained for tax, accounting, fraud, dispute or legal requirements even after the My Passwords application account is deleted. We may also retain limited records where necessary to comply with law or establish, exercise or defend legal claims.</p></section>
      <section><h2>8. Your choices and rights</h2><p>Depending on the law that applies to you, you may have rights to access, correct, erase, restrict or object to processing, receive portable data, and complain to a data-protection authority. My Passwords provides an account-information export and an in-app account-deletion request. You can also contact support for a privacy request.</p></section>
      <section><h2>9. Account deletion and local copies</h2><p>Deleting the cloud account does not remotely erase an encrypted local vault already stored in a browser or device. You should clear local vault data separately on devices you no longer control. Likewise, removing a verified device ends its account sessions but cannot remotely erase browser storage already on that device.</p></section>
      <section><h2>10. Essential cookies and browser storage</h2><p>My Passwords uses security/session cookies and browser storage that are necessary to provide login/session protection, the encrypted local vault, device identification, sync safety, CSRF protection, settings and optional Secure device unlock. My Passwords does not intentionally include advertising or behavioural-analytics trackers in the service described by this Policy. Clearing browser/site data can remove the local encrypted vault, device verification state or Secure device unlock material from that browser.</p></section>
      <section><h2>11. Security incidents and support</h2><p>Operational diagnostics are designed to use metadata rather than passwords, decrypted vault values or document contents. If you report a problem, send only the minimum information needed. Never send your master password, OTP, recovery code, card security code or decrypted vault content to support.</p></section>
    </LegalShell>
  );
}

function BillingTermsPage({ embedded = false }) {
  return (
    <LegalShell
      eyebrow="Subscriptions"
      title="Subscription, Cancellation & Refund Policy"
      intro="This Policy explains trials, recurring billing, subscription changes, cancellation, refunds, taxes, invoices and payment records for My Passwords."
      embedded={embedded}
    >
      <section><h2>1. Trial</h2><p>The public Personal plan may include a free trial for the number of days shown at signup. The trial starts after successful contact verification. No charge is made merely for creating the trial account, and a card is not required until you deliberately start a paid subscription through Stripe Checkout.</p></section>
      <section><h2>2. Prices and recurring billing</h2><p>Prices are shown in GBP unless the checkout expressly states otherwise. When you start a paid subscription, Stripe Checkout shows the price, billing frequency and payment details before you confirm. The subscription then renews automatically at the selected interval until cancellation takes effect.</p><p>Bank or card statements use the statement descriptor configured on the Stripe merchant account. The Stripe receipt or invoice is the authoritative payment record for the charge.</p></section>
      <section><h2>3. Taxes and VAT</h2><div className="legal-highlight"><CreditCard size={21} /><div><strong>Tax treatment depends on seller registrations and customer location</strong><p>Any tax that My Passwords is required and configured to collect must be presented through the payment flow and invoice. The public price display does not by itself promise that a price is tax-inclusive unless it expressly says so.</p></div></div><p>Customers are responsible for any taxes or bank charges that lawfully apply to them but are not collected by the seller. Where the seller is required and configured to collect VAT, GST, sales tax or a similar tax, the applicable tax should be shown in the Stripe payment flow and/or invoice.</p></section>
      <section><h2>4. Upgrades and changes</h2><p>A higher-plan upgrade can take effect immediately and Stripe may apply a prorated adjustment. A downgrade or change of billing frequency is normally scheduled for the next renewal. The exact change and effective date are shown for review before confirmation.</p></section>
      <section><h2>5. Cancellation</h2><p>You can schedule cancellation from Plan & Billing. Unless applicable law requires otherwise, cancellation takes effect at the end of the current paid billing period and no further renewal is scheduled. You can reactivate before the end date while the subscription is still active.</p></section>
      <section><h2>6. Refund policy</h2><p>Except where mandatory consumer law requires otherwise, subscription charges are not automatically refundable after a billing period has started simply because the customer no longer needs the service or forgot to cancel before renewal.</p><p>We will investigate duplicate charges, charges made after an effective cancellation, billing errors and other exceptional cases. Contact <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> promptly with the account email, invoice number and a description of the issue. Do not send full card details or your vault password.</p><p>If local law gives you a cooling-off, withdrawal or refund right that cannot be waived, that legal right takes priority over this policy.</p></section>
      <section><h2>7. Failed payments</h2><p>If a renewal payment fails, Stripe may retry the payment according to the configured billing settings. My Passwords may provide a grace period before paid cloud services are paused. The encrypted local vault remains separate from payment processing and still requires the master password.</p></section>
      <section><h2>8. Invoices and receipts</h2><p>Stripe generates and hosts subscription invoices and payment receipts. My Passwords displays available links to those Stripe records in Plan & Billing. Stripe records can include billing address, line items, taxes, payment status and receipt information. Customers should keep invoices needed for their own accounting or tax records.</p></section>
      <section><h2>9. Account deletion</h2><p>A deletion request does not create a refund for an already-started paid billing period. When deletion becomes due, an active Stripe subscription is cancelled before the cloud account is removed. Payment and invoice records may remain with Stripe where needed for accounting, disputes, fraud prevention or legal obligations.</p></section>
    </LegalShell>
  );
}

export default function LegalPage({ page, embedded = false }) {
  if (page === 'privacy') return <PrivacyPage embedded={embedded} />;
  if (page === 'billing') return <BillingTermsPage embedded={embedded} />;
  return <TermsPage embedded={embedded} />;
}
