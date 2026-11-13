-- Rollback for 20261017_dormant_tables_read_only.sql — restores the Supabase default grants that were live before it.
grant insert, update, delete, truncate on public.subscriptions      to anon, authenticated;
grant insert, update, delete, truncate on public.subscription_logs  to anon, authenticated;
grant insert, update, delete, truncate on public.pro_payments       to anon, authenticated;

notify pgrst, 'reload schema';
