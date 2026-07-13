-- 20260721 — requests get an optional sub_category, and posting a request now
-- notifies the sellers it's actually for: businesses & providers whose
-- category matches the request (within its radius), landing on their leads tab.
--
-- Before: notify_on_request() only fanned out a generic "New request near you"
-- to every nearby USER. Category-matched shops/providers had no targeted signal
-- and had to stumble onto the request in their Find-Requests list.

alter table if exists public.requests
  add column if not exists sub_category text;

create or replace function public.notify_on_request()
returns trigger as $$
declare
  delta double precision;
begin
  if new.lat is null or new.lng is null then
    return new;
  end if;
  delta := coalesce(new.radius_km, 5) / 111.0;

  -- (unchanged) generic nearby-neighbor notification
  insert into public.notifications (user_id, type, title, body, deep_link)
  select u.id, 'NEARBY_REQUEST',
         'New request near you',
         coalesce(new.category_name, 'Someone') || ' needs help: "' || left(coalesce(new.title, new.description, 'a request'), 60) || '"',
         '/request/' || new.id
    from public.users u
   where u.id <> new.requester_user_id
     and u.lat is not null and u.lng is not null
     and u.lat between new.lat - delta and new.lat + delta
     and u.lng between new.lng - delta and new.lng + delta
   limit 200;

  -- (new) category-targeted businesses — only when the request carries a
  -- category, matched shops inside the radius, deep-linked to their leads tab.
  if new.category_id is not null then
    insert into public.notifications (user_id, type, title, body, deep_link)
    select b.owner_user_id, 'NEARBY_REQUEST',
           'New ' || coalesce(new.category_name, 'request') || ' request',
           left(coalesce(new.title, new.description, 'A customer nearby needs help'), 80),
           '/business/' || b.id || '/manage/requests'
      from public.businesses b
     where b.category_id = new.category_id
       and b.status = 'ACTIVE'
       and coalesce(b.owner_user_id, '') <> new.requester_user_id
       and b.lat is not null and b.lng is not null
       and b.lat between new.lat - delta and new.lat + delta
       and b.lng between new.lng - delta and new.lng + delta
     limit 200;

    -- (new) category-targeted providers — deep-linked to their leads tab.
    insert into public.notifications (user_id, type, title, body, deep_link)
    select p.user_id, 'NEARBY_REQUEST',
           'New ' || coalesce(new.category_name, 'request') || ' request',
           left(coalesce(new.title, new.description, 'A customer nearby needs help'), 80),
           '/provider/' || p.id || '/manage/leads'
      from public.providers p
     where p.category_id = new.category_id
       and p.status = 'ACTIVE'
       and coalesce(p.user_id, '') <> new.requester_user_id
       and p.lat is not null and p.lng is not null
       and p.lat between new.lat - delta and new.lat + delta
       and p.lng between new.lng - delta and new.lng + delta
     limit 200;
  end if;

  return new;
end $$ language plpgsql security definer;

drop trigger if exists trg_notify_request on public.requests;
create trigger trg_notify_request
  after insert on public.requests
  for each row execute function public.notify_on_request();
