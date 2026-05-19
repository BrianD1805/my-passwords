-- My Passwords Ver-0.011 account login foundation
-- Run this in Supabase SQL Editor before deploying Ver-0.011.
-- It preserves existing encrypted vault snapshots and adds account identity fields
-- needed for phone/email login and later SMS OTP delivery.

alter table public.users
  alter column email drop not null,
  alter column email set default '';

alter table public.users
  add column if not exists phone_country_code text,
  add column if not exists phone_number text,
  add column if not exists phone_e164 text,
  add column if not exists phone_verified boolean not null default false,
  add column if not exists email_verified boolean not null default false,
  add column if not exists account_login_method text not null default 'local_first';

create unique index if not exists idx_users_phone_e164_unique
  on public.users(phone_e164)
  where phone_e164 is not null and phone_e164 <> '';

create index if not exists idx_users_email on public.users(email);
create index if not exists idx_users_tenant_id on public.users(tenant_id);

-- Optional sanity check after running:
-- select id, tenant_id, email, phone_country_code, phone_number, phone_e164, phone_verified, email_verified, account_login_method from public.users order by created_at desc limit 10;
