-- My Passwords Ver-0.048
-- Admin Customer Operations.
-- Adds Admin notes and account-email delivery history only.
-- This migration does not expose, alter or decrypt encrypted vault contents.

begin;

create table if not exists public.admin_customer_notes (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  note text not null,
  created_by text not null default 'platform_admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_admin_customer_notes_tenant_created
  on public.admin_customer_notes(tenant_id, created_at desc);

create table if not exists public.admin_email_log (
  id text primary key,
  tenant_id text references public.tenants(id) on delete set null,
  user_id text references public.users(id) on delete set null,
  email_type text not null,
  recipient_masked text,
  provider text not null default 'resend',
  provider_reference text,
  status text not null default 'sent',
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_email_log_tenant_created
  on public.admin_email_log(tenant_id, created_at desc);

create index if not exists idx_admin_email_log_status_created
  on public.admin_email_log(status, created_at desc);

alter table public.admin_customer_notes enable row level security;
alter table public.admin_email_log enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.admin_customer_notes to service_role;
grant select, insert, update, delete on public.admin_email_log to service_role;

commit;
