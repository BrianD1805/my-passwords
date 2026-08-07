-- My Passwords Ver-0.050 — Security Hardening
-- Server-only security state, atomic rate limiting, request idempotency,
-- Stripe webhook replay protection, persistent Admin sessions and access review.
-- No browser/client role receives access to customer data tables.

begin;

create table if not exists public.security_rate_limits (
  scope text not null,
  identifier_hash text not null,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (scope, identifier_hash)
);

create index if not exists idx_security_rate_limits_blocked
  on public.security_rate_limits(blocked_until)
  where blocked_until is not null;

create table if not exists public.security_idempotency_keys (
  id text primary key,
  key text not null unique,
  scope text not null,
  request_hash text not null,
  tenant_id text references public.tenants(id) on delete cascade,
  user_id text references public.users(id) on delete set null,
  status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_security_idempotency_tenant_created
  on public.security_idempotency_keys(tenant_id, created_at desc);

create table if not exists public.admin_sessions (
  id text primary key,
  status text not null default 'active'
    check (status in ('active', 'revoked', 'expired', 'rotated')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  rotated_to_session_id text,
  ip_hash text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_sessions_status_expires
  on public.admin_sessions(status, expires_at);

create table if not exists public.stripe_webhook_events (
  id text primary key,
  event_id text not null unique,
  event_type text not null,
  status text not null default 'processing'
    check (status in ('processing', 'succeeded', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  first_received_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_stripe_webhook_events_status_updated
  on public.stripe_webhook_events(status, updated_at desc);

create or replace function public.consume_security_rate_limit(
  p_scope text,
  p_identifier_hash text,
  p_limit integer,
  p_window_seconds integer,
  p_block_seconds integer
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.security_rate_limits%rowtype;
  v_now timestamptz := now();
  v_limit integer := greatest(coalesce(p_limit, 1), 1);
  v_window integer := greatest(coalesce(p_window_seconds, 1), 1);
  v_block integer := greatest(coalesce(p_block_seconds, 1), 1);
  v_attempts integer;
  v_retry integer;
begin
  if coalesce(trim(p_scope), '') = '' or coalesce(trim(p_identifier_hash), '') = '' then
    raise exception 'Rate-limit scope and identifier are required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_scope || ':' || p_identifier_hash, 0));

  select * into v_row
  from public.security_rate_limits
  where scope = p_scope and identifier_hash = p_identifier_hash
  for update;

  if found and v_row.blocked_until is not null and v_row.blocked_until > v_now then
    v_retry := greatest(1, ceil(extract(epoch from (v_row.blocked_until - v_now)))::integer);
    return jsonb_build_object('allowed', false, 'remaining', 0, 'retry_after', v_retry);
  end if;

  if not found or v_row.window_started_at <= v_now - make_interval(secs => v_window) then
    insert into public.security_rate_limits(scope, identifier_hash, window_started_at, attempts, blocked_until, updated_at)
    values (p_scope, p_identifier_hash, v_now, 1, null, v_now)
    on conflict (scope, identifier_hash) do update
      set window_started_at = excluded.window_started_at,
          attempts = 1,
          blocked_until = null,
          updated_at = excluded.updated_at;
    return jsonb_build_object('allowed', true, 'remaining', greatest(v_limit - 1, 0), 'retry_after', 0);
  end if;

  v_attempts := v_row.attempts + 1;
  if v_attempts > v_limit then
    update public.security_rate_limits
       set attempts = v_attempts,
           blocked_until = v_now + make_interval(secs => v_block),
           updated_at = v_now
     where scope = p_scope and identifier_hash = p_identifier_hash;
    return jsonb_build_object('allowed', false, 'remaining', 0, 'retry_after', v_block);
  end if;

  update public.security_rate_limits
     set attempts = v_attempts,
         blocked_until = null,
         updated_at = v_now
   where scope = p_scope and identifier_hash = p_identifier_hash;

  return jsonb_build_object('allowed', true, 'remaining', greatest(v_limit - v_attempts, 0), 'retry_after', 0);
end;
$$;

create or replace function public.reset_security_rate_limit(
  p_scope text,
  p_identifier_hash text
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from public.security_rate_limits
   where scope = p_scope and identifier_hash = p_identifier_hash;
end;
$$;

create or replace function public.claim_stripe_webhook_event(
  p_event_id text,
  p_event_type text,
  p_stale_seconds integer default 300
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row public.stripe_webhook_events%rowtype;
  v_now timestamptz := now();
  v_stale integer := greatest(coalesce(p_stale_seconds, 300), 30);
  v_id text;
begin
  if coalesce(trim(p_event_id), '') = '' then
    raise exception 'Stripe event ID is required.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stripe-webhook:' || p_event_id, 0));

  select * into v_row
    from public.stripe_webhook_events
   where event_id = p_event_id
   for update;

  if found and v_row.status = 'succeeded' then
    return jsonb_build_object('claimed', false, 'duplicate', true, 'reason', 'succeeded', 'row_id', v_row.id);
  end if;

  if found and v_row.status = 'processing'
     and coalesce(v_row.updated_at, v_row.last_attempt_at, v_row.created_at) > v_now - make_interval(secs => v_stale) then
    return jsonb_build_object('claimed', false, 'duplicate', true, 'reason', 'processing', 'row_id', v_row.id);
  end if;

  if found then
    update public.stripe_webhook_events
       set event_type = coalesce(nullif(trim(p_event_type), ''), event_type),
           status = 'processing',
           attempts = attempts + 1,
           error_message = null,
           last_attempt_at = v_now,
           updated_at = v_now
     where id = v_row.id;
    return jsonb_build_object('claimed', true, 'duplicate', false, 'reason', 'retry', 'row_id', v_row.id);
  end if;

  v_id := 'stripe_webhook_' || p_event_id;
  insert into public.stripe_webhook_events(
    id, event_id, event_type, status, attempts, first_received_at, last_attempt_at, created_at, updated_at
  ) values (
    v_id, p_event_id, coalesce(nullif(trim(p_event_type), ''), 'unknown'), 'processing', 1, v_now, v_now, v_now, v_now
  );

  return jsonb_build_object('claimed', true, 'duplicate', false, 'reason', 'new', 'row_id', v_id);
end;
$$;

-- All customer and security data is server-only. Netlify Functions use the
-- Supabase service role; anon/authenticated browser roles receive no table access.
alter table public.tenants enable row level security;
alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.vault_items enable row level security;
alter table public.vault_sync_snapshots enable row level security;
alter table public.vault_sync_events enable row level security;
alter table public.document_blobs enable row level security;
alter table public.emergency_users enable row level security;
alter table public.emergency_requests enable row level security;
alter table public.emergency_access_invitations enable row level security;
alter table public.emergency_access_requests enable row level security;
alter table public.audit_log enable row level security;
alter table public.otp_challenges enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.account_devices enable row level security;
alter table public.account_sessions enable row level security;
alter table public.account_contact_changes enable row level security;
alter table public.account_deletion_requests enable row level security;
alter table public.sms_delivery_log enable row level security;
alter table public.admin_customer_notes enable row level security;
alter table public.admin_email_log enable row level security;
alter table public.customer_email_log enable row level security;
alter table public.email_processor_runs enable row level security;
alter table public.security_rate_limits enable row level security;
alter table public.security_idempotency_keys enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.stripe_webhook_events enable row level security;

revoke all on table public.tenants, public.users, public.categories, public.vault_items,
  public.vault_sync_snapshots, public.vault_sync_events, public.document_blobs,
  public.emergency_users, public.emergency_requests, public.emergency_access_invitations,
  public.emergency_access_requests, public.audit_log, public.otp_challenges,
  public.subscription_plans, public.tenant_subscriptions, public.billing_events,
  public.account_devices, public.account_sessions, public.account_contact_changes,
  public.account_deletion_requests, public.sms_delivery_log, public.admin_customer_notes,
  public.admin_email_log, public.customer_email_log, public.email_processor_runs,
  public.security_rate_limits, public.security_idempotency_keys, public.admin_sessions,
  public.stripe_webhook_events
from public, anon, authenticated;

revoke all on table public.security_rate_limits, public.security_idempotency_keys,
  public.admin_sessions, public.stripe_webhook_events from public;

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.tenants, public.users, public.categories,
  public.vault_items, public.vault_sync_snapshots, public.vault_sync_events, public.document_blobs,
  public.emergency_users, public.emergency_requests, public.emergency_access_invitations,
  public.emergency_access_requests, public.audit_log, public.otp_challenges,
  public.subscription_plans, public.tenant_subscriptions, public.billing_events,
  public.account_devices, public.account_sessions, public.account_contact_changes,
  public.account_deletion_requests, public.sms_delivery_log, public.admin_customer_notes,
  public.admin_email_log, public.customer_email_log, public.email_processor_runs,
  public.security_rate_limits, public.security_idempotency_keys, public.admin_sessions,
  public.stripe_webhook_events
  to service_role;

revoke execute on function public.consume_security_rate_limit(text, text, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.reset_security_rate_limit(text, text) from public, anon, authenticated;
revoke execute on function public.claim_stripe_webhook_event(text, text, integer) from public, anon, authenticated;
grant execute on function public.consume_security_rate_limit(text, text, integer, integer, integer) to service_role;
grant execute on function public.reset_security_rate_limit(text, text) to service_role;
grant execute on function public.claim_stripe_webhook_event(text, text, integer) to service_role;

-- The atomic snapshot save RPC must remain server-only too.
revoke execute on function public.save_vault_snapshot_if_current(
  text, text, text, text, text, text, integer, timestamptz, text, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.save_vault_snapshot_if_current(
  text, text, text, text, text, text, integer, timestamptz, text, text, text, boolean
) to service_role;

commit;
