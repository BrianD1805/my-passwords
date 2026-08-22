-- Password-Encrypt Ver-1.020 — User Settings
-- Stores per-user preferences. Browser clients do not access this table directly;
-- Netlify Functions use the Supabase service role after validating the customer session.

create table if not exists public.user_settings (
  tenant_id text not null references public.tenants(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  secure_device_unlock_count integer not null default 10 check (secure_device_unlock_count between 1 and 999),
  never_force_password_again boolean not null default false,
  date_format text not null default 'dmy-text' check (date_format in ('dmy-numeric', 'mdy-numeric', 'dmy-text')),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

alter table public.user_settings enable row level security;

revoke all on table public.user_settings from anon, authenticated;
grant select, insert, update, delete on public.user_settings to service_role;

create index if not exists user_settings_user_id_idx on public.user_settings(user_id);
