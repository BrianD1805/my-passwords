-- My Passwords Ver-0.036A
-- Emergency Access test reset only.
-- This clears Emergency Access invite/request records in Supabase so testing can restart from a clean server-side state.
-- It does NOT delete vault items, encrypted vault snapshots, document blobs, cards, passwords, users, or tenants.
-- It also cannot remove the encrypted Emergency Access plan stored inside the user's vault snapshot/local vault.

begin;

delete from public.emergency_access_requests;
delete from public.emergency_access_invitations;

commit;
