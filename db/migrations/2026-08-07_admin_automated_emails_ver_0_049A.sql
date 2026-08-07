-- My Passwords Ver-0.049A
-- Admin Automated Emails processor-run history.
-- Stores email process metadata only; no vault contents or master passwords.

begin;

create table if not exists public.email_processor_runs (
  id text primary key,
  processor_type text not null check (processor_type in ('customer_lifecycle', 'emergency_access_release')),
  trigger_source text not null default 'scheduled' check (trigger_source in ('scheduled', 'admin')),
  status text not null default 'running' check (status in ('running', 'success', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  items_checked integer not null default 0 check (items_checked >= 0),
  email_actions integer not null default 0 check (email_actions >= 0),
  result_summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_processor_runs_type_started
  on public.email_processor_runs(processor_type, started_at desc);

create index if not exists idx_email_processor_runs_status_started
  on public.email_processor_runs(status, started_at desc);

alter table public.email_processor_runs enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.email_processor_runs to service_role;

commit;
