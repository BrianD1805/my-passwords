-- My Passwords Ver-0.049
-- Automated Customer Emails delivery ledger.
-- Stores delivery metadata only. It never stores master passwords, decrypted vault
-- contents, encrypted vault payloads, document contents or full email bodies.

begin;

create table if not exists public.customer_email_log (
  id text primary key,
  tenant_id text references public.tenants(id) on delete set null,
  user_id text references public.users(id) on delete set null,
  email_type text not null,
  idempotency_key text not null unique,
  recipient_masked text,
  subject text not null default '',
  provider text not null default 'resend',
  provider_reference text,
  status text not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  error_message text,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customer_email_log_tenant_created
  on public.customer_email_log(tenant_id, created_at desc);

create index if not exists idx_customer_email_log_status_attempt
  on public.customer_email_log(status, last_attempt_at asc);

create index if not exists idx_customer_email_log_type_created
  on public.customer_email_log(email_type, created_at desc);

alter table public.customer_email_log enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.customer_email_log to service_role;

commit;
