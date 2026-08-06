-- Revoke anon EXECUTE on every SECURITY DEFINER function that does not need it.
--
-- Supabase's security advisor reported 31 SECURITY DEFINER functions callable by
-- the `anon` role over PostgREST (`/rest/v1/rpc/<name>`). Because a definer
-- function runs as its owner, an anonymous caller reaching one bypasses RLS
-- entirely — so this was not a theoretical grant. Anyone with the project's
-- publishable key could call, among others:
--
--   cancel_expired_agreements()   -- mutate agreement state at will
--   close_expired_requests()      -- close other people's open requests
--   increment_stamp()             -- mint loyalty stamps
--   grant_team_member_access()    -- attempt a business access grant
--   appointment_create_walk_in()  -- create bookings
--
-- Every caller in src/ was traced before writing this. Exactly two functions are
-- genuinely reached without a session and keep their anon grant:
--
--   get_tracking(text)        -- public /track/:token page; called on the
--                                deliberately anonymous client in
--                                screens/TrackingPage.tsx
--   resolve_admin_email(text) -- runs BEFORE sign-in on the admin login screen
--                                (lib/adminAuth.ts); already rate-limited via
--                                public.admin_login_resolve_attempts
--
-- Everything below is invoked through the authenticated client, so `authenticated`
-- retains EXECUTE and no application path changes. Trigger/event-trigger bodies
-- (enforce_business_location_freeze, rls_auto_enable, sync_request_me_too) never
-- depended on the grant at all — triggers fire as the table owner — so revoking
-- is pure hygiene there.
--
-- PostGIS's three st_estimatedextent overloads are extension-owned and left alone.
--
-- INCOMPLETE ON ITS OWN — see 20260882. Revoking from `anon` removes the
-- explicit anon ACL entry but not the implicit PUBLIC grant that anon inherits,
-- so this migration alone does not actually close the hole.

revoke execute on function public.appointment_create_walk_in(text,text,text,text,timestamp with time zone,text,text,text,text,numeric,jsonb) from anon;
revoke execute on function public.bump_business_metric(text,text) from anon;
revoke execute on function public.bump_provider_views(text) from anon;
revoke execute on function public.can_manage_business(text) from anon;
revoke execute on function public.cancel_expired_agreements() from anon;
revoke execute on function public.close_expired_requests() from anon;
revoke execute on function public.close_stale_queue_tokens() from anon;
revoke execute on function public.enforce_business_location_freeze() from anon;
revoke execute on function public.get_public_profile(text) from anon;
revoke execute on function public.grant_team_member_access(text,text,text[]) from anon;
revoke execute on function public.increment_stamp(text,text) from anon;
revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_admin(text) from anon;
revoke execute on function public.is_society_admin(uuid,text) from anon;
revoke execute on function public.is_society_member(uuid,text) from anon;
revoke execute on function public.my_business_access_scope(text) from anon;
revoke execute on function public.neighborhood_today(double precision,double precision,integer) from anon;
revoke execute on function public.notification_push_health() from anon;
revoke execute on function public.renew_location_share(text) from anon;
revoke execute on function public.request_location_share(text) from anon;
revoke execute on function public.reserve_catalog_item(text) from anon;
revoke execute on function public.respond_location_share(text,boolean) from anon;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.set_admin_login_id(text) from anon;
revoke execute on function public.suggest_business_login(text) from anon;
revoke execute on function public.sync_request_me_too() from anon;

-- NOTE for whoever adds the next function here: Postgres grants EXECUTE to
-- PUBLIC on creation and Supabase's anon inherits that, so a new SECURITY
-- DEFINER function is anon-callable the moment it exists. Add an explicit
-- `revoke execute on function ... from anon;` in the same migration unless the
-- function is genuinely meant to be reachable without a session.
