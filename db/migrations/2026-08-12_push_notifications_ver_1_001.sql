-- Password-Encrypt Ver-1.001 — Push Notifications
-- Push metadata only. Notification payloads must never contain vault secrets,
-- passwords, card values, document contents, master passwords, OTPs or recovery codes.

begin;

create table if not exists public.push_subscriptions (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  endpoint_hash text not null,
  p256dh text not null,
  auth_secret text not null,
  user_agent text not null default '',
  device_id text,
  status text not null default 'active' check (status in ('active', 'disabled')),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0),
  disabled_at timestamptz,
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user_active
  on public.push_subscriptions(user_id, status, updated_at desc);
create index if not exists idx_push_subscriptions_tenant_active
  on public.push_subscriptions(tenant_id, status, updated_at desc);
create index if not exists idx_push_subscriptions_endpoint_hash
  on public.push_subscriptions(endpoint_hash);

create table if not exists public.push_notification_templates (
  template_key text primary key,
  display_name text not null,
  description text not null default '',
  title text not null,
  body text not null,
  target_url text not null default '/vault',
  is_enabled boolean not null default true,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_notification_log (
  id text primary key,
  tenant_id text references public.tenants(id) on delete set null,
  user_id text references public.users(id) on delete set null,
  notification_type text not null,
  template_key text,
  title text not null default '',
  body_preview text not null default '',
  target_url text not null default '/vault',
  trigger_source text not null default 'system',
  subscriptions_targeted integer not null default 0 check (subscriptions_targeted >= 0),
  delivered integer not null default 0 check (delivered >= 0),
  failed integer not null default 0 check (failed >= 0),
  disabled_endpoints integer not null default 0 check (disabled_endpoints >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  retention_until timestamptz not null default (now() + interval '180 days')
);

create index if not exists idx_push_notification_log_created
  on public.push_notification_log(created_at desc);
create index if not exists idx_push_notification_log_tenant_created
  on public.push_notification_log(tenant_id, created_at desc);
create index if not exists idx_push_notification_log_retention
  on public.push_notification_log(retention_until);

insert into public.push_notification_templates
  (template_key, display_name, description, title, body, target_url, is_enabled)
values
  ('trusted_person_accepted', 'Trusted person accepted', 'Sent to the vault owner when their trusted person accepts the nomination.', 'Trusted Person invitation accepted', '{contactName} accepted your Trusted Person invitation. No vault information has been released.', '/vault?open=emergency', true),
  ('trusted_person_declined', 'Trusted person declined', 'Sent to the vault owner when their trusted person declines the nomination.', 'Trusted Person invitation declined', '{contactName} declined your Trusted Person invitation. Open Trusted Person Access to review the arrangement.', '/vault?open=emergency', true),
  ('emergency_access_requested', 'Emergency Access requested', 'Critical owner alert sent as soon as the trusted person starts Emergency Access.', 'Emergency Access request started', '{contactName} has requested Emergency Access. The {waitingPeriod} waiting period is now running. Open Password-Encrypt now to review or cancel the request.', '/vault?open=emergency', true),
  ('emergency_package_released', 'Emergency package released', 'Sent to the vault owner when the waiting period completes without cancellation.', 'Emergency package released', 'The waiting period ended without cancellation. Your prepared emergency package is now available to {contactName}.', '/vault?open=emergency', true),
  ('trusted_person_reminder_confirmed', 'Trusted person reminder confirmed', 'Sent to the vault owner when the trusted person confirms their routine reminder.', 'Trusted Person reminder confirmed', '{contactName} confirmed they are still happy to remain your Trusted Person.', '/vault?open=emergency', true)
on conflict (template_key) do nothing;

alter table public.push_subscriptions enable row level security;
alter table public.push_notification_templates enable row level security;
alter table public.push_notification_log enable row level security;

revoke all on table public.push_subscriptions, public.push_notification_templates,
  public.push_notification_log from anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.push_subscriptions to service_role;
grant select, insert, update, delete on public.push_notification_templates to service_role;
grant select, insert, update, delete on public.push_notification_log to service_role;

commit;
