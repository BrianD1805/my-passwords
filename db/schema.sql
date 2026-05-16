-- My Passwords Ver-0.002E
-- SaaS-ready Netlify Database / Postgres schema.
-- IMPORTANT: Sensitive fields are stored as encrypted blobs only.
-- Do not add plain-text password, bank PIN, API secret, or recovery-code columns.

create table if not exists tenants (
  id text primary key,
  name text not null unique,
  plan text not null default 'private_founder',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  email text not null,
  display_name text not null,
  role text not null default 'administrator',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create table if not exists categories (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  name text not null,
  icon text not null default 'folder',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table if not exists vault_items (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  owner_user_id text not null references users(id) on delete cascade,
  category_id text references categories(id) on delete set null,
  title_search text,
  encrypted_payload text not null,
  encrypted_payload_version text not null default 'aes-gcm-browser-v1',
  favourite boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ver-0.002 encrypted sync foundation.
-- This table stores a full encrypted browser vault snapshot.
-- The server/database cannot read the original secrets without the user's master password.
create table if not exists vault_sync_snapshots (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  encrypted_blob text not null,
  local_salt text not null,
  local_iv text not null,
  item_count integer not null default 0,
  client_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_vault_sync_snapshots_tenant_user_created
on vault_sync_snapshots (tenant_id, user_id, created_at desc);

create table if not exists emergency_users (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  owner_user_id text not null references users(id) on delete cascade,
  emergency_user_email text not null,
  status text not null default 'pending',
  access_level text not null default 'selected_categories',
  waiting_period_days integer not null default 14,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists emergency_requests (
  id text primary key,
  tenant_id text not null references tenants(id) on delete cascade,
  emergency_user_id text not null references emergency_users(id) on delete cascade,
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  unlock_after timestamptz,
  cancelled_at timestamptz,
  approved_at timestamptz
);

create table if not exists audit_log (
  id text primary key,
  tenant_id text references tenants(id) on delete cascade,
  user_id text references users(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_users_tenant_email on users (tenant_id, email);
create index if not exists idx_vault_items_tenant_owner on vault_items (tenant_id, owner_user_id);
create index if not exists idx_audit_log_tenant_created on audit_log (tenant_id, created_at desc);
