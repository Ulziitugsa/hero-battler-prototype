-- Fixes a real bug found while testing: Supabase's automatic default privileges for `service_role`
-- (full access to every public-schema table) only apply to tables created through the dashboard/Studio,
-- not to tables created via a pasted/CLI SQL migration - so 0001 never actually granted `service_role`
-- anything, even though BYPASSRLS lets it skip RLS. BYPASSRLS and table-level GRANTs are separate
-- mechanisms; api/_lib/supabaseAdmin.ts's service-role client needs explicit grants on all three tables.

grant select, insert, update, delete on public.friendly_rooms to service_role;
grant select, insert, update, delete on public.friendly_matches to service_role;
grant select, insert, update, delete on public.friendly_match_pings to service_role;
