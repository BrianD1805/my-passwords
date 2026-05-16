-- My Passwords Ver-0.001 SaaS-ready database foundation
-- Run this once Netlify Database / Postgres is provisioned.
-- Sensitive values should be stored only inside encrypted_payload.

create extension if not exists pgcrypto;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  plan text not null default 'private_founder',
  status text not null default 'active',
  owner_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'member',
  status text not null default 'active',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

alter table tenants
  add constraint tenants_owner_user_fk foreign key (owner_user_id) references users(id) deferrable initially deferred;

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  icon text,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists vault_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  owner_user_id uuid references users(id) on delete set null,
  category_id uuid references categories(id) on delete set null,
  title text not null,
  search_title text,
  encrypted_payload text not null,
  encryption_version text not null default 'client-aes-gcm-v1',
  favourite boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists emergency_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  owner_user_id uuid references users(id) on delete cascade,
  emergency_user_email text not null,
  status text not null default 'invited',
  access_level text not null default 'selected_categories',
  waiting_period_days integer not null default 14,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists emergency_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  emergency_user_id uuid not null references emergency_users(id) on delete cascade,
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  unlock_after timestamptz not null,
  cancelled_at timestamptz,
  approved_at timestamptz
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  action text not null,
  item_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists vault_items_tenant_idx on vault_items(tenant_id);
create index if not exists vault_items_search_idx on vault_items using gin (to_tsvector('english', coalesce(search_title, title)));
create index if not exists audit_log_tenant_created_idx on audit_log(tenant_id, created_at desc);
