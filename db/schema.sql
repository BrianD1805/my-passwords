-- My Passwords Ver-0.003 Supabase schema
-- Run this in Supabase SQL Editor for the project used by the Netlify app.

create table if not exists public.tenants (
  id text primary key,
  name text not null unique,
  plan text not null default 'private_founder',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.users (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  email text not null,
  display_name text not null,
  role text not null default 'member',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create table if not exists public.categories (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  name text not null,
  icon text not null default 'folder',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists public.vault_items (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  owner_user_id text not null references public.users(id) on delete cascade,
  category_id text references public.categories(id) on delete set null,
  title text not null,
  encrypted_payload text not null,
  favourite boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vault_sync_snapshots (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  encrypted_blob text not null,
  local_salt text not null,
  local_iv text not null,
  item_count integer not null default 0,
  client_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.emergency_users (
  id text primary key,
  tenant_id text not null references public.tenants(id) on delete cascade,
  owner_user_id text not null references public.users(id) on delete cascade,
  emergency_user_email text not null,
  status text not null default 'invited',
  access_level text not null default 'none_until_approved',
  waiting_period_days integer not null default 14,
  created_at timestamptz not null default now()
);

create table if not exists public.emergency_requests (
  id text primary key,
  emergency_user_id text not null references public.emergency_users(id) on delete cascade,
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  unlock_after timestamptz,
  cancelled_at timestamptz,
  approved_at timestamptz
);

create table if not exists public.audit_log (
  id text primary key,
  tenant_id text references public.tenants(id) on delete cascade,
  user_id text references public.users(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_users_tenant_id on public.users(tenant_id);
create index if not exists idx_categories_tenant_id on public.categories(tenant_id);
create index if not exists idx_vault_items_tenant_id on public.vault_items(tenant_id);
create index if not exists idx_vault_sync_snapshots_tenant_user_created on public.vault_sync_snapshots(tenant_id, user_id, created_at desc);
create index if not exists idx_audit_log_tenant_created on public.audit_log(tenant_id, created_at desc);

-- Keep Row Level Security disabled for this foundation build because all writes are server-side
-- through Netlify Functions using the Supabase service role key. Do not expose the service role key
-- to frontend/browser code. RLS policies should be added when proper Supabase Auth is introduced.
