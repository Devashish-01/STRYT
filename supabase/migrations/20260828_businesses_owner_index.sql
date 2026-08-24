-- businesses.owner_user_id has no index despite being the filter column for
-- businessService.mine() (`WHERE owner_user_id = auth.uid()`) — the query
-- behind "which businesses do I own", called from the account switcher on
-- nearly every screen (useAccountOptions, HatSwitcherCard, ManageHub,
-- BusinessAccess). Table is small today (~20 rows) so this costs nothing to
-- add now and nothing to skip — added while it's free, before growth makes
-- a missing index on the busiest lookup in the app an actual incident.

create index if not exists businesses_owner_idx on public.businesses (owner_user_id);
