-- Rollback for users_phone_column_lockdown.sql
--
-- Restores the column grant 20260968 left in place.
-- ⚠ Re-opens: any signed-in user can read every visible user's phone number.

grant select (phone) on public.users to authenticated;

notify pgrst, 'reload schema';
