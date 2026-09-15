-- New requests never notified the shops and providers they were for (E2E-019). notify_on_request matched
-- businesses.category_id / providers.category_id to requests.category_id exactly, but requests are posted with a
-- top-level group (c-home) while shops and providers pick a speciality (c-home-plumb, c-beauty-salon). Production:
-- every request has a top-level category, and the providers that set a category all use a speciality — so no
-- responder was ever notified. The console lists (Find work / Find requests) had the same exact match; fixed in the
-- app with the same rule (src/lib/categoryMatch.ts).
--
-- Live definition with only the category comparison changed. Grants restated (unchanged: trigger-only function).
-- Rollback: supabase/rollbacks/20260975_request_notifications_match_category_group.rollback.sql

CREATE OR REPLACE FUNCTION public.notify_on_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  delta double precision;
  v_meta jsonb;
  v_req_parent text;
  v_req_root text;
begin
  if new.lat is null or new.lng is null then
    return new;
  end if;
  delta := coalesce(new.radius_km, 5) / 111.0;

  v_meta := jsonb_build_object(
    'category', new.category_name,
    'imageUrl', new.photos[1],
    'amount', new.budget_max,
    'amountLabel', case when new.budget_min is not null and new.budget_max is not null
                        and new.budget_min <> new.budget_max
                     then '₹' || new.budget_min::text || '–' || new.budget_max::text
                     else 'Budget' end,
    'statusPill', case when coalesce(new.is_urgent, false) then 'Urgent' else null end,
    'tone', case when coalesce(new.is_urgent, false) then 'warning' else 'info' end
  );

  insert into public.notifications (user_id, type, title, body, deep_link, metadata)
  select u.id, 'NEARBY_REQUEST',
         'New request near you',
         coalesce(new.category_name, 'Someone') || ' needs help: "' || left(coalesce(new.title, new.description, 'a request'), 60) || '"',
         '/request/' || new.id,
         v_meta
    from public.users u
   where u.id <> new.requester_user_id
     and u.lat is not null and u.lng is not null
     and u.lat between new.lat - delta and new.lat + delta
     and u.lng between new.lng - delta and new.lng + delta
   limit 200;

  if new.category_id is not null then
    -- Requests carry a top-level group (c-home); shops and providers pick a speciality (c-home-plumb). Match on the
    -- group, or the exact speciality when both sides are specialities (same rule as src/lib/categoryMatch.ts).
    select c.parent_id into v_req_parent from public.categories c where c.id = new.category_id;
    v_req_root := coalesce(v_req_parent, new.category_id);

    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    select b.owner_user_id, 'NEARBY_REQUEST',
           'New ' || coalesce(new.category_name, 'request') || ' request',
           left(coalesce(new.title, new.description, 'A customer nearby needs help'), 80),
           '/business/' || b.id || '/manage/requests',
           v_meta
      from public.businesses b
      left join public.categories bc on bc.id = b.category_id
     where (b.category_id = new.category_id
            or ((bc.parent_id is null or v_req_parent is null) and coalesce(bc.parent_id, b.category_id) = v_req_root))
       and b.status = 'ACTIVE'
       and coalesce(b.owner_user_id, '') <> new.requester_user_id
       and b.lat is not null and b.lng is not null
       and b.lat between new.lat - delta and new.lat + delta
       and b.lng between new.lng - delta and new.lng + delta
     limit 200;

    insert into public.notifications (user_id, type, title, body, deep_link, metadata)
    select p.user_id, 'NEARBY_REQUEST',
           'New ' || coalesce(new.category_name, 'request') || ' request',
           left(coalesce(new.title, new.description, 'A customer nearby needs help'), 80),
           '/provider/' || p.id || '/manage/find-work',
           v_meta
      from public.providers p
      left join public.categories pc on pc.id = p.category_id
     where (p.category_id = new.category_id
            or ((pc.parent_id is null or v_req_parent is null) and coalesce(pc.parent_id, p.category_id) = v_req_root))
       and p.status = 'ACTIVE'
       and coalesce(p.user_id, '') <> new.requester_user_id
       and p.lat is not null and p.lng is not null
       and p.lat between new.lat - delta and new.lat + delta
       and p.lng between new.lng - delta and new.lng + delta
     limit 200;
  end if;

  return new;
end $function$;

revoke all on function public.notify_on_request() from public, anon, authenticated;
