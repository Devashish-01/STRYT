-- Fix: business visibility toggle, "temporarily close shop", and the queue
-- on/off toggle all failed with:
--   ERROR: permission denied for function has_business_full_access
--   ERROR: permission denied for function has_business_scope
--
-- These SECURITY DEFINER helpers are invoked by the delegated-access RLS
-- policies added in 20260841_business_team_scopes.sql:
--   * public.businesses     -> policy delegated_access_businesses (UPDATE)
--                              uses has_business_full_access(id, auth.uid())
--   * public.queue_settings  -> policy delegated_access_queue_settings (ALL)
--                              uses has_business_scope(business_id, auth.uid(), 'queue')
--
-- When Postgres evaluates an RLS policy that calls a function the current role
-- (authenticated / anon) cannot EXECUTE, it aborts the ENTIRE statement — so
-- owners and employees could not write to businesses or queue_settings at all.
-- The sibling helper can_manage_business() was already granted to these roles;
-- mirror that here. The functions are SECURITY DEFINER and only return a
-- boolean derived from their arguments, so exposing EXECUTE leaks nothing.

GRANT EXECUTE ON FUNCTION public.has_business_full_access(text, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_business_scope(text, text, text) TO authenticated, anon;
