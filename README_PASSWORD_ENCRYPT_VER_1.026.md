# Password-Encrypt Ver-1.026

## Netlify scheduled-usage optimisation

- Changes `emergency-access-release-process` from every 5 minutes to every 15 minutes.
- Changes `operations-health-check` from every 15 minutes to every 30 minutes.
- Changes `account-trial-check` from every 30 minutes to every 4 hours.
- Keeps `customer-lifecycle-email-process` hourly.
- Keeps all five daily scheduled jobs unchanged.
- Reduces scheduled Netlify Function invocations from approximately 13,830 to 5,370 per 30-day month: a saving of approximately 8,460 invocations, or 61%.

## Emergency Access safeguards

- Every scheduled run still records a lightweight health heartbeat.
- The heavier email processor run record is created only when at least one request is due.
- Existing release-state validation, owner cancellation protection, 30-day package expiry, email delivery, push notification and retry safeguards remain unchanged.
- The trusted-person access route can still mark a package ready immediately when the waiting period has expired.

## Health-check efficiency

- Emergency Access health now uses the lightweight scheduled heartbeat, including no-work runs.
- The stale tolerance is 45 minutes for the new 15-minute schedule, avoiding false alerts from one delayed run.
- Healthy conditions only trigger resolution queries when a matching open operational event actually exists.
- Customer lifecycle health reads only recent lifecycle processor records.

## Admin and scope protection

- Admin shows the new 15-minute Emergency Access schedule and its latest successful heartbeat.
- Onboarding flow logic is unchanged.
- No Supabase SQL migration is required.

## Version alignment

- App: Password-Encrypt Ver-1.026
- package.json/package-lock.json: 1.26.0
- Service worker cache: my-passwords-v1.026
- Server APP_VERSION: Password-Encrypt Ver-1.026
