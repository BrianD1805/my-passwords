-- Password-Encrypt Ver-1.014 — First-Time Guided Help
-- Adds account-level guided-tour state. Existing users remain NULL so they are
-- not interrupted automatically; new accounts are created with not_started.

begin;

alter table public.users
  add column if not exists guided_tour_status text,
  add column if not exists guided_tour_version integer,
  add column if not exists guided_tour_updated_at timestamptz;

-- This table is accessed only by trusted server-side Netlify Functions.
grant select, insert, update, delete on public.users to service_role;

commit;
