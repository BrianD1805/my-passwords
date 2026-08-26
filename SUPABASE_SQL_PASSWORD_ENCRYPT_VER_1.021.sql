-- Password-Encrypt Ver-1.021 — Emergency Backup Codes
-- Stores only encrypted recovery envelopes and one-way code fingerprints.
-- Readable backup codes and the readable master password are never stored in this table.
-- Browser clients do not access this table directly; validated Netlify Functions use service_role.

create table if not exists public.emergency_backup_codes (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  batch_id text not null,
  code_hash text not null,
  wrap_salt text not null,
  wrap_iv text not null,
  wrapped_master_password text not null,
  status text not null default 'active'
    check (status in ('active', 'used', 'revoked')),
  reminders_enabled boolean not null default true,
  last_reminder_at timestamptz,
  emailed_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists emergency_backup_codes_account_hash_idx
  on public.emergency_backup_codes(tenant_id, user_id, code_hash);

create index if not exists emergency_backup_codes_account_status_idx
  on public.emergency_backup_codes(tenant_id, user_id, status, created_at desc);

create index if not exists emergency_backup_codes_batch_idx
  on public.emergency_backup_codes(batch_id);

alter table public.emergency_backup_codes enable row level security;

revoke all on table public.emergency_backup_codes from anon, authenticated;
grant select, insert, update, delete on public.emergency_backup_codes to service_role;
