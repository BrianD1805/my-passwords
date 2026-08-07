-- My Passwords Ver-0.051 — Reliability, Monitoring and Recovery
-- Operational telemetry is metadata-only. These tables must never contain vault
-- ciphertext, decrypted vault values, document contents, master passwords, OTPs,
-- recovery codes, cookies, session tokens or provider secrets.

begin;

create table if not exists public.operational_events (
  id text primary key,
  tenant_id text references public.tenants(id) on delete set null,
  user_id text references public.users(id) on delete set null,
  source text not null,
  event_type text not null,
  severity text not null default 'info'
    check (severity in ('info', 'warning', 'error', 'critical')),
  status text not null default 'open'
    check (status in ('open', 'resolved')),
  error_code text,
  message text not null default '',
  fingerprint text,
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_note text,
  retention_until timestamptz not null default (now() + interval '180 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_operational_events_status_severity_seen
  on public.operational_events(status, severity, last_seen_at desc);
create index if not exists idx_operational_events_source_type_seen
  on public.operational_events(source, event_type, last_seen_at desc);
create index if not exists idx_operational_events_tenant_seen
  on public.operational_events(tenant_id, last_seen_at desc);
create index if not exists idx_operational_events_fingerprint_open
  on public.operational_events(fingerprint, last_seen_at desc)
  where status = 'open' and fingerprint is not null;
create index if not exists idx_operational_events_retention
  on public.operational_events(retention_until);

create table if not exists public.scheduled_check_runs (
  id text primary key,
  check_type text not null,
  trigger_source text not null default 'scheduled'
    check (trigger_source in ('scheduled', 'admin')),
  status text not null default 'running'
    check (status in ('running', 'success', 'warning', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_checked integer not null default 0 check (items_checked >= 0),
  issues_found integer not null default 0 check (issues_found >= 0),
  result_summary jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_scheduled_check_runs_type_started
  on public.scheduled_check_runs(check_type, started_at desc);
create index if not exists idx_scheduled_check_runs_status_started
  on public.scheduled_check_runs(status, started_at desc);

create table if not exists public.stripe_reconciliation_runs (
  id text primary key,
  tenant_id text references public.tenants(id) on delete set null,
  subscription_id text references public.tenant_subscriptions(id) on delete set null,
  provider_subscription_id text,
  trigger_source text not null default 'admin'
    check (trigger_source = 'admin'),
  status text not null default 'preview'
    check (status in ('preview', 'applied', 'expired', 'failed')),
  local_snapshot jsonb not null default '{}'::jsonb,
  provider_snapshot jsonb not null default '{}'::jsonb,
  changes jsonb not null default '[]'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_stripe_reconciliation_tenant_started
  on public.stripe_reconciliation_runs(tenant_id, started_at desc);
create index if not exists idx_stripe_reconciliation_status_expires
  on public.stripe_reconciliation_runs(status, expires_at);

alter table public.operational_events enable row level security;
alter table public.scheduled_check_runs enable row level security;
alter table public.stripe_reconciliation_runs enable row level security;

revoke all on table public.operational_events, public.scheduled_check_runs,
  public.stripe_reconciliation_runs from anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.operational_events to service_role;
grant select, insert, update, delete on public.scheduled_check_runs to service_role;
grant select, insert, update, delete on public.stripe_reconciliation_runs to service_role;

commit;
